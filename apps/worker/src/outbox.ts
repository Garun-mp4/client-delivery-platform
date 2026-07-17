import type { Pool, PoolClient } from 'pg';
import nodemailer from 'nodemailer';

import { decryptOutboxSecret } from '@garun/auth/crypto';
import type { WorkerEnvironment } from '@garun/config';

interface ClaimedEvent {
  id: string;
  workspaceId: string | null;
  payload: {
    template: 'workspace-invitation' | 'project-invitation' | 'magic-link' | 'domain-event';
    recipientUserId?: string;
    invitationId?: string;
  };
  encryptedSecret: string | null;
  attempts: number;
}

export function outboxMessageId(eventId: string): string {
  return `<${eventId}@garun.local>`;
}

export function outboxRetry(attempts: number) {
  return {
    retrySeconds: Math.min(3600, 2 ** Math.min(attempts, 10)),
    terminal: attempts >= 8,
  } as const;
}

async function claim(pool: Pool): Promise<ClaimedEvent | null> {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    await connection.query(
      "update outbox_event set status = 'pending', locked_at = null, available_at = now(), updated_at = now() where status = 'processing' and locked_at < now() - interval '5 minutes'",
    );
    const result = await connection.query<ClaimedEvent>(`
      select id, workspace_id as "workspaceId", payload, encrypted_secret as "encryptedSecret", attempts
      from outbox_event
      where status = 'pending' and available_at <= now()
      order by created_at
      for update skip locked
      limit 1
    `);
    const event = result.rows[0];
    if (!event) {
      await connection.query('commit');
      return null;
    }
    await connection.query(
      "update outbox_event set status = 'processing', attempts = attempts + 1, locked_at = now(), updated_at = now() where id = $1",
      [event.id],
    );
    await connection.query('commit');
    return { ...event, attempts: event.attempts + 1 };
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
}

async function resolveRecipient(connection: PoolClient, event: ClaimedEvent) {
  if (
    (event.payload.template === 'workspace-invitation' ||
      event.payload.template === 'project-invitation') &&
    event.payload.invitationId &&
    event.workspaceId
  ) {
    const result = await connection.query<{
      email: string;
      workspaceName: string;
      projectName: string | null;
    }>(
      `select i.email, w.name as "workspaceName", p.name as "projectName"
       from invitation i
       join workspace w on w.id = i.workspace_id
       left join invitation_project_grant g on g.invitation_id = i.id and g.workspace_id = i.workspace_id
       left join project p on p.id = g.project_id and p.workspace_id = g.workspace_id
       where i.id = $1 and i.workspace_id = $2
       order by g.created_at
       limit 1`,
      [event.payload.invitationId, event.workspaceId],
    );
    const row = result.rows[0];
    return row
      ? {
          email: row.email,
          subject: row.projectName
            ? `Приглашение в проект «${row.projectName}»`
            : `Приглашение в ${row.workspaceName}`,
          text: row.projectName
            ? `Вас пригласили в проект «${row.projectName}» рабочего пространства «${row.workspaceName}». Откройте одноразовую ссылку: `
            : `Вас пригласили в рабочее пространство «${row.workspaceName}». Откройте одноразовую ссылку: `,
        }
      : null;
  }
  if (event.payload.template === 'magic-link' && event.payload.recipientUserId) {
    const result = await connection.query<{ email: string }>(
      'select email from "user" where id = $1 and status = \'active\'',
      [event.payload.recipientUserId],
    );
    const row = result.rows[0];
    return row
      ? {
          email: row.email,
          subject: 'Ссылка для входа в Garun Workspace',
          text: 'Откройте одноразовую ссылку для входа: ',
        }
      : null;
  }
  return null;
}

export function startOutboxDispatcher(
  pool: Pool,
  environment: WorkerEnvironment,
  logger: {
    info: (value: object, message: string) => void;
    warn: (value: object, message: string) => void;
    error: (value: object, message: string) => void;
  },
) {
  const transport = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_SECURE,
  });
  let running = false;
  const dispatch = async () => {
    if (running) return;
    running = true;
    let event: ClaimedEvent | null = null;
    try {
      event = await claim(pool);
      if (!event) return;
      const connection = await pool.connect();
      try {
        if (event.payload.template !== 'domain-event') {
          const recipient = await resolveRecipient(connection, event);
          if (!recipient || !event.encryptedSecret) throw new Error('RECIPIENT_NOT_FOUND');
          const link = decryptOutboxSecret(
            event.encryptedSecret,
            environment.OUTBOX_ENCRYPTION_KEY,
          );
          await transport.sendMail({
            from: environment.EMAIL_FROM,
            to: recipient.email,
            subject: recipient.subject,
            text: `${recipient.text}${link}`,
            messageId: outboxMessageId(event.id),
          });
        }
        await connection.query(
          "update outbox_event set status = 'delivered', delivered_at = now(), encrypted_secret = null, locked_at = null, last_error_code = null, updated_at = now() where id = $1",
          [event.id],
        );
      } finally {
        connection.release();
      }
      logger.info(
        { outboxEventId: event.id, workspaceId: event.workspaceId },
        event.payload.template === 'domain-event'
          ? 'Outbox domain event acknowledged'
          : 'Outbox email delivered',
      );
    } catch {
      if (event) {
        const { retrySeconds, terminal } = outboxRetry(event.attempts);
        await pool.query(
          "update outbox_event set status = $2, available_at = now() + ($3 * interval '1 second'), locked_at = null, last_error_code = 'EMAIL_DELIVERY_FAILED', updated_at = now() where id = $1",
          [event.id, terminal ? 'failed' : 'pending', retrySeconds],
        );
        logger.warn(
          {
            outboxEventId: event.id,
            workspaceId: event.workspaceId,
            errorCode: 'EMAIL_DELIVERY_FAILED',
            terminal,
          },
          'Outbox email delivery failed',
        );
      } else {
        logger.error({ errorCode: 'OUTBOX_POLL_FAILED' }, 'Outbox polling failed');
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void dispatch(), 2_000);
  timer.unref();
  void dispatch();
  return () => clearInterval(timer);
}

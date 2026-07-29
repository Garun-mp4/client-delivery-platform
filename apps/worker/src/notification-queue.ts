import { Queue, Worker, type Job } from 'bullmq';
import nodemailer from 'nodemailer';
import type { Pool, PoolClient } from 'pg';

import { decryptOutboxSecret } from '@garun/auth/crypto';
import type { WorkerEnvironment } from '@garun/config';
import { isInsideQuietHours, notificationPresentation } from '@garun/core/notifications';

interface OutboxRow {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: {
    readonly template:
      | 'workspace-invitation'
      | 'project-invitation'
      | 'magic-link'
      | 'material-request'
      | 'domain-event';
    readonly recipientUserId?: string;
    readonly invitationId?: string;
    readonly projectId?: string;
    readonly entityType?: string;
  };
  readonly encryptedSecret: string | null;
}

interface NotificationTarget {
  readonly userId: string;
  readonly actorUserId: string | null;
  readonly workspaceSlug: string;
  readonly projectId: string;
  readonly projectSlug: string;
  readonly projectName: string;
  readonly deepLinkPath: string;
}

interface PendingDelivery {
  readonly id: string;
  readonly availableAt: Date;
}

interface Logger {
  info: (value: object, message: string) => void;
  warn: (value: object, message: string) => void;
  error: (value: object, message: string) => void;
}

export interface MailTransport {
  sendMail: (
    options: Parameters<ReturnType<typeof nodemailer.createTransport>['sendMail']>[0],
  ) => Promise<unknown>;
}

export function outboxMessageId(eventId: string): string {
  return `<${eventId}@garun.local>`;
}

export function outboxRetry(attempts: number) {
  return {
    retrySeconds: Math.min(3_600, 2 ** Math.min(attempts, 10)),
    terminal: attempts >= 8,
  } as const;
}

function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isInteger(database) ? database : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function resolveDirectEmail(connection: PoolClient, event: OutboxRow, publicAppUrl: string) {
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
       order by g.created_at limit 1`,
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
            ? `Вас пригласили в проект «${row.projectName}». Откройте одноразовую ссылку: `
            : 'Вас пригласили в рабочее пространство. Откройте одноразовую ссылку: ',
        }
      : null;
  }
  if (event.payload.template === 'magic-link' && event.payload.recipientUserId) {
    const result = await connection.query<{ email: string }>(
      'select email from "user" where id = $1 and status = \'active\'',
      [event.payload.recipientUserId],
    );
    return result.rows[0]
      ? {
          email: result.rows[0].email,
          subject: 'Ссылка для входа в Garun Workspace',
          text: 'Откройте одноразовую ссылку для входа: ',
        }
      : null;
  }
  if (
    event.payload.template === 'material-request' &&
    event.payload.recipientUserId &&
    event.payload.projectId &&
    event.workspaceId
  ) {
    const result = await connection.query<{
      email: string;
      projectName: string;
      workspaceSlug: string;
      projectSlug: string;
    }>(
      `select u.email, p.name as "projectName", w.slug as "workspaceSlug", p.slug as "projectSlug"
       from "user" u
       join workspace_membership wm on wm.user_id = u.id and wm.workspace_id = $3 and wm.status = 'active'
       join workspace w on w.id = wm.workspace_id
       join project p on p.id = $2 and p.workspace_id = wm.workspace_id
       where u.id = $1 and u.status = 'active'`,
      [event.payload.recipientUserId, event.payload.projectId, event.workspaceId],
    );
    const row = result.rows[0];
    return row
      ? {
          email: row.email,
          subject: `Нужны материалы для проекта «${row.projectName}»`,
          text: `Откройте запрос материалов: ${publicAppUrl}/workspace/${encodeURIComponent(row.workspaceSlug)}/projects/${encodeURIComponent(row.projectSlug)}/materials`,
        }
      : null;
  }
  return null;
}

async function eventActor(connection: PoolClient, event: OutboxRow): Promise<string | null> {
  const result = await connection.query<{ actorUserId: string | null }>(
    `select actor_user_id as "actorUserId" from audit_event
     where workspace_id = $1 and entity_id = $2
     order by created_at desc limit 1`,
    [event.workspaceId, event.aggregateId],
  );
  return result.rows[0]?.actorUserId ?? null;
}

function eventRoute(eventType: string, workspaceSlug: string, projectSlug: string): string {
  const root = `/workspace/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectSlug)}`;
  if (eventType.startsWith('approval.')) return `${root}/approvals`;
  if (eventType.startsWith('site_version.') || eventType.startsWith('feedback.')) {
    return `${root}/review`;
  }
  if (eventType.startsWith('material.')) return `${root}/materials`;
  if (eventType.startsWith('action.')) return `${root}/workflow`;
  return root;
}

async function resolveNotificationTargets(
  connection: PoolClient,
  event: OutboxRow,
): Promise<NotificationTarget[]> {
  if (!event.workspaceId || !event.payload.projectId) return [];
  const actorUserId = await eventActor(connection, event);
  const base = [event.workspaceId, event.payload.projectId, actorUserId, event.aggregateId];
  const common = `
    select distinct target.user_id as "userId", $3::uuid as "actorUserId",
      w.slug as "workspaceSlug", p.id as "projectId", p.slug as "projectSlug", p.name as "projectName"
    from project p join workspace w on w.id = p.workspace_id
    join lateral (`;
  const suffix = `) target on true
    join "user" u on u.id = target.user_id and u.status = 'active'
    join workspace_membership wm on wm.workspace_id = p.workspace_id
      and wm.user_id = target.user_id and wm.status = 'active'
    where p.workspace_id = $1 and p.id = $2 and $4::uuid is not null
      and target.user_id is distinct from $3::uuid
      and (
        wm.role = 'owner'
        or exists (
          select 1 from project_membership eligible_pm
          where eligible_pm.workspace_id = p.workspace_id
            and eligible_pm.project_id = p.id
            and eligible_pm.user_id = target.user_id
            and eligible_pm.removed_at is null
        )
      )`;
  let targetSql: string;
  if (event.eventType === 'action.created') {
    targetSql = `select ai.assignee_user_id as user_id from action_item ai
      where ai.id = $4 and ai.project_id = p.id and ai.workspace_id = p.workspace_id`;
  } else if (event.eventType === 'material.requested') {
    targetSql = `select m.requested_from_user_id as user_id from material m
      where m.id = $4 and m.project_id = p.id and m.workspace_id = p.workspace_id`;
  } else if (event.eventType === 'approval.requested') {
    targetSql = `select ara.user_id from approval_request_approver ara
      where ara.approval_request_id = $4 and ara.project_id = p.id and ara.workspace_id = p.workspace_id`;
  } else if (
    event.eventType === 'approval.approved' ||
    event.eventType === 'approval.changes_requested'
  ) {
    targetSql = `select ar.requested_by_user_id as user_id from approval_request ar
      where ar.id = $4 and ar.project_id = p.id and ar.workspace_id = p.workspace_id`;
  } else if (event.eventType === 'feedback.created') {
    targetSql = `select pm.user_id from project_membership pm
      where pm.project_id = p.id and pm.workspace_id = p.workspace_id
        and pm.side = 'internal' and pm.removed_at is null
      union
      select owner_wm.user_id from workspace_membership owner_wm
      where owner_wm.workspace_id = p.workspace_id
        and owner_wm.role = 'owner' and owner_wm.status = 'active'`;
  } else if (event.eventType === 'feedback.comment_added') {
    targetSql = `select pm.user_id
      from comment c
      join feedback_item fi on fi.id = c.feedback_item_id and fi.project_id = p.id
      join project_membership author_pm on author_pm.project_id = p.id
        and author_pm.user_id = c.author_user_id and author_pm.removed_at is null
      join project_membership pm on pm.project_id = p.id
        and pm.workspace_id = p.workspace_id and pm.removed_at is null
      where c.id = $4 and c.visibility = 'client'
        and (
          (author_pm.side = 'client' and pm.side = 'internal')
          or (author_pm.side = 'internal' and pm.user_id = fi.created_by_user_id)
        )
      union
      select owner_wm.user_id
      from comment c
      join project_membership author_pm on author_pm.project_id = p.id
        and author_pm.user_id = c.author_user_id and author_pm.removed_at is null
      join workspace_membership owner_wm on owner_wm.workspace_id = p.workspace_id
        and owner_wm.role = 'owner' and owner_wm.status = 'active'
      where c.id = $4 and c.visibility = 'client' and author_pm.side = 'client'`;
  } else if (
    event.eventType === 'site_version.published' ||
    event.eventType === 'project.completed' ||
    event.eventType === 'project.archived'
  ) {
    targetSql = `select pm.user_id from project_membership pm
      where pm.project_id = p.id and pm.workspace_id = p.workspace_id and pm.removed_at is null`;
    targetSql += ` union
      select owner_wm.user_id from workspace_membership owner_wm
      where owner_wm.workspace_id = p.workspace_id
        and owner_wm.role = 'owner' and owner_wm.status = 'active'`;
  } else {
    return [];
  }
  const result = await connection.query<Omit<NotificationTarget, 'deepLinkPath'>>(
    common + targetSql + suffix,
    base,
  );
  return result.rows.map((row) => ({
    ...row,
    deepLinkPath: eventRoute(event.eventType, row.workspaceSlug, row.projectSlug),
  }));
}

async function materializeNotifications(
  connection: PoolClient,
  event: OutboxRow,
): Promise<PendingDelivery[]> {
  const targets = await resolveNotificationTargets(connection, event);
  const deliveries: PendingDelivery[] = [];
  for (const target of targets) {
    const inserted = await connection.query<{ id: string }>(
      `insert into notification_event
        (workspace_id, project_id, recipient_user_id, actor_user_id, source_outbox_event_id,
         event_type, entity_type, entity_id, dedupe_key, deep_link_path, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       on conflict (recipient_user_id, dedupe_key) do update
         set dedupe_key = excluded.dedupe_key
       returning id`,
      [
        event.workspaceId,
        target.projectId,
        target.userId,
        target.actorUserId,
        event.id,
        event.eventType,
        event.payload.entityType ?? event.eventType.split('.')[0] ?? 'project',
        event.aggregateId,
        `${event.id}:${target.userId}`,
        target.deepLinkPath,
        JSON.stringify({ projectSlug: target.projectSlug }),
      ],
    );
    const notificationId = inserted.rows[0]?.id;
    if (!notificationId) continue;
    await connection.query(
      `insert into notification_delivery
        (workspace_id, notification_event_id, channel, status, delivered_at)
       values ($1,$2,'in_app','delivered',now()) on conflict do nothing`,
      [event.workspaceId, notificationId],
    );
    const preference = await connection.query<{
      emailEnabled: boolean;
      timezone: string;
      quietHoursStartMinute: number | null;
      quietHoursEndMinute: number | null;
    }>(
      `select coalesce(np.email_enabled,true) as "emailEnabled",
        coalesce(np.timezone,w.timezone) as timezone,
        np.quiet_hours_start_minute as "quietHoursStartMinute",
        np.quiet_hours_end_minute as "quietHoursEndMinute"
       from workspace w
       left join notification_preference np on np.workspace_id = w.id and np.user_id = $2
       where w.id = $1`,
      [event.workspaceId, target.userId],
    );
    const settings = preference.rows[0];
    const availableAt = settings
      ? nextAllowedDeliveryAt(
          new Date(),
          settings.timezone,
          settings.quietHoursStartMinute,
          settings.quietHoursEndMinute,
        )
      : new Date();
    const email = await connection.query<{ id: string; availableAt: Date }>(
      `insert into notification_delivery
        (workspace_id, notification_event_id, channel, status, available_at)
       select $1,$2,'email',
         (case when $4 then 'pending' else 'suppressed' end)::notification_delivery_status,$5
       from workspace_membership wm
       where wm.workspace_id = $1 and wm.user_id = $3 and wm.status = 'active'
       on conflict (notification_event_id, channel) do update
         set available_at = least(notification_delivery.available_at, excluded.available_at),
             updated_at = now()
         where notification_delivery.status = 'pending'
       returning id, available_at as "availableAt"`,
      [
        event.workspaceId,
        notificationId,
        target.userId,
        settings?.emailEnabled ?? true,
        availableAt,
      ],
    );
    if (email.rows[0]) deliveries.push(email.rows[0]);
  }
  return deliveries;
}

export function nextAllowedDeliveryAt(
  now: Date,
  timezone: string,
  startMinute: number | null,
  endMinute: number | null,
): Date {
  if (!isInsideQuietHours(now, timezone, startMinute, endMinute)) return now;
  const candidate = new Date(now);
  for (let minute = 1; minute <= 1_440; minute += 1) {
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    if (!isInsideQuietHours(candidate, timezone, startMinute, endMinute)) return candidate;
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1_000);
}

async function reminderDeliveryTime(
  connection: PoolClient,
  workspaceId: string,
  userId: string,
): Promise<Date> {
  const preference = await connection.query<{
    timezone: string;
    quietHoursStartMinute: number | null;
    quietHoursEndMinute: number | null;
  }>(
    `select coalesce(np.timezone,w.timezone) as timezone,
       np.quiet_hours_start_minute as "quietHoursStartMinute",
       np.quiet_hours_end_minute as "quietHoursEndMinute"
     from workspace w
     left join notification_preference np on np.workspace_id = w.id and np.user_id = $2
     where w.id = $1`,
    [workspaceId, userId],
  );
  const settings = preference.rows[0];
  if (!settings) return new Date();
  return nextAllowedDeliveryAt(
    new Date(),
    settings.timezone,
    settings.quietHoursStartMinute,
    settings.quietHoursEndMinute,
  );
}

export async function sendNotificationEmail(
  connection: PoolClient,
  deliveryId: string,
  environment: WorkerEnvironment,
  transport: MailTransport,
) {
  const result = await connection.query<{
    id: string;
    eventType: string;
    email: string;
    projectName: string;
    deepLinkPath: string;
  }>(
    `update notification_delivery set status = 'processing', attempts = attempts + 1,
       locked_at = now(), updated_at = now()
     where id = $1 and status in ('pending','processing')
     returning id`,
    [deliveryId],
  );
  if (!result.rows[0]) return;
  const details = await connection.query<{
    eventType: string;
    entityId: string;
    email: string;
    projectName: string;
    deepLinkPath: string;
  }>(
    `select ne.event_type as "eventType", ne.entity_id as "entityId",
       u.email, p.name as "projectName",
       ne.deep_link_path as "deepLinkPath"
     from notification_delivery nd
     join notification_event ne on ne.id = nd.notification_event_id
     join "user" u on u.id = ne.recipient_user_id and u.status = 'active'
     join workspace_membership wm on wm.workspace_id = ne.workspace_id
       and wm.user_id = ne.recipient_user_id and wm.status = 'active'
     join workspace w on w.id = ne.workspace_id
     left join project p on p.id = ne.project_id and p.workspace_id = ne.workspace_id
     where nd.id = $1
       and (
         ne.project_id is null
         or wm.role = 'owner'
         or exists (
           select 1 from project_membership pm
           where pm.workspace_id = ne.workspace_id
             and pm.project_id = ne.project_id
             and pm.user_id = ne.recipient_user_id
             and pm.removed_at is null
         )
       )`,
    [deliveryId],
  );
  const row = details.rows[0];
  if (!row) {
    await connection.query(
      `update notification_delivery set status = 'suppressed', locked_at = null,
       last_error_code = 'RECIPIENT_NO_LONGER_ELIGIBLE', updated_at = now() where id = $1`,
      [deliveryId],
    );
    return;
  }
  if (row.eventType.startsWith('action.reminder.')) {
    const action = await connection.query<{ active: boolean }>(
      `select status in ('open','in_progress') as active from action_item where id = $1`,
      [row.entityId],
    );
    if (!action.rows[0]?.active) {
      await connection.query(
        `update notification_delivery set status = 'suppressed', locked_at = null,
         last_error_code = 'REMINDER_NO_LONGER_APPLICABLE', updated_at = now() where id = $1`,
        [deliveryId],
      );
      return;
    }
  }
  const copy = notificationPresentation(row.eventType);
  await transport.sendMail({
    from: environment.EMAIL_FROM,
    to: row.email,
    subject: row.projectName ? `${copy.title}: ${row.projectName}` : copy.title,
    text: `${copy.description}\n${environment.PUBLIC_APP_URL}${row.deepLinkPath}`,
    messageId: outboxMessageId(deliveryId),
  });
  await connection.query(
    `update notification_delivery set status = 'delivered', delivered_at = now(),
      locked_at = null, last_error_code = null, updated_at = now() where id = $1`,
    [deliveryId],
  );
}

export async function processOutbox(
  pool: Pool,
  eventId: string,
  environment: WorkerEnvironment,
  transport: MailTransport,
): Promise<PendingDelivery[]> {
  const connection = await pool.connect();
  try {
    const result = await connection.query<OutboxRow>(
      `select id, workspace_id as "workspaceId", event_type as "eventType",
       aggregate_id as "aggregateId", payload, encrypted_secret as "encryptedSecret"
       from outbox_event where id = $1 and status in ('processing','delivered')`,
      [eventId],
    );
    const event = result.rows[0];
    if (!event) return [];
    if (
      event.payload.template !== 'domain-event' &&
      event.payload.template !== 'material-request'
    ) {
      const recipient = await resolveDirectEmail(connection, event, environment.PUBLIC_APP_URL);
      if (!recipient) throw new Error('RECIPIENT_NOT_FOUND');
      const link = event.encryptedSecret
        ? decryptOutboxSecret(event.encryptedSecret, environment.OUTBOX_ENCRYPTION_KEY)
        : '';
      await transport.sendMail({
        from: environment.EMAIL_FROM,
        to: recipient.email,
        subject: recipient.subject,
        text: `${recipient.text}${link}`,
        messageId: outboxMessageId(event.id),
      });
    }
    const deliveries = await materializeNotifications(connection, event);
    await connection.query(
      `update outbox_event set status = 'delivered', delivered_at = now(),
       encrypted_secret = null, locked_at = null, last_error_code = null, updated_at = now()
       where id = $1`,
      [event.id],
    );
    return deliveries;
  } catch (error) {
    await connection.query(
      `update notification_delivery set status = 'pending', locked_at = null,
       last_error_code = 'EMAIL_DELIVERY_FAILED', updated_at = now()
       where notification_event_id in
         (select id from notification_event where source_outbox_event_id = $1)
         and channel = 'email' and status = 'processing'`,
      [eventId],
    );
    throw error;
  } finally {
    connection.release();
  }
}

export async function processReminders(pool: Pool): Promise<PendingDelivery[]> {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    await connection.query(`
    insert into action_reminder
      (workspace_id, project_id, action_item_id, recipient_user_id, status, next_run_at)
    select ai.workspace_id, ai.project_id, ai.id, ai.assignee_user_id, 'active',
      greatest(now(), ai.due_at - interval '24 hours')
    from action_item ai
    join project p on p.id = ai.project_id and p.workspace_id = ai.workspace_id
    join workspace_membership wm on wm.workspace_id = ai.workspace_id
      and wm.user_id = ai.assignee_user_id and wm.status = 'active'
    join project_membership pm on pm.workspace_id = ai.workspace_id
      and pm.project_id = ai.project_id and pm.user_id = ai.assignee_user_id
      and pm.removed_at is null
    left join notification_preference np on np.workspace_id = ai.workspace_id
      and np.user_id = ai.assignee_user_id
    where ai.status in ('open','in_progress') and p.status <> 'archived'
      and coalesce(np.reminders_enabled,true)
    on conflict (action_item_id, recipient_user_id) do update
      set status = 'active',
          next_run_at = least(action_reminder.next_run_at, excluded.next_run_at),
          updated_at = now()
  `);
    const due = await connection.query<{
      id: string;
      workspaceId: string;
      projectId: string;
      actionItemId: string;
      recipientUserId: string;
      dueAt: Date;
      projectSlug: string;
      workspaceSlug: string;
    }>(`
    select ar.id, ar.workspace_id as "workspaceId", ar.project_id as "projectId",
      ar.action_item_id as "actionItemId", ar.recipient_user_id as "recipientUserId",
      ai.due_at as "dueAt", p.slug as "projectSlug", w.slug as "workspaceSlug"
    from action_reminder ar
    join action_item ai on ai.id = ar.action_item_id and ai.project_id = ar.project_id
    join project p on p.id = ar.project_id and p.workspace_id = ar.workspace_id
    join workspace w on w.id = ar.workspace_id
    where ar.status = 'active' and ar.next_run_at <= now()
      and ai.status in ('open','in_progress') and p.status <> 'archived'
    order by ar.next_run_at limit 100
    for update of ar skip locked
  `);
    for (const row of due.rows) {
      const kind = row.dueAt <= new Date() ? 'overdue' : 'due_soon';
      const bucket = new Date().toISOString().slice(0, 10);
      const eventType = `action.reminder.${kind}`;
      const event = await connection.query<{ id: string }>(
        `insert into notification_event
          (workspace_id, project_id, recipient_user_id, event_type, entity_type, entity_id,
           dedupe_key, deep_link_path, metadata)
         values ($1,$2,$3,$4,'action_item',$5,$6,$7,$8::jsonb)
         on conflict (recipient_user_id, dedupe_key) do nothing returning id`,
        [
          row.workspaceId,
          row.projectId,
          row.recipientUserId,
          eventType,
          row.actionItemId,
          `reminder:${row.actionItemId}:${kind}:${bucket}`,
          `/workspace/${encodeURIComponent(row.workspaceSlug)}/projects/${encodeURIComponent(row.projectSlug)}/workflow`,
          JSON.stringify({ projectSlug: row.projectSlug, reminderKind: kind }),
        ],
      );
      if (event.rows[0]) {
        await connection.query(
          `insert into notification_delivery
            (workspace_id, notification_event_id, channel, status, delivered_at, available_at)
           values ($1,$2,'in_app','delivered',now(),now())`,
          [row.workspaceId, event.rows[0].id],
        );
        await connection.query(
          `insert into notification_delivery
             (workspace_id, notification_event_id, channel, status, available_at)
           select $1,$2,'email',
             (case when coalesce(np.email_enabled,true)
               then 'pending' else 'suppressed' end)::notification_delivery_status,
             $4
           from workspace w
           left join notification_preference np on np.workspace_id = w.id and np.user_id = $3
           where w.id = $1`,
          [
            row.workspaceId,
            event.rows[0].id,
            row.recipientUserId,
            await reminderDeliveryTime(connection, row.workspaceId, row.recipientUserId),
          ],
        );
      }
      await connection.query(
        `update action_reminder set last_kind = $2, last_sent_at = now(),
          next_run_at = now() + interval '24 hours', updated_at = now() where id = $1`,
        [row.id, kind],
      );
    }
    await connection.query(`
    update action_reminder ar set status = 'completed', updated_at = now()
    from action_item ai
    where ai.id = ar.action_item_id and ai.status in ('done','cancelled') and ar.status = 'active'
  `);
    await connection.query(`
    update action_reminder ar set status = 'cancelled', updated_at = now()
    where ar.status = 'active' and (
      exists (
        select 1 from project p
        where p.id = ar.project_id and p.workspace_id = ar.workspace_id and p.status = 'archived'
      )
      or not exists (
        select 1 from workspace_membership wm
        where wm.workspace_id = ar.workspace_id and wm.user_id = ar.recipient_user_id
          and wm.status = 'active'
      )
      or not exists (
        select 1 from project_membership pm
        where pm.workspace_id = ar.workspace_id and pm.project_id = ar.project_id
          and pm.user_id = ar.recipient_user_id and pm.removed_at is null
      )
      or exists (
        select 1 from notification_preference np
        where np.workspace_id = ar.workspace_id and np.user_id = ar.recipient_user_id
          and not np.reminders_enabled
      )
    )
  `);
    await connection.query('commit');
    const deliveries = await connection.query<PendingDelivery>(
      `select nd.id, nd.available_at as "availableAt"
     from notification_delivery nd
     join notification_event ne on ne.id = nd.notification_event_id
     where nd.channel = 'email' and nd.status = 'pending'
       and ne.event_type like 'action.reminder.%'
       and nd.created_at >= now() - interval '2 minutes'`,
    );
    return deliveries.rows;
  } catch (error) {
    await connection.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function startNotificationQueue(
  pool: Pool,
  environment: WorkerEnvironment,
  logger: Logger,
) {
  const connection = redisConnection(environment.REDIS_URL);
  const queue = new Queue('garun-notifications', { connection });
  const transport = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_SECURE,
  });
  const worker = new Worker(
    'garun-notifications',
    async (job: Job) => {
      if (job.name === 'dispatch-outbox') {
        const deliveries = await processOutbox(
          pool,
          String(job.data.outboxEventId),
          environment,
          transport,
        );
        for (const delivery of deliveries) {
          await queue.add(
            'dispatch-delivery',
            { deliveryId: delivery.id },
            {
              jobId: `delivery-${delivery.id}`,
              delay: Math.max(0, delivery.availableAt.getTime() - Date.now()),
              attempts: 8,
              backoff: { type: 'exponential', delay: 2_000 },
              removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
              removeOnFail: false,
            },
          );
        }
        return;
      }
      if (job.name === 'dispatch-delivery') {
        const connection = await pool.connect();
        try {
          await sendNotificationEmail(
            connection,
            String(job.data.deliveryId),
            environment,
            transport,
          );
        } finally {
          connection.release();
        }
        return;
      }
      if (job.name === 'scan-reminders') {
        const deliveries = await processReminders(pool);
        for (const delivery of deliveries) {
          await queue.add(
            'dispatch-delivery',
            { deliveryId: delivery.id },
            {
              jobId: `delivery-${delivery.id}`,
              delay: Math.max(0, delivery.availableAt.getTime() - Date.now()),
              attempts: 8,
              backoff: { type: 'exponential', delay: 2_000 },
              removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
              removeOnFail: false,
            },
          );
        }
        return;
      }
      throw new Error('UNKNOWN_NOTIFICATION_JOB');
    },
    { connection, concurrency: 4 },
  );
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Notification job completed');
  });
  worker.on('failed', (job) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      if (job.name === 'dispatch-delivery') {
        void pool.query(
          `update notification_delivery set status = 'failed', locked_at = null,
           last_error_code = 'EMAIL_DELIVERY_FAILED', updated_at = now() where id = $1`,
          [String(job.data.deliveryId)],
        );
      }
      if (job.name === 'dispatch-outbox') {
        void pool.query(
          `update outbox_event set status = 'failed', locked_at = null,
           last_error_code = 'DELIVERY_FAILED', updated_at = now() where id = $1`,
          [String(job.data.outboxEventId)],
        );
      }
    }
    logger.warn(
      { jobId: job?.id, jobName: job?.name, errorCode: 'NOTIFICATION_JOB_FAILED' },
      'Notification job failed',
    );
  });
  worker.on('error', () => {
    logger.error({ errorCode: 'NOTIFICATION_WORKER_ERROR' }, 'Notification worker error');
  });
  await queue.upsertJobScheduler(
    'notification-reminder-scan',
    { every: 60_000 },
    {
      name: 'scan-reminders',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: false,
      },
    },
  );
  return {
    queue,
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}

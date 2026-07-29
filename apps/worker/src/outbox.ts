import type { Queue } from 'bullmq';
import type { Pool } from 'pg';

export { outboxMessageId, outboxRetry } from './notification-queue';

interface ClaimedEvent {
  readonly id: string;
  readonly workspaceId: string | null;
}

export async function claimOutboxEvent(pool: Pool): Promise<ClaimedEvent | null> {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    await connection.query(
      "update outbox_event set status = 'pending', locked_at = null, available_at = now(), updated_at = now() where status = 'processing' and locked_at < now() - interval '10 minutes'",
    );
    const result = await connection.query<ClaimedEvent>(`
      select id, workspace_id as "workspaceId"
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
    return event;
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
}

export function startOutboxProducer(
  pool: Pool,
  queue: Queue,
  logger: {
    error: (value: object, message: string) => void;
  },
) {
  let running = false;
  const dispatch = async () => {
    if (running) return;
    running = true;
    let event: ClaimedEvent | null = null;
    try {
      event = await claimOutboxEvent(pool);
      if (!event) return;
      await queue.add(
        'dispatch-outbox',
        { outboxEventId: event.id, workspaceId: event.workspaceId },
        {
          jobId: `outbox-${event.id}`,
          attempts: 8,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
          removeOnFail: false,
        },
      );
    } catch {
      if (event) {
        await pool.query(
          "update outbox_event set status = 'pending', locked_at = null, available_at = now() + interval '5 seconds', last_error_code = 'QUEUE_UNAVAILABLE', updated_at = now() where id = $1",
          [event.id],
        );
      }
      logger.error({ errorCode: 'OUTBOX_QUEUE_FAILED' }, 'Outbox queue handoff failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void dispatch(), 2_000);
  timer.unref();
  void dispatch();
  return () => clearInterval(timer);
}

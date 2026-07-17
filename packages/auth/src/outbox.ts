import type { DatabaseClient } from '@garun/db';
import { outboxEvent, type OutboxPayload } from '@garun/db/schema';

import { encryptOutboxSecret } from './crypto';

type InsertDatabase = Pick<DatabaseClient['db'], 'insert'>;

export async function enqueueEmail(
  database: InsertDatabase,
  input: {
    workspaceId: string | null;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: OutboxPayload;
    secret: string;
    encryptionKey: string;
  },
) {
  const [event] = await database
    .insert(outboxEvent)
    .values({
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
      encryptedSecret: encryptOutboxSecret(input.secret, input.encryptionKey),
    })
    .returning({ id: outboxEvent.id });
  if (!event) throw new Error('OUTBOX_INSERT_FAILED');
  return event.id;
}

import { createHash } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';
import sharp from 'sharp';

import type { WorkerEnvironment } from '@garun/config';
import { ClamAvScanner, S3ObjectStorage, verifyDetectedType } from '@garun/storage';

interface ClaimedFile {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly storageKey: string;
  readonly declaredMimeType: string;
  readonly clientChecksum: string;
  readonly processingAttempts: number;
}

async function claim(pool: Pool): Promise<ClaimedFile | null> {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    const result = await connection.query<ClaimedFile>(`
      select id, workspace_id as "workspaceId", project_id as "projectId",
             storage_key as "storageKey", declared_mime_type as "declaredMimeType",
             client_checksum as "clientChecksum", processing_attempts as "processingAttempts"
      from file_object
      where (
        upload_status = 'uploaded' and scan_status = 'pending' and next_processing_at <= now()
      ) or (
        upload_status = 'scanning' and scan_status = 'scanning'
        and scan_started_at < now() - interval '5 minutes'
      )
      order by created_at
      for update skip locked
      limit 1
    `);
    const file = result.rows[0];
    if (file) {
      await connection.query(
        `update file_object
         set upload_status = 'scanning', scan_status = 'scanning',
             processing_attempts = processing_attempts + 1,
             scan_started_at = now(), updated_at = now()
         where id = $1`,
        [file.id],
      );
    }
    await connection.query('commit');
    return file ?? null;
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
}

async function completeRevision(connection: PoolClient, fileId: string) {
  const result = await connection.query<{
    revisionId: string;
    materialId: string;
    workspaceId: string;
    projectId: string;
  }>(
    `with target as (
       select mr.id, mr.material_id, mr.workspace_id, mr.project_id
       from file_link fl join material_revision mr on mr.id = fl.material_revision_id
       where fl.file_object_id = $1
     ), completed as (
       select t.id, t.material_id, t.workspace_id, t.project_id
       from target t
       where not exists (
         select 1 from file_link fl
         join file_object fo on fo.id = fl.file_object_id
         where fl.material_revision_id = t.id and fo.upload_status <> 'available'
       )
     ), revision_update as (
       update material_revision mr
       set status = 'submitted', submitted_at = now(), updated_at = now()
       from completed c where mr.id = c.id and mr.status = 'pending_scan'
       returning mr.id, mr.material_id, mr.workspace_id, mr.project_id
     ), material_update as (
       update material m
       set status = 'uploaded', current_revision_id = r.id, updated_at = now()
       from revision_update r where m.id = r.material_id and m.workspace_id = r.workspace_id
       returning r.id as revision_id, r.material_id, r.workspace_id, r.project_id,
                 m.action_item_id
     ), action_update as (
       update action_item ai
       set status = 'done', completed_at = now(), updated_at = now()
       from material_update m
       where ai.id = m.action_item_id and ai.status in ('open', 'in_progress')
     )
     select revision_id as "revisionId", material_id as "materialId",
            workspace_id as "workspaceId", project_id as "projectId"
     from material_update`,
    [fileId],
  );
  const completed = result.rows[0];
  if (!completed) return;
  await connection.query(
    `insert into audit_event
       (workspace_id, action, entity_type, entity_id, metadata)
     values ($1, 'material.revision_submitted', 'material_revision', $2,
             jsonb_build_object('projectId', $3::text, 'materialId', $4::text,
                                'source', 'file_processor'))`,
    [completed.workspaceId, completed.revisionId, completed.projectId, completed.materialId],
  );
  await connection.query(
    `insert into outbox_event
       (workspace_id, event_type, aggregate_type, aggregate_id, payload)
     values ($1, 'material.revision_submitted', 'material_revision', $2,
             jsonb_build_object('template', 'domain-event', 'projectId', $3::text,
                                'entityType', 'material_revision'))`,
    [completed.workspaceId, completed.revisionId, completed.projectId],
  );
}

async function markAvailable(
  pool: Pool,
  file: ClaimedFile,
  result: {
    readonly scannerEngine: string;
    readonly scanResultCode: string;
    readonly detectedMimeType: string;
    readonly checksum: string;
    readonly previewStorageKey: string | null;
  },
) {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    await connection.query(
      `update file_object
       set upload_status = 'available', scan_status = 'clean', scanner_engine = $2,
           scan_result_code = $3, detected_mime_type = $4, checksum = $5,
           preview_storage_key = $6, scanned_at = now(), available_at = now(), updated_at = now()
       where id = $1 and upload_status = 'scanning'`,
      [
        file.id,
        result.scannerEngine,
        result.scanResultCode,
        result.detectedMimeType,
        result.checksum,
        result.previewStorageKey,
      ],
    );
    await completeRevision(connection, file.id);
    await connection.query('commit');
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
}

async function markProcessingFailure(pool: Pool, file: ClaimedFile, error: unknown) {
  const reportedCode = error instanceof Error ? error.message : '';
  const allowedCodes = new Set([
    'CHECKSUM_MISMATCH',
    'FILE_TYPE_NOT_ALLOWED',
    'SCANNER_TIMEOUT',
    'SCANNER_UNAVAILABLE',
    'SCANNER_INVALID_RESPONSE',
    'SCANNER_FAILED',
    'STORAGE_EMPTY_OBJECT',
    'STORAGE_READ_FAILED',
    'PREVIEW_GENERATION_FAILED',
    'FILE_STATE_PERSISTENCE_FAILED',
  ]);
  const code = allowedCodes.has(reportedCode) ? reportedCode : 'PROCESSING_FAILED';
  const permanent = ['CHECKSUM_MISMATCH', 'FILE_TYPE_NOT_ALLOWED'].includes(code);
  const attempt = file.processingAttempts + 1;
  const exhausted = permanent || attempt >= 5;
  const backoffSeconds = Math.min(300, 2 ** attempt * 5);
  await pool.query(
    `update file_object
     set upload_status = $2::file_upload_status, scan_status = $3::file_scan_status,
         scan_result_code = $4,
         next_processing_at = now() + ($5 * interval '1 second'),
         scanned_at = case when $2::file_upload_status = 'failed' then now() else scanned_at end,
         updated_at = now()
     where id = $1`,
    [
      file.id,
      exhausted ? 'failed' : 'uploaded',
      exhausted ? 'error' : 'pending',
      code.slice(0, 100),
      backoffSeconds,
    ],
  );
  return { code, exhausted, attempt };
}

export function startFileProcessor(
  pool: Pool,
  environment: WorkerEnvironment,
  logger: {
    info: (value: object, message: string) => void;
    warn: (value: object, message: string) => void;
    error: (value: object, message: string) => void;
  },
) {
  const storage = new S3ObjectStorage({
    endpoint: environment.STORAGE_ENDPOINT,
    publicEndpoint: environment.STORAGE_PUBLIC_ENDPOINT,
    region: environment.STORAGE_REGION,
    bucket: environment.STORAGE_BUCKET,
    accessKey: environment.STORAGE_ACCESS_KEY,
    secretKey: environment.STORAGE_SECRET_KEY,
    forcePathStyle: environment.STORAGE_FORCE_PATH_STYLE,
  });
  const scanner = new ClamAvScanner(environment.SCANNER_HOST, environment.SCANNER_PORT);
  let running = false;
  const processOne = async () => {
    if (running) return;
    running = true;
    let file: ClaimedFile | null = null;
    try {
      file = await claim(pool);
      if (!file) return;
      const bytes = await storage
        .get(file.storageKey)
        .then((response) => response.Body?.transformToByteArray())
        .catch(() => {
          throw new Error('STORAGE_READ_FAILED');
        });
      if (!bytes) throw new Error('STORAGE_EMPTY_OBJECT');
      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (checksum !== file.clientChecksum) throw new Error('CHECKSUM_MISMATCH');
      const detectedMimeType = verifyDetectedType(file.declaredMimeType, bytes.slice(0, 8192));
      const scan = await scanner.scan(bytes).catch((error: unknown) => {
        const code = error instanceof Error ? error.message : '';
        throw new Error(code.startsWith('SCANNER_') ? code : 'SCANNER_FAILED');
      });
      if (!scan.clean) {
        await pool.query(
          "update file_object set upload_status = 'rejected', scan_status = 'infected', scanner_engine = $2, scan_result_code = $3, scanned_at = now(), updated_at = now() where id = $1",
          [file.id, scan.engine, scan.resultCode],
        );
        logger.warn(
          { fileId: file.id, workspaceId: file.workspaceId, resultCode: scan.resultCode },
          'Quarantined file rejected',
        );
        return;
      }
      let previewStorageKey: string | null = null;
      if (detectedMimeType.startsWith('image/')) {
        previewStorageKey = `${file.workspaceId}/${file.projectId}/${file.id}/preview.webp`;
        try {
          const preview = await sharp(bytes, { animated: false })
            .rotate()
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
          await storage.put(previewStorageKey, preview, 'image/webp');
        } catch {
          throw new Error('PREVIEW_GENERATION_FAILED');
        }
      }
      await markAvailable(pool, file, {
        scannerEngine: scan.engine,
        scanResultCode: scan.resultCode,
        detectedMimeType,
        checksum,
        previewStorageKey,
      }).catch(() => {
        throw new Error('FILE_STATE_PERSISTENCE_FAILED');
      });
      logger.info({ fileId: file.id, workspaceId: file.workspaceId }, 'File scan completed');
    } catch (error) {
      if (file) {
        try {
          const failure = await markProcessingFailure(pool, file, error);
          logger.warn(
            {
              fileId: file.id,
              workspaceId: file.workspaceId,
              errorCode: failure.code,
              attempt: failure.attempt,
              exhausted: failure.exhausted,
            },
            failure.exhausted
              ? 'File processing failed permanently'
              : 'File processing retry scheduled',
          );
        } catch {
          logger.error(
            {
              fileId: file.id,
              workspaceId: file.workspaceId,
              errorCode: 'FILE_RETRY_STATE_PERSISTENCE_FAILED',
            },
            'File processing failure state could not be persisted',
          );
        }
      } else {
        logger.error({ errorCode: 'FILE_POLL_FAILED' }, 'File polling failed');
      }
    } finally {
      running = false;
    }
  };
  const cleanup = async () => {
    try {
      const expired = await pool.query<{ id: string; storageKey: string }>(
        `update file_object set upload_status = 'deleted', deleted_at = now(), updated_at = now()
         where upload_status = 'initiated' and upload_expires_at < now() - ($1 * interval '1 hour')
         returning id, storage_key as "storageKey"`,
        [environment.INCOMPLETE_UPLOAD_RETENTION_HOURS],
      );
      for (const file of expired.rows) {
        try {
          await storage.delete(file.storageKey);
        } catch {
          logger.warn(
            { fileId: file.id, errorCode: 'CLEANUP_OBJECT_FAILED' },
            'Upload cleanup failed',
          );
        }
      }
    } catch {
      logger.error(
        { errorCode: 'UPLOAD_CLEANUP_QUERY_FAILED' },
        'Incomplete upload cleanup failed',
      );
    }
  };
  const pollTimer = setInterval(() => void processOne(), 2_000);
  const cleanupTimer = setInterval(() => void cleanup(), 60_000);
  pollTimer.unref();
  cleanupTimer.unref();
  void processOne();
  void cleanup();
  return () => {
    clearInterval(pollTimer);
    clearInterval(cleanupTimer);
  };
}

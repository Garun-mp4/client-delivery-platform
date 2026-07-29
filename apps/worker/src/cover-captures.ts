import { createHash, randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import sharp from 'sharp';

import type { WorkerEnvironment } from '@garun/config';
import { S3ObjectStorage } from '@garun/storage';

import { PlaywrightProjectCoverRenderer, type ProjectCoverRenderer } from './cover-renderer';

interface ClaimedCapture {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly siteVersionId: string;
  readonly requestedByUserId: string;
  readonly url: string;
  readonly attempts: number;
}

async function claim(pool: Pool): Promise<ClaimedCapture | null> {
  await pool.query(
    `update project_cover_capture
     set status = 'pending', processing_started_at = null, next_attempt_at = now(), updated_at = now()
     where status = 'processing' and processing_started_at < now() - interval '5 minutes'`,
  );
  await pool.query(
    `update project_cover_capture capture
     set status = 'failed', failure_code = 'SOURCE_NOT_AVAILABLE',
       completed_at = now(), updated_at = now()
     where capture.status = 'pending'
       and not exists (
         select 1 from site_version source
         where source.id = capture.site_version_id
           and source.workspace_id = capture.workspace_id
           and source.project_id = capture.project_id
           and source.client_visible = true
           and source.security_status = 'safe'
           and source.availability_status = 'reachable'
           and source.access_mode = 'public'
       )`,
  );
  const result = await pool.query<ClaimedCapture>(`
    update project_cover_capture capture
    set status = 'processing', attempts = attempts + 1,
        processing_started_at = now(), updated_at = now()
    from site_version version
    where capture.id = (
      select queued.id
      from project_cover_capture queued
      join site_version source on source.id = queued.site_version_id
        and source.workspace_id = queued.workspace_id
        and source.project_id = queued.project_id
      where queued.status = 'pending' and queued.next_attempt_at <= now()
        and source.client_visible = true
        and source.security_status = 'safe'
        and source.availability_status = 'reachable'
        and source.access_mode = 'public'
      order by queued.created_at
      for update of queued skip locked
      limit 1
    )
      and version.id = capture.site_version_id
    returning capture.id, capture.workspace_id as "workspaceId",
      capture.project_id as "projectId", capture.site_version_id as "siteVersionId",
      capture.requested_by_user_id as "requestedByUserId", version.url,
      capture.attempts
  `);
  return result.rows[0] ?? null;
}

function safeFailureCode(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return [
    'URL_SCHEME_BLOCKED',
    'URL_PORT_BLOCKED',
    'URL_ADDRESS_BLOCKED',
    'URL_DNS_EMPTY',
    'URL_RESPONSE_TOO_LARGE',
    'CAPTURE_REQUEST_LIMIT',
    'CAPTURE_SIZE_LIMIT',
    'CAPTURE_QUOTA_EXCEEDED',
  ].includes(code)
    ? code
    : 'CAPTURE_FAILED';
}

async function succeed(
  pool: Pool,
  storage: S3ObjectStorage,
  capture: ClaimedCapture,
  bytes: Uint8Array,
  maxWorkspaceBytes: number,
) {
  const assetId = randomUUID();
  const fileId = randomUUID();
  const storageKey = `${capture.workspaceId}/${capture.projectId}/${fileId}/cover.webp`;
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const usage = await pool.query<{ bytes: string }>(
    `select coalesce(sum(size), 0)::text as bytes
     from file_object
     where workspace_id = $1 and upload_status <> 'deleted'`,
    [capture.workspaceId],
  );
  if (Number(usage.rows[0]?.bytes ?? 0) + bytes.byteLength > maxWorkspaceBytes) {
    throw new Error('CAPTURE_QUOTA_EXCEEDED');
  }
  await storage.put(storageKey, bytes, 'image/webp');
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    await connection.query(
      `update project_cover_asset
       set is_current = false, superseded_at = now(), updated_at = now()
       where workspace_id = $1 and project_id = $2 and kind = 'automatic' and is_current = true`,
      [capture.workspaceId, capture.projectId],
    );
    await connection.query(
      `insert into file_object
        (id, workspace_id, project_id, storage_key, original_name, normalized_name,
         declared_mime_type, detected_mime_type, size, client_checksum, checksum,
         upload_session_key, upload_status, scan_status, scanner_engine, scan_result_code,
         uploaded_by_user_id, upload_expires_at, uploaded_at, available_at, scanned_at)
       values ($1, $2, $3, $4, 'project-cover.webp', 'project-cover.webp',
         'image/webp', 'image/webp', $5, $6, $6, $7, 'available', 'clean',
         'trusted-cover-renderer', 'GENERATED', $8, now(), now(), now(), now())`,
      [
        fileId,
        capture.workspaceId,
        capture.projectId,
        storageKey,
        bytes.byteLength,
        checksum,
        `cover-capture:${capture.id}`,
        capture.requestedByUserId,
      ],
    );
    await connection.query(
      `insert into project_cover_asset
        (id, workspace_id, project_id, kind, file_object_id, source_site_version_id,
         created_by_user_id, is_current)
       values ($1, $2, $3, 'automatic', $4, $5, $6, true)`,
      [
        assetId,
        capture.workspaceId,
        capture.projectId,
        fileId,
        capture.siteVersionId,
        capture.requestedByUserId,
      ],
    );
    await connection.query(
      `update project_cover_capture
       set status = 'succeeded', result_asset_id = $2, failure_code = null,
           completed_at = now(), updated_at = now()
       where id = $1 and status = 'processing'`,
      [capture.id, assetId],
    );
    await connection.query(
      `insert into audit_event
        (workspace_id, action, entity_type, entity_id, metadata)
       values ($1, 'project_cover.capture_succeeded', 'project_cover_capture', $2,
         jsonb_build_object('projectId', $3::text, 'sourceSiteVersionId', $4::text,
           'source', 'cover_processor'))`,
      [capture.workspaceId, capture.id, capture.projectId, capture.siteVersionId],
    );
    await connection.query('commit');
  } catch (error) {
    await connection.query('rollback');
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export function startCoverCaptureProcessor(
  pool: Pool,
  environment: WorkerEnvironment,
  logger: {
    info: (value: object, message: string) => void;
    warn: (value: object, message: string) => void;
    error: (value: object, message: string) => void;
  },
  renderer: ProjectCoverRenderer = new PlaywrightProjectCoverRenderer({
    executablePath: environment.COVER_BROWSER_EXECUTABLE_PATH,
    timeoutMs: environment.COVER_CAPTURE_TIMEOUT_MS,
    maxRequests: environment.COVER_CAPTURE_MAX_REQUESTS,
    maxBytes: environment.COVER_CAPTURE_MAX_BYTES,
  }),
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
  let running = false;
  const processOne = async () => {
    if (running) return;
    running = true;
    let capture: ClaimedCapture | null = null;
    try {
      capture = await claim(pool);
      if (!capture) return;
      const png = await renderer.render(capture.url);
      const webp = await sharp(png, { animated: false })
        .rotate()
        .resize({ width: 1200, height: 750, fit: 'cover', position: 'top' })
        .webp({ quality: 82 })
        .toBuffer();
      await succeed(pool, storage, capture, webp, environment.WORKSPACE_QUOTA_BYTES);
      logger.info(
        { captureId: capture.id, workspaceId: capture.workspaceId },
        'Project cover capture completed',
      );
    } catch (error) {
      if (capture) {
        const failureCode = safeFailureCode(error);
        const terminal = capture.attempts >= 3;
        await pool.query(
          `update project_cover_capture
           set status = $2::project_cover_capture_status, failure_code = $3,
             completed_at = case when $2 = 'failed' then now() else null end,
             next_attempt_at = now() + ($4 * interval '1 second'), updated_at = now()
           where id = $1`,
          [
            capture.id,
            terminal ? 'failed' : 'pending',
            failureCode,
            Math.min(300, 2 ** capture.attempts * 5),
          ],
        );
        logger.warn(
          {
            captureId: capture.id,
            workspaceId: capture.workspaceId,
            errorCode: failureCode,
            terminal,
          },
          terminal ? 'Project cover capture failed' : 'Project cover capture retry scheduled',
        );
      } else {
        logger.error({ errorCode: 'COVER_CAPTURE_POLL_FAILED' }, 'Cover capture polling failed');
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void processOne(), 2_000);
  timer.unref();
  void processOne();
  return () => clearInterval(timer);
}

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import type { Pool } from 'pg';
import tar from 'tar-stream';

import type { WorkerEnvironment } from '@garun/config';
import { renderProjectExport, type ProjectExportRecord } from '@garun/core/exports';
import { S3ObjectStorage } from '@garun/storage';

interface ExportJobRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly requestedByUserId: string;
  readonly audience: 'internal' | 'client';
  readonly attempts: number;
  readonly projectSlug: string;
  readonly projectName: string;
  readonly companyName: string;
  readonly description: string | null;
  readonly projectStatus: string;
  readonly plannedStartDate: Date | string;
  readonly plannedEndDate: Date | string;
}

interface ExportAttachmentRow {
  readonly id: string;
  readonly storageKey: string;
  readonly normalizedName: string;
  readonly detectedMimeType: string | null;
  readonly size: string | number;
  readonly checksum: string | null;
}

class ExportProcessingError extends Error {
  constructor(
    readonly code:
      | 'ACCESS_REVOKED'
      | 'EXPORT_LIMIT_EXCEEDED'
      | 'SOURCE_OBJECT_UNAVAILABLE'
      | 'EXPORT_RENDER_FAILED'
      | 'EXPORT_CONTENT_RENDER_FAILED'
      | 'EXPORT_INVALID_PROJECT_NAME'
      | 'EXPORT_INVALID_COMPANY_NAME'
      | 'EXPORT_INVALID_PROJECT_STATUS'
      | 'EXPORT_INVALID_PROJECT_DATES'
      | 'EXPORT_ARCHIVE_WRITE_FAILED'
      | 'EXPORT_ATTACHMENT_READ_FAILED'
      | 'EXPORT_SOURCE_LOAD_FAILED'
      | 'EXPORT_STORAGE_WRITE_FAILED'
      | 'EXPORT_FINALIZE_FAILED',
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'ExportProcessingError';
  }
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export function safeAttachmentName(index: number, id: string, value: string): string {
  const base = value
    .normalize('NFKC')
    .replaceAll(/\p{Cc}/gu, '_')
    .replaceAll(/[/\\:*?"<>|]/g, '_')
    .replaceAll(/\.{2,}/g, '_')
    .replaceAll(/^\.+|\.+$/g, '')
    .slice(0, 180);
  return `attachments/${String(index + 1).padStart(4, '0')}-${id.slice(0, 8)}-${base || 'file'}`;
}

async function claimExportJob(pool: Pool): Promise<ExportJobRow | null> {
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    await connection.query(`
      update export_job
      set status = 'pending', processing_started_at = null, next_attempt_at = now(), updated_at = now()
      where status = 'processing' and processing_started_at < now() - interval '30 minutes'
    `);
    const result = await connection.query<ExportJobRow>(`
      select
        job.id,
        job.workspace_id as "workspaceId",
        job.project_id as "projectId",
        job.requested_by_user_id as "requestedByUserId",
        job.audience,
        job.attempts,
        project.slug as "projectSlug",
        project.name as "projectName",
        company.name as "companyName",
        project.description,
        project.status as "projectStatus",
        project.planned_start_date as "plannedStartDate",
        project.planned_end_date as "plannedEndDate"
      from export_job job
      inner join project
        on project.id = job.project_id and project.workspace_id = job.workspace_id
      inner join client_company company
        on company.id = project.client_company_id and company.workspace_id = job.workspace_id
      inner join "user" requester
        on requester.id = job.requested_by_user_id and requester.status = 'active'
      inner join workspace_membership workspace_member
        on workspace_member.workspace_id = job.workspace_id
       and workspace_member.user_id = job.requested_by_user_id
       and workspace_member.status = 'active'
      left join project_membership project_member
        on project_member.project_id = job.project_id
       and project_member.workspace_id = job.workspace_id
       and project_member.user_id = job.requested_by_user_id
       and project_member.removed_at is null
      where job.status = 'pending'
        and job.next_attempt_at <= now()
        and (
          workspace_member.role = 'owner'
          or (
            project_member.id is not null
            and (job.audience = 'client' or (
              project_member.side = 'internal'
              and project_member.permissions @> '{"version":1,"grants":["project.view.internal"]}'::jsonb
            ))
          )
        )
      order by job.created_at
      for update of job skip locked
      limit 1
    `);
    const job = result.rows[0];
    if (!job) {
      await connection.query('commit');
      return null;
    }
    await connection.query(
      `update export_job
       set status = 'processing', attempts = attempts + 1, processing_started_at = now(), updated_at = now()
       where id = $1`,
      [job.id],
    );
    await connection.query('commit');
    return { ...job, attempts: job.attempts + 1 };
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally {
    connection.release();
  }
}

async function failInaccessibleJobs(pool: Pool) {
  await pool.query(`
    update export_job job
    set status = 'failed',
        completed_at = now(),
        failure_code = 'ACCESS_REVOKED',
        updated_at = now()
    where job.status = 'pending'
      and not exists (
        select 1
        from "user" requester
        inner join workspace_membership workspace_member
          on workspace_member.user_id = requester.id
         and workspace_member.workspace_id = job.workspace_id
         and workspace_member.status = 'active'
        left join project_membership project_member
          on project_member.project_id = job.project_id
         and project_member.workspace_id = job.workspace_id
         and project_member.user_id = requester.id
         and project_member.removed_at is null
        where requester.id = job.requested_by_user_id
          and requester.status = 'active'
          and (
            workspace_member.role = 'owner'
            or (
              project_member.id is not null
              and (job.audience = 'client' or (
                project_member.side = 'internal'
                and project_member.permissions @> '{"version":1,"grants":["project.view.internal"]}'::jsonb
              ))
            )
          )
      )
  `);
}

async function loadExportRecord(pool: Pool, job: ExportJobRow): Promise<ProjectExportRecord> {
  const clientFilter = job.audience === 'client';
  const [scope, stages, updates, versions, feedback, comments, approvals, checklist] =
    await Promise.all([
      pool.query<{
        revision: number;
        status: string;
        summary: string;
        createdAt: Date;
      }>(
        `select revision, status, summary, created_at as "createdAt"
         from project_scope_revision
         where workspace_id = $1 and project_id = $2 ${clientFilter ? "and status <> 'draft'" : ''}
         order by revision`,
        [job.workspaceId, job.projectId],
      ),
      pool.query<{
        name: string;
        status: string;
        plannedEndDate: Date | string;
        resultSummary: string | null;
        skipReason: string | null;
      }>(
        `select name, status, planned_end_date as "plannedEndDate",
                result_summary as "resultSummary", skip_reason as "skipReason"
         from project_stage
         where workspace_id = $1 and project_id = $2 ${clientFilter ? 'and client_visible = true' : ''}
         order by order_index`,
        [job.workspaceId, job.projectId],
      ),
      pool.query<{ title: string; body: string; publishedAt: Date }>(
        `select title, body, published_at as "publishedAt"
         from project_update
         where workspace_id = $1 and project_id = $2 ${clientFilter ? "and visibility = 'client'" : ''}
         order by published_at`,
        [job.workspaceId, job.projectId],
      ),
      pool.query<{
        versionNumber: number;
        name: string;
        changeLog: string;
        url: string;
        publishedAt: Date | null;
      }>(
        `select version_number as "versionNumber", name, change_log as "changeLog", url,
                published_at as "publishedAt"
         from site_version
         where workspace_id = $1 and project_id = $2 ${clientFilter ? 'and client_visible = true' : ''}
         order by version_number`,
        [job.workspaceId, job.projectId],
      ),
      pool.query<{
        id: string;
        title: string;
        body: string;
        status: string;
        createdAt: Date;
      }>(
        `select id, title, body, status, created_at as "createdAt"
         from feedback_item
         where workspace_id = $1 and project_id = $2 ${clientFilter ? "and visibility = 'client'" : ''}
         order by created_at`,
        [job.workspaceId, job.projectId],
      ),
      pool.query<{
        feedbackItemId: string;
        body: string;
        deletedAt: Date | null;
        createdAt: Date;
      }>(
        `select feedback_item_id as "feedbackItemId", body, deleted_at as "deletedAt",
                created_at as "createdAt"
         from comment
         where workspace_id = $1 and project_id = $2 ${clientFilter ? "and visibility = 'client'" : ''}
         order by created_at`,
        [job.workspaceId, job.projectId],
      ),
      pool.query<{
        entityType: string;
        title: string;
        status: string;
        requestedAt: Date;
        resolvedAt: Date | null;
      }>(
        `select request.entity_type as "entityType",
                coalesce(
                  request.entity_snapshot->>'title',
                  request.entity_type::text
                ) as title,
                request.status,
                request.requested_at as "requestedAt",
                request.resolved_at as "resolvedAt"
         from approval_request request
         where request.workspace_id = $1 and request.project_id = $2
           ${
             clientFilter
               ? `and exists (
                    select 1 from approval_request_approver approver
                    where approver.approval_request_id = request.id
                      and approver.user_id = $3
                  )`
               : ''
           }
         order by request.requested_at`,
        clientFilter
          ? [job.workspaceId, job.projectId, job.requestedByUserId]
          : [job.workspaceId, job.projectId],
      ),
      pool.query<{ label: string; completedAt: Date | null }>(
        `select label, completed_at as "completedAt"
         from project_handover_checklist_item
         where workspace_id = $1 and project_id = $2
         order by created_at`,
        [job.workspaceId, job.projectId],
      ),
    ]);
  const commentsByFeedback = new Map<
    string,
    { body: string; deleted: boolean; createdAt: string }[]
  >();
  for (const item of comments.rows) {
    const entries = commentsByFeedback.get(item.feedbackItemId) ?? [];
    entries.push({
      body: item.deletedAt ? '' : item.body,
      deleted: Boolean(item.deletedAt),
      createdAt: iso(item.createdAt)!,
    });
    commentsByFeedback.set(item.feedbackItemId, entries);
  }
  return {
    project: {
      name: job.projectName,
      companyName: job.companyName,
      description: job.description,
      status: job.projectStatus,
      plannedStartDate: dateOnly(job.plannedStartDate),
      plannedEndDate: dateOnly(job.plannedEndDate),
      exportedAt: new Date().toISOString(),
    },
    scope: scope.rows.map((item) => ({ ...item, createdAt: iso(item.createdAt)! })),
    stages: stages.rows.map((item) => ({
      ...item,
      plannedEndDate: dateOnly(item.plannedEndDate),
    })),
    updates: updates.rows.map((item) => ({ ...item, publishedAt: iso(item.publishedAt)! })),
    versions: versions.rows.map((item) => ({ ...item, publishedAt: iso(item.publishedAt) })),
    feedback: feedback.rows.map((item) => ({
      title: item.title,
      body: item.body,
      status: item.status,
      createdAt: iso(item.createdAt)!,
      comments: commentsByFeedback.get(item.id) ?? [],
    })),
    approvals: approvals.rows.map((item) => ({
      ...item,
      requestedAt: iso(item.requestedAt)!,
      resolvedAt: iso(item.resolvedAt),
    })),
    checklist: checklist.rows.map((item) => ({
      label: item.label,
      completedAt: iso(item.completedAt),
    })),
  };
}

async function loadAttachments(
  pool: Pool,
  job: ExportJobRow,
  environment: WorkerEnvironment,
): Promise<ExportAttachmentRow[]> {
  const result = await pool.query<ExportAttachmentRow>(
    `select distinct object.id, object.storage_key as "storageKey",
            object.normalized_name as "normalizedName",
            object.detected_mime_type as "detectedMimeType",
            object.size, object.checksum
     from file_link link
     inner join file_object object
       on object.id = link.file_object_id
      and object.workspace_id = link.workspace_id
      and object.project_id = link.project_id
     where link.workspace_id = $1 and link.project_id = $2
       and object.upload_status = 'available'
       and object.scan_status = 'clean'
       and object.deleted_at is null
       ${job.audience === 'client' ? "and link.visibility = 'project'" : ''}
     order by object.id`,
    [job.workspaceId, job.projectId],
  );
  const totalBytes = result.rows.reduce((sum, item) => sum + Number(item.size), 0);
  if (
    result.rows.length > environment.EXPORT_MAX_ATTACHMENTS ||
    totalBytes > environment.EXPORT_MAX_BYTES
  ) {
    throw new ExportProcessingError('EXPORT_LIMIT_EXCEEDED', false);
  }
  return result.rows;
}

async function addBuffer(pack: tar.Pack, name: string, body: Buffer) {
  await new Promise<void>((resolve, reject) => {
    pack.entry({ name, size: body.byteLength, mode: 0o600 }, body, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function validateProjectExportRecord(record: ProjectExportRecord) {
  if (typeof record.project.name !== 'string') {
    throw new ExportProcessingError('EXPORT_INVALID_PROJECT_NAME', false);
  }
  if (typeof record.project.companyName !== 'string') {
    throw new ExportProcessingError('EXPORT_INVALID_COMPANY_NAME', false);
  }
  if (typeof record.project.status !== 'string') {
    throw new ExportProcessingError('EXPORT_INVALID_PROJECT_STATUS', false);
  }
  if (
    typeof record.project.plannedStartDate !== 'string' ||
    typeof record.project.plannedEndDate !== 'string' ||
    typeof record.project.exportedAt !== 'string'
  ) {
    throw new ExportProcessingError('EXPORT_INVALID_PROJECT_DATES', false);
  }
}

export async function buildArchive(
  storage: S3ObjectStorage,
  job: ExportJobRow,
  record: ProjectExportRecord,
  attachments: readonly ExportAttachmentRow[],
): Promise<{ path: string; size: number; checksum: string }> {
  const path = join(tmpdir(), `garun-export-${job.id}-${randomUUID()}.tar.gz`);
  const pack = tar.pack();
  const archivePipeline = pipeline(pack, createGzip({ level: 6 }), createWriteStream(path));
  let archiveStage: 'content' | 'archive' | 'attachment' = 'content';
  const manifest = {
    formatVersion: 1,
    audience: job.audience,
    project: { name: job.projectName, slug: job.projectSlug },
    generatedAt: record.project.exportedAt,
    attachments: attachments.map((item, index) => ({
      path: safeAttachmentName(index, item.id, item.normalizedName),
      name: item.normalizedName,
      size: Number(item.size),
      mimeType: item.detectedMimeType ?? 'application/octet-stream',
      sha256: item.checksum,
    })),
  };
  try {
    validateProjectExportRecord(record);
    const rendered = renderProjectExport(record);
    archiveStage = 'archive';
    await addBuffer(pack, 'README.md', Buffer.from(rendered.markdown, 'utf8'));
    await addBuffer(pack, 'history.html', Buffer.from(rendered.html, 'utf8'));
    await addBuffer(
      pack,
      'manifest.json',
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    );
    for (const [index, attachment] of attachments.entries()) {
      archiveStage = 'attachment';
      const object = await storage.get(attachment.storageKey);
      if (!(object.Body instanceof Readable)) {
        throw new ExportProcessingError('SOURCE_OBJECT_UNAVAILABLE', true);
      }
      const entry = pack.entry({
        name: safeAttachmentName(index, attachment.id, attachment.normalizedName),
        size: Number(attachment.size),
        mode: 0o600,
      });
      await pipeline(object.Body, entry);
    }
    archiveStage = 'archive';
    pack.finalize();
    await archivePipeline;
    const info = await stat(path);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return { path, size: info.size, checksum: hash.digest('hex') };
  } catch (error) {
    pack.destroy();
    await archivePipeline.catch(() => undefined);
    await unlink(path).catch(() => undefined);
    if (error instanceof ExportProcessingError) throw error;
    const code = {
      content: 'EXPORT_CONTENT_RENDER_FAILED',
      archive: 'EXPORT_ARCHIVE_WRITE_FAILED',
      attachment: 'EXPORT_ATTACHMENT_READ_FAILED',
    } as const;
    throw new ExportProcessingError(code[archiveStage], archiveStage === 'attachment');
  }
}

async function processExportJob(
  pool: Pool,
  storage: S3ObjectStorage,
  environment: WorkerEnvironment,
  job: ExportJobRow,
) {
  let archivePath: string | null = null;
  let stage: 'source' | 'archive' | 'storage' | 'finalize' = 'source';
  try {
    const [record, attachments] = await Promise.all([
      loadExportRecord(pool, job),
      loadAttachments(pool, job, environment),
    ]);
    stage = 'archive';
    const archive = await buildArchive(storage, job, record, attachments);
    archivePath = archive.path;
    const storageKey = `exports/${job.workspaceId}/${job.projectId}/${job.id}.tar.gz`;
    stage = 'storage';
    await storage.putStream(
      storageKey,
      createReadStream(archive.path),
      archive.size,
      'application/gzip',
    );
    stage = 'finalize';
    const expiresAt = new Date(
      Date.now() + environment.EXPORT_ARTIFACT_RETENTION_HOURS * 60 * 60 * 1_000,
    );
    const connection = await pool.connect();
    try {
      await connection.query('begin');
      await connection.query(
        `update export_job
         set status = 'succeeded', artifact_storage_key = $2, artifact_sha256 = $3,
             artifact_size = $4, attachment_count = $5, completed_at = now(), expires_at = $6,
             processing_started_at = null, updated_at = now()
         where id = $1 and status = 'processing'`,
        [job.id, storageKey, archive.checksum, archive.size, attachments.length, expiresAt],
      );
      await connection.query(
        `insert into audit_event
          (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
         values ($1, $2, 'project.export_completed', 'project', $3, $4::jsonb)`,
        [
          job.workspaceId,
          job.requestedByUserId,
          job.projectId,
          JSON.stringify({ source: job.audience }),
        ],
      );
      await connection.query('commit');
    } catch (error) {
      await connection.query('rollback');
      await storage.delete(storageKey).catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const stageFailure = {
      source: ['EXPORT_SOURCE_LOAD_FAILED', true],
      archive: ['EXPORT_RENDER_FAILED', false],
      storage: ['EXPORT_STORAGE_WRITE_FAILED', true],
      finalize: ['EXPORT_FINALIZE_FAILED', true],
    } as const;
    const [stageFailureCode, stageRetryable] = stageFailure[stage];
    const failure =
      error instanceof ExportProcessingError
        ? error
        : new ExportProcessingError(stageFailureCode, stageRetryable);
    const terminal = !failure.retryable || job.attempts >= 5;
    await pool.query(
      `update export_job
       set status = $2::export_job_status, processing_started_at = null,
           next_attempt_at = now() + make_interval(secs => $3),
           completed_at = case when $2::text = 'failed' then now() else null end,
           failure_code = case when $2::text = 'failed' then $4 else null end,
           updated_at = now()
       where id = $1`,
      [job.id, terminal ? 'failed' : 'pending', Math.min(300, 2 ** job.attempts * 5), failure.code],
    );
  } finally {
    if (archivePath) await unlink(archivePath).catch(() => undefined);
  }
}

async function cleanupExpiredExports(pool: Pool, storage: S3ObjectStorage) {
  const result = await pool.query<{ id: string; storageKey: string }>(`
    select id, artifact_storage_key as "storageKey"
    from export_job
    where status = 'succeeded' and expires_at <= now()
    order by expires_at
    limit 10
  `);
  for (const job of result.rows) {
    try {
      await storage.delete(job.storageKey);
      await pool.query(
        `update export_job
         set status = 'expired', artifact_storage_key = null, artifact_sha256 = null,
             artifact_size = null, attachment_count = null, failure_code = 'EXPIRED',
             updated_at = now()
         where id = $1 and status = 'succeeded'`,
        [job.id],
      );
    } catch {
      // A later cleanup cycle retries without exposing the object key in logs.
    }
  }
}

export function startExportProcessor(
  pool: Pool,
  environment: WorkerEnvironment,
  logger: {
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
  let running = false;
  const cycle = async () => {
    if (running) return;
    running = true;
    try {
      await failInaccessibleJobs(pool);
      await cleanupExpiredExports(pool, storage);
      const job = await claimExportJob(pool);
      if (job) await processExportJob(pool, storage, environment, job);
    } catch {
      logger.error({ errorCode: 'EXPORT_PROCESSOR_FAILED' }, 'Export processor cycle failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void cycle(), 3_000);
  timer.unref();
  void cycle();
  return () => clearInterval(timer);
}

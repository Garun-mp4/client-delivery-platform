import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import pg from 'pg';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString, max: 2 });
const connection = await pool.connect();
const suffix = randomUUID().slice(0, 8);

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((percentileValue / 100) * sorted.length) - 1] ?? 0;
}

async function measure(query, params, iterations = 30) {
  const values = [];
  for (let index = 0; index < iterations + 3; index += 1) {
    const startedAt = performance.now();
    await connection.query(query, params);
    if (index >= 3) values.push(performance.now() - startedAt);
  }
  return Number(percentile(values, 95).toFixed(2));
}

try {
  await connection.query('begin');
  const ownerId = randomUUID();
  const workspaceId = randomUUID();
  const companyId = randomUUID();
  const projectId = randomUUID();
  const feedbackId = randomUUID();
  const versionId = randomUUID();
  await connection.query(
    `insert into "user" (id, name, email) values ($1, 'Performance owner', $2)`,
    [ownerId, `performance-${suffix}@example.test`],
  );
  await connection.query(
    `insert into workspace (id, name, slug, owner_id)
     values ($1, 'Performance workspace', $2, $3)`,
    [workspaceId, `performance-${suffix}`, ownerId],
  );
  await connection.query(
    `insert into workspace_membership (workspace_id, user_id, role)
     values ($1, $2, 'owner')`,
    [workspaceId, ownerId],
  );
  await connection.query(
    `insert into client_company (id, workspace_id, name)
     values ($1, $2, 'Performance client')`,
    [companyId, workspaceId],
  );
  await connection.query(
    `insert into project
       (id, workspace_id, client_company_id, name, slug, project_type, status, owner_user_id,
        planned_start_date, planned_end_date)
     values ($1, $2, $3, 'Primary performance project', $4, 'website', 'in_progress', $5,
             '2026-01-01', '2026-12-31')`,
    [projectId, workspaceId, companyId, `performance-project-${suffix}`, ownerId],
  );
  await connection.query(
    `insert into project
       (workspace_id, client_company_id, name, slug, project_type, status, owner_user_id,
        planned_start_date, planned_end_date)
     select $1, $2, 'Project ' || series, $3 || '-' || series, 'website',
            case when series % 7 = 0 then 'waiting_for_client'::project_status else 'in_progress'::project_status end,
            $4, '2026-01-01', '2026-12-31'
     from generate_series(1, 100) series`,
    [workspaceId, companyId, `performance-${suffix}`, ownerId],
  );
  await connection.query(
    `insert into site_version
       (id, workspace_id, project_id, version_number, name, change_log, check_instructions, url,
        environment_type, access_mode, security_status, availability_status, client_visible,
        published_by_user_id, published_at)
     values ($1, $2, $3, 1, 'Version', 'Changes', 'Check', 'https://example.test',
             'preview', 'public', 'safe', 'reachable', true, $4, now())`,
    [versionId, workspaceId, projectId, ownerId],
  );
  await connection.query(
    `insert into feedback_item
       (id, workspace_id, project_id, site_version_id, title, body, created_by_user_id)
     values ($1, $2, $3, $4, 'Feedback', 'Body', $5)`,
    [feedbackId, workspaceId, projectId, versionId, ownerId],
  );
  await connection.query(
    `insert into comment (workspace_id, project_id, feedback_item_id, body, author_user_id, created_at)
     select $1, $2, $3, 'Comment ' || series, $4, now() - make_interval(secs => 5000 - series)
     from generate_series(1, 5000) series`,
    [workspaceId, projectId, feedbackId, ownerId],
  );
  await connection.query(
    `insert into file_object
       (workspace_id, project_id, storage_key, original_name, normalized_name, declared_mime_type,
        detected_mime_type, size, client_checksum, upload_session_key, checksum, upload_status,
        scan_status, uploaded_by_user_id, upload_expires_at, uploaded_at, available_at)
     select $1, $2, 'performance/' || series, 'file-' || series || '.txt',
            'file-' || series || '.txt', 'text/plain', 'text/plain', 128,
            repeat('a', 64), 'performance-' || series, repeat('b', 64), 'available', 'clean',
            $3, now() + interval '1 hour', now(), now()
     from generate_series(1, 10000) series`,
    [workspaceId, projectId, ownerId],
  );

  const catalogP95 = await measure(
    `select project.id, project.name, project.status, project.updated_at
     from project
     where project.workspace_id = $1 and project.status <> 'archived'
     order by (project.status = 'waiting_for_client') desc, project.updated_at desc
     limit 24`,
    [workspaceId],
  );
  const commentsP95 = await measure(
    `select id, body, created_at
     from comment
     where feedback_item_id = $1
     order by created_at desc
     limit 50`,
    [feedbackId],
  );
  const filesP95 = await measure(
    `select count(*), coalesce(sum(size), 0)
     from file_object
     where workspace_id = $1 and upload_status <> 'deleted'`,
    [workspaceId],
  );
  const result = { catalogP95, commentsP95, filesP95 };
  console.log(JSON.stringify({ profile: 'local-compose', rows: [100, 5000, 10000], ...result }));
  if (catalogP95 > 250 || commentsP95 > 250 || filesP95 > 350) {
    throw new Error(`Performance budget exceeded: ${JSON.stringify(result)}`);
  }
} finally {
  await connection.query('rollback').catch(() => undefined);
  connection.release();
  await pool.end();
}

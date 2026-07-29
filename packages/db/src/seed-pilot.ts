import { parseDatabaseEnv } from '@garun/config';
import { Pool } from 'pg';

const workspaceSlug = process.env.PILOT_WORKSPACE_SLUG?.trim();
const ownerEmail = process.env.PILOT_OWNER_EMAIL?.trim().toLowerCase();
if (!workspaceSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceSlug)) {
  throw new Error('PILOT_WORKSPACE_SLUG is required and must be a valid slug.');
}
if (!ownerEmail || !ownerEmail.includes('@')) {
  throw new Error('PILOT_OWNER_EMAIL is required.');
}
const pool = new Pool({ connectionString: parseDatabaseEnv().DATABASE_URL, max: 1 });
const connection = await pool.connect();
try {
  await connection.query('begin');
  const context = await connection.query<{ workspaceId: string; ownerId: string }>(
    `select workspace.id as "workspaceId", member.user_id as "ownerId"
     from workspace
     inner join workspace_membership member
       on member.workspace_id = workspace.id
      and member.role = 'owner'
      and member.status = 'active'
     inner join "user" owner on owner.id = member.user_id and owner.status = 'active'
     where workspace.slug = $1 and owner.email = $2
     for update of workspace`,
    [workspaceSlug, ownerEmail],
  );
  const tenant = context.rows[0];
  if (!tenant) throw new Error('Active bootstrapped owner/workspace pair was not found.');
  const company = await connection.query<{ id: string }>(
    `select id from client_company
     where workspace_id = $1 and name = 'Демонстрационный клиент'
     limit 1`,
    [tenant.workspaceId],
  );
  let companyId = company.rows[0]?.id;
  if (!companyId) {
    const created = await connection.query<{ id: string }>(
      `insert into client_company (workspace_id, name)
       values ($1, 'Демонстрационный клиент')
       returning id`,
      [tenant.workspaceId],
    );
    companyId = created.rows[0]!.id;
  }
  const project = await connection.query<{ id: string }>(
    `insert into project
       (workspace_id, client_company_id, name, slug, description, project_type, status,
        owner_user_id, planned_start_date, planned_end_date)
     values
       ($1, $2, 'Пилотный сайт', 'pilot-demo',
        'Безопасный локальный набор данных для проверки полного клиентского пути.',
        'website', 'in_progress', $3, current_date, current_date + 45)
     on conflict (workspace_id, slug) do update set updated_at = project.updated_at
     returning id`,
    [tenant.workspaceId, companyId, tenant.ownerId],
  );
  const projectId = project.rows[0]!.id;
  await connection.query(
    `insert into project_stage
       (workspace_id, project_id, name, description, order_index, weight, status, owner_user_id,
        client_visible, is_required, counts_toward_progress, planned_start_date, planned_end_date)
     values
       ($1, $2, 'Подготовка', 'Собрать исходные данные', 0, 20, 'in_progress', $3, true, true, true,
        current_date, current_date + 7),
       ($1, $2, 'Разработка', 'Собрать и проверить сайт', 1, 60, 'not_started', $3, true, true, true,
        current_date + 8, current_date + 35),
       ($1, $2, 'Передача', 'Финальная проверка и передача', 2, 20, 'not_started', $3, true, true, true,
        current_date + 36, current_date + 45)
     on conflict (project_id, order_index) do nothing`,
    [tenant.workspaceId, projectId, tenant.ownerId],
  );
  await connection.query(
    `insert into project_update
       (workspace_id, project_id, title, body, visibility, importance, created_by_user_id)
     select $1, $2, 'Пилотный проект подготовлен',
            'Следующий шаг — пригласить клиента и пройти путь от материалов до передачи.',
            'internal', 'important', $3
     where not exists (
       select 1 from project_update
       where project_id = $2 and title = 'Пилотный проект подготовлен'
     )`,
    [tenant.workspaceId, projectId, tenant.ownerId],
  );
  await connection.query(
    `insert into audit_event
       (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
     select $1, $2, 'pilot.seeded', 'project', $3, '{"source":"local_pilot_seed"}'::jsonb
     where not exists (
       select 1 from audit_event
       where workspace_id = $1 and action = 'pilot.seeded' and entity_id = $3
     )`,
    [tenant.workspaceId, tenant.ownerId, projectId],
  );
  await connection.query('commit');
  console.log('Pilot demo data is ready. No credentials or identifiers were printed.');
} catch (error) {
  await connection.query('rollback');
  throw error;
} finally {
  connection.release();
  await pool.end();
}

import type { Pool } from 'pg';

import { checkSiteUrl } from './url-security';

interface ClaimedVersion {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly url: string;
  readonly attempt: number;
}

async function claim(pool: Pool): Promise<ClaimedVersion | null> {
  await pool.query(
    `update site_version
     set security_status = 'error', next_check_at = now(), updated_at = now()
     where security_status = 'checking' and updated_at < now() - interval '5 minutes'`,
  );
  const result = await pool.query<ClaimedVersion>(`
    update site_version
    set security_status = 'checking', check_attempts = check_attempts + 1, updated_at = now()
    where id = (
      select id from site_version
      where security_status in ('pending', 'error') and check_attempts < 5
        and next_check_at <= now()
      order by created_at for update skip locked limit 1
    )
    returning id, workspace_id as "workspaceId", project_id as "projectId", url,
              check_attempts as attempt
  `);
  return result.rows[0] ?? null;
}

function safeErrorCode(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return [
    'URL_SCHEME_BLOCKED',
    'URL_PORT_BLOCKED',
    'URL_ADDRESS_BLOCKED',
    'URL_REDIRECT_LIMIT',
    'URL_DNS_EMPTY',
  ].includes(code)
    ? code
    : 'URL_CHECK_FAILED';
}

export function startUrlChecker(
  pool: Pool,
  publicAppUrl: string,
  logger: {
    info: (value: object, message: string) => void;
    warn: (value: object, message: string) => void;
    error: (value: object, message: string) => void;
  },
) {
  let running = false;
  const processOne = async () => {
    if (running) return;
    running = true;
    let version: ClaimedVersion | null = null;
    try {
      version = await claim(pool);
      if (!version) return;
      try {
        const result = await checkSiteUrl(version.url, publicAppUrl);
        const connection = await pool.connect();
        try {
          await connection.query('begin');
          await connection.query(
            `update site_version
             set security_status = $2, availability_status = $3, embed_status = $4,
                 checked_at = now(), updated_at = now()
             where id = $1 and security_status = 'checking'`,
            [version.id, result.security, result.availability, result.embed],
          );
          await connection.query(
            `insert into site_version_check_attempt
               (workspace_id, project_id, site_version_id, attempt, security_status,
                availability_status, result_code, final_url_origin)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              version.workspaceId,
              version.projectId,
              version.id,
              version.attempt,
              result.security,
              result.availability,
              result.code,
              result.finalOrigin,
            ],
          );
          await connection.query('commit');
        } catch (error) {
          await connection.query('rollback');
          throw error;
        } finally {
          connection.release();
        }
        logger.info(
          {
            siteVersionId: version.id,
            workspaceId: version.workspaceId,
            availability: result.availability,
          },
          'Site URL check completed',
        );
      } catch (error) {
        const code = safeErrorCode(error);
        const unsafe = code.includes('BLOCKED') || code === 'URL_REDIRECT_LIMIT';
        const terminal = unsafe || version.attempt >= 5;
        await pool.query(
          `update site_version
           set security_status = $2, availability_status = 'unreachable',
               next_check_at = now() + ($3 * interval '1 second'), checked_at = now(), updated_at = now()
           where id = $1`,
          [version.id, unsafe ? 'unsafe' : 'error', Math.min(300, 2 ** version.attempt * 5)],
        );
        await pool.query(
          `insert into site_version_check_attempt
             (workspace_id, project_id, site_version_id, attempt, security_status,
              availability_status, result_code)
           values ($1, $2, $3, $4, $5, 'unreachable', $6)`,
          [
            version.workspaceId,
            version.projectId,
            version.id,
            version.attempt,
            unsafe ? 'unsafe' : 'error',
            code,
          ],
        );
        logger.warn(
          {
            siteVersionId: version.id,
            workspaceId: version.workspaceId,
            errorCode: code,
            terminal,
          },
          'Site URL check failed',
        );
      }
    } catch {
      logger.error({ errorCode: 'URL_CHECK_POLL_FAILED' }, 'Site URL polling failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void processOne(), 2_000);
  timer.unref();
  void processOne();
  return () => clearInterval(timer);
}

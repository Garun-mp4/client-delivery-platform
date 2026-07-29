import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : 'compose';
if (profile !== 'compose') {
  throw new Error(
    'Only --env compose is available without an approved staging account. Follow docs/BACKUP_RESTORE.md for staging.',
  );
}
const container = execFileSync('docker', ['compose', 'ps', '-q', 'postgres'], {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)[0];
if (!container) throw new Error('Compose PostgreSQL is not running.');
const databaseName = `garun_restore_verify_${Date.now()}`;
const archivePath = join(tmpdir(), `${databaseName}.dump`);

function runDocker(args, options = {}) {
  return execFileSync('docker', ['exec', container, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

try {
  await new Promise((resolve, reject) => {
    const dump = spawn('docker', [
      'exec',
      container,
      'sh',
      '-c',
      'exec pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"',
    ]);
    const output = createWriteStream(archivePath, { mode: 0o600 });
    dump.stderr.on('data', () => undefined);
    dump.on('error', reject);
    output.on('error', reject);
    dump.stdout.pipe(output);
    dump.on('close', (code) => {
      output.end(() => (code === 0 ? resolve() : reject(new Error('pg_dump failed'))));
    });
  });
  runDocker(['sh', '-c', `createdb -U "$POSTGRES_USER" ${databaseName}`]);
  await new Promise((resolve, reject) => {
    const restore = spawn('docker', [
      'exec',
      '-i',
      container,
      'sh',
      '-c',
      `exec pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d ${databaseName}`,
    ]);
    createReadStream(archivePath).pipe(restore.stdin);
    restore.stderr.on('data', () => undefined);
    restore.on('error', reject);
    restore.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error('pg_restore failed')),
    );
  });
  const integrity = runDocker([
    'sh',
    '-c',
    `psql -At -U "$POSTGRES_USER" -d ${databaseName} -c "select count(*) from information_schema.tables where table_schema='public' and table_name in ('workspace','project','export_job','audit_event');"`,
  ]).trim();
  if (integrity !== '4') throw new Error('Restored database is missing required tables.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archivePath)) hash.update(chunk);
  const info = await stat(archivePath);
  console.log(
    JSON.stringify({
      profile,
      restoredRequiredTables: Number(integrity),
      archiveBytes: info.size,
      checksumPrefix: hash.digest('hex').slice(0, 12),
      result: 'passed',
    }),
  );
} finally {
  try {
    runDocker(['sh', '-c', `dropdb --if-exists --force -U "$POSTGRES_USER" ${databaseName}`]);
  } catch {
    // The unique rehearsal database is safe to remove manually if Docker stopped mid-run.
  }
  await unlink(archivePath).catch(() => undefined);
}

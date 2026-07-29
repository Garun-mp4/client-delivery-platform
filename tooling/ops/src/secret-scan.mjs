import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const tracked = execFileSync(
  'git',
  ['-C', repositoryRoot, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const forbiddenPaths = tracked.filter((path) => {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.endsWith('.env.example')) return false;
  return (
    /(^|\/)\.env($|\.)/.test(normalized) ||
    /(^|\/)(node_modules|\.next|\.turbo|dist|coverage)\//.test(normalized) ||
    /\.(log|sqlite|sqlite3|pem|key)$/i.test(normalized)
  );
});
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['live payment key', /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ['Resend API key', /\bre_[A-Za-z0-9_-]{24,}\b/],
];
const findings = [];
for (const path of tracked) {
  let content;
  try {
    const bytes = readFileSync(join(repositoryRoot, path));
    if (bytes.includes(0) || bytes.byteLength > 5_000_000) continue;
    content = bytes.toString('utf8');
  } catch {
    continue;
  }
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) findings.push(`${path}: ${label}`);
  }
}
if (forbiddenPaths.length > 0 || findings.length > 0) {
  console.error(
    [...forbiddenPaths.map((path) => `${path}: forbidden tracked path`), ...findings].join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${tracked.length} tracked and untracked repository files.`);
}

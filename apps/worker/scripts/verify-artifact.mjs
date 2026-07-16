import { readFile } from 'node:fs/promises';

const artifactUrl = new URL('../dist/index.js', import.meta.url);
const artifact = await readFile(artifactUrl, 'utf8');
const importSpecifiers = [
  ...artifact.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g),
].map((match) => match[1]);

const sourceDependency = importSpecifiers.find(
  (specifier) =>
    specifier?.startsWith('@garun/') ||
    specifier?.endsWith('.ts') ||
    specifier?.includes('/packages/') ||
    specifier?.includes('\\packages\\'),
);

if (sourceDependency) {
  throw new Error(`Worker artifact depends on a workspace source import: ${sourceDependency}`);
}

process.stdout.write('Worker artifact contains no workspace TypeScript imports.\n');

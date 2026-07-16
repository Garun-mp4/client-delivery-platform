import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  entry: ['src/index.ts'],
  external: ['drizzle-orm', 'drizzle-orm/node-postgres', 'ioredis', 'pg', 'pino'],
  format: ['esm'],
  noExternal: [/@garun\//],
  platform: 'node',
  sourcemap: true,
  target: 'node22',
});

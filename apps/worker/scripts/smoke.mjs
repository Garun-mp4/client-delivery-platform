const baseUrl = process.env.WORKER_BASE_URL ?? 'http://127.0.0.1:3001';

async function assertHealth(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'x-request-id': 'worker-smoke-request' },
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.json();

  if (!response.ok || body.status !== 'ok') {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  if (response.headers.get('x-request-id') !== 'worker-smoke-request') {
    throw new Error(`${path} did not preserve the correlation id.`);
  }
}

await assertHealth('/health/live');
await assertHealth('/health/ready');
process.stdout.write('Worker foundation smoke test passed.\n');

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';

async function assertResponse(path, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'x-request-id': 'smoke-request' },
    signal: AbortSignal.timeout(5_000),
  });

  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}`);
  }

  return response;
}

const page = await assertResponse('/');
if (!(await page.text()).includes('Garun Workspace')) {
  throw new Error('Foundation page does not contain the configured product name.');
}

const live = await assertResponse('/api/health/live');
const liveBody = await live.json();
if (liveBody.status !== 'ok' || live.headers.get('x-request-id') !== 'smoke-request') {
  throw new Error('Liveness response or correlation id is invalid.');
}

await assertResponse('/api/health/ready');
process.stdout.write('Web foundation smoke test passed.\n');

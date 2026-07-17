const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
const requestTimeoutMs = 5_000;
const readinessDeadlineMs = 30_000;
const retryDelayMs = 500;

class UnexpectedStatusError extends Error {}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function assertResponse(path, expectedStatus = 200) {
  const deadline = Date.now() + readinessDeadlineMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { 'x-request-id': 'smoke-request' },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (response.status === expectedStatus) {
        return response;
      }
      if (response.status < 500) {
        throw new UnexpectedStatusError(
          `${path} returned ${response.status}, expected ${expectedStatus}`,
        );
      }
      lastError = new Error(`${path} returned ${response.status}, expected ${expectedStatus}`);
    } catch (error) {
      if (error instanceof UnexpectedStatusError) {
        throw error;
      }
      lastError = error;
    }

    await delay(Math.min(retryDelayMs, Math.max(0, deadline - Date.now())));
  }

  throw new Error(`${path} did not become ready within ${readinessDeadlineMs}ms`, {
    cause: lastError,
  });
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

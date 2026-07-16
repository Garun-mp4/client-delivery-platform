import type { HealthResponse } from '@garun/contracts';

export function createWorkerHealthResponse(
  requestId: string,
  checks?: HealthResponse['checks'],
): HealthResponse {
  const status =
    checks && Object.values(checks).some((check) => check === 'error') ? 'degraded' : 'ok';
  return { service: 'worker', status, requestId, ...(checks ? { checks } : {}) };
}

import type { HealthResponse } from '@garun/contracts';

export function createHealthResponse(
  requestId: string,
  checks?: HealthResponse['checks'],
): HealthResponse {
  const status =
    checks && Object.values(checks).some((check) => check === 'error') ? 'degraded' : 'ok';
  return { service: 'web', status, requestId, ...(checks ? { checks } : {}) };
}

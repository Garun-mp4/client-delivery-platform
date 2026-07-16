export const healthStatuses = ['ok', 'degraded'] as const;

export type HealthStatus = (typeof healthStatuses)[number];

export interface HealthResponse {
  readonly service: 'web' | 'worker';
  readonly status: HealthStatus;
  readonly requestId: string;
  readonly checks?: Readonly<Record<string, 'ok' | 'error'>>;
}

export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
    readonly requestId: string;
  };
}

export function createErrorEnvelope(
  requestId: string,
  code = 'INTERNAL_ERROR',
  message = 'Не удалось выполнить запрос.',
): ErrorEnvelope {
  return { error: { code, message, fieldErrors: {}, requestId } };
}

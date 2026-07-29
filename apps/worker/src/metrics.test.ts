import { describe, expect, it } from 'vitest';

import { formatOperationsMetrics } from './metrics';

describe('operations metrics', () => {
  it('contains only fixed aggregate names and numeric values', () => {
    const result = formatOperationsMetrics({
      outboxPending: 2,
      notificationFailed: 1,
      exportPending: 3,
      exportFailed: 0,
      fileProcessing: 4,
      coverCapturePending: 5,
    });
    expect(result).toContain('garun_export_jobs_pending 3');
    expect(result).not.toContain('workspace');
    expect(result).not.toContain('project');
    expect(result).not.toContain('token');
  });
});

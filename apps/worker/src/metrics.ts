import type { Pool } from 'pg';

export interface OperationsMetrics {
  readonly outboxPending: number;
  readonly notificationFailed: number;
  readonly exportPending: number;
  readonly exportFailed: number;
  readonly fileProcessing: number;
  readonly coverCapturePending: number;
}

export async function readOperationsMetrics(pool: Pool): Promise<OperationsMetrics> {
  const result = await pool.query<{
    outboxPending: string;
    notificationFailed: string;
    exportPending: string;
    exportFailed: string;
    fileProcessing: string;
    coverCapturePending: string;
  }>(`
    select
      (select count(*) from outbox_event where status in ('pending', 'processing')) as "outboxPending",
      (select count(*) from notification_delivery where status = 'failed') as "notificationFailed",
      (select count(*) from export_job where status in ('pending', 'processing')) as "exportPending",
      (select count(*) from export_job where status = 'failed') as "exportFailed",
      (select count(*) from file_object where upload_status in ('uploaded', 'scanning')) as "fileProcessing",
      (select count(*) from project_cover_capture where status in ('pending', 'processing')) as "coverCapturePending"
  `);
  const row = result.rows[0]!;
  return {
    outboxPending: Number(row.outboxPending),
    notificationFailed: Number(row.notificationFailed),
    exportPending: Number(row.exportPending),
    exportFailed: Number(row.exportFailed),
    fileProcessing: Number(row.fileProcessing),
    coverCapturePending: Number(row.coverCapturePending),
  };
}

export function formatOperationsMetrics(metrics: OperationsMetrics): string {
  const values = [
    ['garun_outbox_pending', metrics.outboxPending],
    ['garun_notification_delivery_failed', metrics.notificationFailed],
    ['garun_export_jobs_pending', metrics.exportPending],
    ['garun_export_jobs_failed', metrics.exportFailed],
    ['garun_file_processing_pending', metrics.fileProcessing],
    ['garun_cover_capture_pending', metrics.coverCapturePending],
  ] as const;
  return `${values.map(([name, value]) => `# TYPE ${name} gauge\n${name} ${value}`).join('\n')}\n`;
}

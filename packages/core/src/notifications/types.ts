export const notificationEventTypes = [
  'action.created',
  'action.reminder.due_soon',
  'action.reminder.overdue',
  'material.requested',
  'site_version.published',
  'feedback.created',
  'feedback.comment_added',
  'approval.requested',
  'approval.approved',
  'approval.changes_requested',
  'project.completed',
  'project.archived',
] as const;

export type NotificationEventType = (typeof notificationEventTypes)[number];

export interface NotificationPresentation {
  readonly title: string;
  readonly description: string;
}

export interface NotificationPreferenceInput {
  readonly emailEnabled: boolean;
  readonly remindersEnabled: boolean;
  readonly timezone: string;
  readonly quietHoursStartMinute: number | null;
  readonly quietHoursEndMinute: number | null;
}

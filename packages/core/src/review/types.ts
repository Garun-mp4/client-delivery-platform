export type FeedbackStatus =
  | 'new'
  | 'accepted'
  | 'clarification'
  | 'in_progress'
  | 'fixed'
  | 'awaiting_verification'
  | 'closed'
  | 'rejected';

export interface ProjectUpdateInput {
  readonly title: string;
  readonly body: string;
  readonly visibility: 'internal' | 'client';
  readonly importance: 'normal' | 'important';
  readonly pinned: boolean;
}

export interface SiteVersionInput {
  readonly name: string;
  readonly description: string | null;
  readonly changeLog: string;
  readonly checkInstructions: string;
  readonly url: string;
  readonly environmentType:
    'prototype' | 'design' | 'preview' | 'staging' | 'production' | 'archived';
  readonly accessMode: 'public' | 'password';
  readonly accessSecretEncrypted: string | null;
}

export interface FeedbackInput {
  readonly siteVersionId: string;
  readonly title: string;
  readonly body: string;
  readonly priority: 'low' | 'normal' | 'high' | 'blocking';
  readonly pageUrl: string | null;
  readonly screenshotFileId: string | null;
}

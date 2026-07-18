import type { FeedbackInput, ProjectUpdateInput, SiteVersionInput } from './types';

function text(value: unknown, max: number, required = true) {
  if (typeof value !== 'string') {
    if (!required) return null;
    throw new Error('INVALID_INPUT');
  }
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) throw new Error('INVALID_INPUT');
  return normalized || null;
}

export function normalizeSiteUrl(value: unknown): string {
  const raw = text(value, 2_048);
  try {
    const url = new URL(raw!);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('INVALID_URL');
    }
    url.hash = '';
    return url.toString();
  } catch {
    throw new Error('INVALID_URL');
  }
}

export function parseProjectUpdateInput(input: Record<string, unknown>): ProjectUpdateInput {
  const visibility = input.visibility === 'internal' ? 'internal' : 'client';
  return {
    title: text(input.title, 160)!,
    body: text(input.body, 10_000)!,
    visibility,
    importance: input.importance === 'important' ? 'important' : 'normal',
    pinned: input.pinned === 'yes',
  };
}

export function parseFeedbackInput(input: Record<string, unknown>): FeedbackInput {
  const priorities = ['low', 'normal', 'high', 'blocking'] as const;
  const priority = priorities.find((item) => item === input.priority) ?? 'normal';
  return {
    siteVersionId: text(input.siteVersionId, 80)!,
    title: text(input.title, 200)!,
    body: text(input.body, 10_000)!,
    priority,
    pageUrl: input.pageUrl ? normalizeSiteUrl(input.pageUrl) : null,
    screenshotFileId: text(input.screenshotFileId, 80, false),
  };
}

export function parseSiteVersionInput(
  input: Record<string, unknown>,
  accessSecretEncrypted: string | null,
): SiteVersionInput {
  const environments = [
    'prototype',
    'design',
    'preview',
    'staging',
    'production',
    'archived',
  ] as const;
  const environmentType = environments.find((item) => item === input.environmentType) ?? 'preview';
  const accessMode = input.accessMode === 'password' ? 'password' : 'public';
  if (accessMode === 'password' && !accessSecretEncrypted) throw new Error('INVALID_INPUT');
  return {
    name: text(input.name, 160)!,
    description: text(input.description, 5_000, false),
    changeLog: text(input.changeLog, 10_000)!,
    checkInstructions: text(input.checkInstructions, 10_000)!,
    url: normalizeSiteUrl(input.url),
    environmentType,
    accessMode,
    accessSecretEncrypted: accessMode === 'password' ? accessSecretEncrypted : null,
  };
}

export function parseCommentBody(input: Record<string, unknown>) {
  return text(input.body, 10_000)!;
}

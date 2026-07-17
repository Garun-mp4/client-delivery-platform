import { normalizeEmail } from '../identity/primitives';
import type { ClientCompanyInput, ProjectInput } from './types';

export type ProjectValidationCode =
  | 'FIELD_REQUIRED'
  | 'FIELD_TOO_LONG'
  | 'INVALID_EMAIL'
  | 'INVALID_URL'
  | 'INVALID_SLUG'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_PROJECT_TYPE';

export class ProjectValidationError extends Error {
  constructor(
    readonly code: ProjectValidationCode,
    readonly field: string,
  ) {
    super(code);
    this.name = 'ProjectValidationError';
  }
}

function optionalString(value: unknown, field: string, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new ProjectValidationError('FIELD_TOO_LONG', field);
  return normalized;
}

function requiredString(value: unknown, field: string, max: number): string {
  const normalized = optionalString(value, field, max);
  if (!normalized) throw new ProjectValidationError('FIELD_REQUIRED', field);
  return normalized;
}

function optionalWebUrl(value: unknown): string | null {
  const normalized = optionalString(value, 'website', 500);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    throw new ProjectValidationError('INVALID_URL', 'website');
  }
}

function optionalEmail(value: unknown): string | null {
  const normalized = optionalString(value, 'email', 320);
  if (!normalized) return null;
  const email = normalizeEmail(normalized);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ProjectValidationError('INVALID_EMAIL', 'email');
  }
  return email;
}

export function parseClientCompanyInput(input: Record<string, unknown>): ClientCompanyInput {
  return {
    name: requiredString(input.name, 'name', 160),
    legalName: optionalString(input.legalName, 'legalName', 240),
    website: optionalWebUrl(input.website),
    phone: optionalString(input.phone, 'phone', 80),
    email: optionalEmail(input.email),
    messenger: optionalString(input.messenger, 'messenger', 160),
    internalNotes: optionalString(input.internalNotes, 'internalNotes', 10_000),
  };
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const projectTypes = new Set<ProjectInput['projectType']>([
  'website',
  'landing',
  'ecommerce',
  'redesign',
  'other',
]);

export function parseProjectInput(input: Record<string, unknown>): ProjectInput {
  const projectType = requiredString(input.projectType, 'projectType', 32);
  if (!projectTypes.has(projectType as ProjectInput['projectType'])) {
    throw new ProjectValidationError('INVALID_PROJECT_TYPE', 'projectType');
  }
  const plannedStartDate = requiredString(input.plannedStartDate, 'plannedStartDate', 10);
  const plannedEndDate = requiredString(input.plannedEndDate, 'plannedEndDate', 10);
  if (
    !isDateOnly(plannedStartDate) ||
    !isDateOnly(plannedEndDate) ||
    plannedEndDate < plannedStartDate
  ) {
    throw new ProjectValidationError('INVALID_DATE_RANGE', 'plannedEndDate');
  }
  const slug = requiredString(input.slug, 'slug', 80).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ProjectValidationError('INVALID_SLUG', 'slug');
  }
  return {
    clientCompanyId: requiredString(input.clientCompanyId, 'clientCompanyId', 64),
    name: requiredString(input.name, 'name', 180),
    slug,
    description: optionalString(input.description, 'description', 5_000),
    projectType: projectType as ProjectInput['projectType'],
    ownerUserId: requiredString(input.ownerUserId, 'ownerUserId', 64),
    plannedStartDate,
    plannedEndDate,
  };
}

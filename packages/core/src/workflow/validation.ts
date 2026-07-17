import type { ActionInput, ScopeRevisionInput, StageInput } from './types';

export class WorkflowValidationError extends Error {
  constructor(readonly field: string) {
    super('INVALID_INPUT');
    this.name = 'WorkflowValidationError';
  }
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (typeof value !== 'string') {
    if (required) throw new WorkflowValidationError(field);
    return null;
  }
  const normalized = value.trim();
  if ((!normalized && required) || normalized.length > max)
    throw new WorkflowValidationError(field);
  return normalized || null;
}

function list(value: unknown, field: string): string[] {
  const raw = typeof value === 'string' ? value.split(/\r?\n/) : [];
  const result = raw.map((item) => item.trim()).filter(Boolean);
  if (result.length > 100 || result.some((item) => item.length > 500)) {
    throw new WorkflowValidationError(field);
  }
  return result;
}

function dateOnly(value: unknown, field: string, required = false): string | null {
  const normalized = text(value, field, 10, required);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new WorkflowValidationError(field);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new WorkflowValidationError(field);
  }
  return normalized;
}

function safeHttpUrl(value: unknown, field: string): string | null {
  const normalized = text(value, field, 500);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('unsafe');
    }
    return parsed.toString();
  } catch {
    throw new WorkflowValidationError(field);
  }
}

export function parseScopeRevisionInput(input: Record<string, unknown>): ScopeRevisionInput {
  const plannedStartDate = dateOnly(input.plannedStartDate, 'plannedStartDate');
  const plannedEndDate = dateOnly(input.plannedEndDate, 'plannedEndDate');
  if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate) {
    throw new WorkflowValidationError('plannedEndDate');
  }
  const cost = text(input.cost, 'cost', 20);
  const currency = cost ? (text(input.currency, 'currency', 3, true) ?? '').toUpperCase() : null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new WorkflowValidationError('currency');
  const costMinor = cost ? Math.round(Number(cost.replace(',', '.')) * 100) : null;
  if (costMinor !== null && (!Number.isSafeInteger(costMinor) || costMinor < 0)) {
    throw new WorkflowValidationError('cost');
  }
  return {
    summary: text(input.summary, 'summary', 10_000, true) ?? '',
    goals: list(input.goals, 'goals'),
    audience: list(input.audience, 'audience'),
    pages: list(input.pages, 'pages'),
    features: list(input.features, 'features'),
    integrations: list(input.integrations, 'integrations'),
    deliverables: list(input.deliverables, 'deliverables'),
    responsibilities: list(input.responsibilities, 'responsibilities'),
    revisionLimits: list(input.revisionLimits, 'revisionLimits'),
    exclusions: list(input.exclusions, 'exclusions'),
    assumptions: list(input.assumptions, 'assumptions'),
    acceptanceCriteria: list(input.acceptanceCriteria, 'acceptanceCriteria'),
    contractUrl: safeHttpUrl(input.contractUrl, 'contractUrl'),
    proposalUrl: safeHttpUrl(input.proposalUrl, 'proposalUrl'),
    plannedStartDate,
    plannedEndDate,
    costMinor,
    currency,
  };
}

export function parseStageInput(input: Record<string, unknown>): StageInput {
  const plannedStartDate = dateOnly(input.plannedStartDate, 'plannedStartDate', true) ?? '';
  const plannedEndDate = dateOnly(input.plannedEndDate, 'plannedEndDate', true) ?? '';
  if (plannedEndDate < plannedStartDate) throw new WorkflowValidationError('plannedEndDate');
  const weight = Number(input.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 10_000) {
    throw new WorkflowValidationError('weight');
  }
  return {
    name: text(input.name, 'name', 180, true) ?? '',
    description: text(input.description, 'description', 5_000),
    weight,
    ownerUserId: text(input.ownerUserId, 'ownerUserId', 64, true) ?? '',
    clientVisible: input.clientVisible === 'yes' || input.clientVisible === true,
    isRequired: input.isRequired === 'yes' || input.isRequired === true,
    countsTowardProgress:
      input.countsTowardProgress === 'yes' || input.countsTowardProgress === true,
    plannedStartDate,
    plannedEndDate,
    acceptanceCriteria: text(input.acceptanceCriteria, 'acceptanceCriteria', 5_000),
  };
}

export function parseActionInput(input: Record<string, unknown>): ActionInput {
  const dueDate = dateOnly(input.dueDate, 'dueDate', true) ?? '';
  const type = text(input.type, 'type', 32, true) as ActionInput['type'];
  const priority = text(input.priority, 'priority', 16, true) as ActionInput['priority'];
  const visibility = text(input.visibility, 'visibility', 16, true) as ActionInput['visibility'];
  const types = new Set<ActionInput['type']>([
    'upload_material',
    'answer_question',
    'review_version',
    'approve_stage',
    'make_payment',
    'fix_feedback',
    'internal',
    'other',
  ]);
  if (!types.has(type)) throw new WorkflowValidationError('type');
  if (!new Set(['low', 'normal', 'high', 'urgent']).has(priority)) {
    throw new WorkflowValidationError('priority');
  }
  if (!new Set(['internal', 'client']).has(visibility)) {
    throw new WorkflowValidationError('visibility');
  }
  return {
    stageId: text(input.stageId, 'stageId', 64),
    title: text(input.title, 'title', 240, true) ?? '',
    description: text(input.description, 'description', 5_000),
    type,
    priority,
    visibility,
    assigneeUserId: text(input.assigneeUserId, 'assigneeUserId', 64, true) ?? '',
    dueAt: new Date(`${dueDate}T23:59:59.999Z`),
    isBlocking: input.isBlocking === 'yes' || input.isBlocking === true,
  };
}

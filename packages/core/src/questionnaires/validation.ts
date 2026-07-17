import {
  questionnaireFieldTypes,
  type QuestionnaireAnswers,
  type QuestionnaireCondition,
  type QuestionnaireField,
  type QuestionnaireInput,
  type QuestionnaireSchema,
  type QuestionnaireValidationResult,
} from './types';

export class QuestionnaireValidationError extends Error {
  constructor(readonly field: string) {
    super('INVALID_INPUT');
    this.name = 'QuestionnaireValidationError';
  }
}

const idPattern = /^[a-z][a-z0-9_]{1,63}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d][\d\s().-]{5,31}$/;

function text(value: unknown, field: string, max: number, required = false) {
  if (typeof value !== 'string') {
    if (required) throw new QuestionnaireValidationError(field);
    return undefined;
  }
  const normalized = value.trim();
  if ((!normalized && required) || normalized.length > max) {
    throw new QuestionnaireValidationError(field);
  }
  return normalized || undefined;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new QuestionnaireValidationError(field);
  }
  return value as Record<string, unknown>;
}

function parseCondition(value: unknown, knownIds: ReadonlySet<string>, field: string) {
  if (value === undefined) return undefined;
  const input = object(value, field);
  const fieldId = text(input.fieldId, `${field}.fieldId`, 64, true)!;
  if (!knownIds.has(fieldId)) throw new QuestionnaireValidationError(`${field}.fieldId`);
  const operator = text(input.operator, `${field}.operator`, 20, true);
  if (!['equals', 'not_equals', 'contains', 'truthy'].includes(operator ?? '')) {
    throw new QuestionnaireValidationError(`${field}.operator`);
  }
  if (input.value !== undefined && !['string', 'number', 'boolean'].includes(typeof input.value)) {
    throw new QuestionnaireValidationError(`${field}.value`);
  }
  return {
    fieldId,
    operator: operator as QuestionnaireCondition['operator'],
    ...(input.value === undefined ? {} : { value: input.value as string | number | boolean }),
  };
}

function parseField(
  value: unknown,
  knownIds: Set<string>,
  path: string,
  nested: boolean,
  allowFileFields: boolean,
): QuestionnaireField {
  const input = object(value, path);
  const id = text(input.id, `${path}.id`, 64, true)!;
  if (!idPattern.test(id) || knownIds.has(id)) throw new QuestionnaireValidationError(`${path}.id`);
  const type = text(input.type, `${path}.type`, 32, true);
  if (!questionnaireFieldTypes.includes(type as QuestionnaireField['type'])) {
    throw new QuestionnaireValidationError(`${path}.type`);
  }
  if (nested && (type === 'repeating_group' || type === 'info')) {
    throw new QuestionnaireValidationError(`${path}.type`);
  }
  if (!allowFileFields && (type === 'file' || type === 'image')) {
    throw new QuestionnaireValidationError(`${path}.type`);
  }
  const condition = parseCondition(input.condition, knownIds, `${path}.condition`);
  knownIds.add(id);
  const options =
    type === 'single_choice' || type === 'multiple_choice'
      ? Array.isArray(input.options)
        ? [...new Set(input.options.map((item) => text(item, `${path}.options`, 120, true)!))]
        : []
      : undefined;
  if (options && (options.length < 2 || options.length > 30)) {
    throw new QuestionnaireValidationError(`${path}.options`);
  }
  const children =
    type === 'repeating_group'
      ? Array.isArray(input.fields)
        ? (() => {
            const childIds = new Set<string>();
            return input.fields.map((item, index) =>
              parseField(item, childIds, `${path}.fields.${index}`, true, allowFileFields),
            );
          })()
        : []
      : undefined;
  if (children && (children.length === 0 || children.length > 20)) {
    throw new QuestionnaireValidationError(`${path}.fields`);
  }
  return {
    id,
    type: type as QuestionnaireField['type'],
    label: text(input.label, `${path}.label`, 240, true)!,
    required: input.required === true,
    ...(text(input.hint, `${path}.hint`, 1_000)
      ? { hint: text(input.hint, `${path}.hint`, 1_000) }
      : {}),
    ...(text(input.example, `${path}.example`, 500)
      ? { example: text(input.example, `${path}.example`, 500) }
      : {}),
    ...(options ? { options } : {}),
    ...(condition ? { condition } : {}),
    ...(children ? { fields: children } : {}),
  };
}

export function parseQuestionnaireSchema(
  value: unknown,
  options: { readonly allowFileFields?: boolean } = {},
): QuestionnaireSchema {
  const input = object(value, 'schema');
  if (input.version !== 1 || !Array.isArray(input.sections)) {
    throw new QuestionnaireValidationError('schema.version');
  }
  if (input.sections.length === 0 || input.sections.length > 20) {
    throw new QuestionnaireValidationError('schema.sections');
  }
  const knownIds = new Set<string>();
  const sectionIds = new Set<string>();
  let fieldCount = 0;
  const sections = input.sections.map((value, sectionIndex) => {
    const section = object(value, `schema.sections.${sectionIndex}`);
    const id = text(section.id, `schema.sections.${sectionIndex}.id`, 64, true)!;
    if (!idPattern.test(id)) {
      throw new QuestionnaireValidationError(`schema.sections.${sectionIndex}.id`);
    }
    if (sectionIds.has(id)) {
      throw new QuestionnaireValidationError(`schema.sections.${sectionIndex}.id`);
    }
    sectionIds.add(id);
    if (!Array.isArray(section.fields) || section.fields.length === 0) {
      throw new QuestionnaireValidationError(`schema.sections.${sectionIndex}.fields`);
    }
    const fields = section.fields.map((item, fieldIndex) =>
      parseField(
        item,
        knownIds,
        `schema.sections.${sectionIndex}.fields.${fieldIndex}`,
        false,
        options.allowFileFields === true,
      ),
    );
    fieldCount +=
      fields.length + fields.reduce((sum, field) => sum + (field.fields?.length ?? 0), 0);
    return {
      id,
      title: text(section.title, `schema.sections.${sectionIndex}.title`, 240, true)!,
      ...(text(section.description, `schema.sections.${sectionIndex}.description`, 1_000)
        ? {
            description: text(
              section.description,
              `schema.sections.${sectionIndex}.description`,
              1_000,
            ),
          }
        : {}),
      fields,
    };
  });
  if (fieldCount > 100) throw new QuestionnaireValidationError('schema.fields');
  return { version: 1, sections };
}

function parseDueDate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new QuestionnaireValidationError('dueDate');
  }
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new QuestionnaireValidationError('dueDate');
  }
  return date;
}

export function parseQuestionnaireInput(input: Record<string, unknown>): QuestionnaireInput {
  let schemaValue: unknown = input.schema;
  if (typeof schemaValue === 'string') {
    try {
      schemaValue = JSON.parse(schemaValue) as unknown;
    } catch {
      throw new QuestionnaireValidationError('schema');
    }
  }
  return {
    title: text(input.title, 'title', 240, true)!,
    description: text(input.description, 'description', 5_000) ?? null,
    assignedToUserId: text(input.assignedToUserId, 'assignedToUserId', 64, true)!,
    dueAt: parseDueDate(input.dueDate),
    schema: parseQuestionnaireSchema(schemaValue),
  };
}

function conditionMatches(
  condition: QuestionnaireCondition | undefined,
  answers: QuestionnaireAnswers,
) {
  if (!condition) return true;
  const actual = answers[condition.fieldId];
  switch (condition.operator) {
    case 'equals':
      return actual === condition.value;
    case 'not_equals':
      return actual !== condition.value;
    case 'contains':
      return Array.isArray(actual)
        ? actual.includes(condition.value)
        : typeof actual === 'string' && typeof condition.value === 'string'
          ? actual.includes(condition.value)
          : false;
    case 'truthy':
      return Boolean(actual);
  }
}

function hasValue(value: unknown) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function validateScalar(field: QuestionnaireField, value: unknown, path: string) {
  if (!hasValue(value)) return undefined;
  switch (field.type) {
    case 'short_text':
      return typeof value === 'string' && value.trim().length <= 500 ? value.trim() : undefined;
    case 'long_text':
      return typeof value === 'string' && value.trim().length <= 20_000 ? value.trim() : undefined;
    case 'email':
      return typeof value === 'string' && emailPattern.test(value.trim().toLowerCase())
        ? value.trim().toLowerCase()
        : undefined;
    case 'phone':
      return typeof value === 'string' && phonePattern.test(value.trim())
        ? value.trim()
        : undefined;
    case 'url':
      if (typeof value !== 'string' || value.length > 2_000) return undefined;
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
          ? url.toString()
          : undefined;
      } catch {
        return undefined;
      }
    case 'number': {
      const numberValue = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numberValue) ? numberValue : undefined;
    }
    case 'single_choice':
      return typeof value === 'string' && field.options?.includes(value) ? value : undefined;
    case 'multiple_choice':
      return Array.isArray(value) &&
        value.every((item) => typeof item === 'string' && field.options?.includes(item))
        ? [...new Set(value)]
        : undefined;
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
      {
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
          ? value
          : undefined;
      }
    case 'toggle':
      return typeof value === 'boolean' ? value : undefined;
    case 'file':
    case 'image':
      return undefined;
    case 'info':
    case 'repeating_group':
      throw new QuestionnaireValidationError(path);
  }
}

function validateField(
  field: QuestionnaireField,
  answers: QuestionnaireAnswers,
  path: string,
  requiredErrors: boolean,
) {
  if (!conditionMatches(field.condition, answers) || field.type === 'info') {
    return { visible: false, complete: false, value: undefined, errors: {} };
  }
  const value = answers[field.id];
  if (field.type === 'repeating_group') {
    if (!Array.isArray(value)) {
      return {
        visible: true,
        complete: false,
        value: undefined,
        errors: field.required && requiredErrors ? { [path]: 'Добавьте хотя бы одну запись.' } : {},
      };
    }
    const rows: Record<string, unknown>[] = [];
    const errors: Record<string, string> = {};
    if (value.length > 50) errors[path] = 'Допустимо не более 50 записей.';
    value.slice(0, 50).forEach((row, rowIndex) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        errors[`${path}.${rowIndex}`] = 'Запись имеет неверный формат.';
        return;
      }
      const rowAnswers = row as Record<string, unknown>;
      const normalizedRow: Record<string, unknown> = {};
      for (const child of field.fields ?? []) {
        const childResult = validateField(
          child,
          rowAnswers,
          `${path}.${rowIndex}.${child.id}`,
          requiredErrors,
        );
        Object.assign(errors, childResult.errors);
        if (childResult.value !== undefined) normalizedRow[child.id] = childResult.value;
      }
      rows.push(normalizedRow);
    });
    if (field.required && value.length === 0 && requiredErrors) {
      errors[path] = 'Добавьте хотя бы одну запись.';
    }
    return {
      visible: true,
      complete: value.length > 0 && Object.keys(errors).length === 0,
      value: rows,
      errors,
    };
  }
  const normalized = validateScalar(field, value, path);
  const errors: Record<string, string> = {};
  if (field.required && !hasValue(value) && requiredErrors) {
    errors[path] = 'Заполните обязательное поле.';
  } else if (hasValue(value) && normalized === undefined) {
    errors[path] = 'Проверьте формат значения.';
  }
  return {
    visible: true,
    complete: normalized !== undefined,
    value: normalized,
    errors,
  };
}

export function validateQuestionnaireAnswers(
  schema: QuestionnaireSchema,
  answers: QuestionnaireAnswers,
  options: { readonly requireComplete?: boolean } = {},
): QuestionnaireValidationResult {
  const normalized: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  let completedFields = 0;
  let totalFields = 0;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const result = validateField(field, answers, field.id, options.requireComplete === true);
      if (!result.visible) continue;
      totalFields += 1;
      if (result.complete) completedFields += 1;
      if (result.value !== undefined) normalized[field.id] = result.value;
      Object.assign(errors, result.errors);
    }
  }
  return {
    answers: normalized,
    errors,
    completedFields,
    totalFields,
    progressPercent: totalFields === 0 ? 100 : Math.round((completedFields / totalFields) * 100),
  };
}

export function sanitizeQuestionnaireDraft(
  schema: QuestionnaireSchema,
  answers: unknown,
): Record<string, unknown> {
  const input = object(answers, 'answers');
  const encoded = JSON.stringify(input);
  if (encoded.length > 256_000) throw new QuestionnaireValidationError('answers');
  const allowed = new Set(
    schema.sections.flatMap((section) => section.fields.map((field) => field.id)),
  );
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new QuestionnaireValidationError('answers');
  }
  return structuredClone(input);
}

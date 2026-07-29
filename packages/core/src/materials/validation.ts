import { validateUploadDeclaration } from '@garun/storage';

import type { MaterialKind, MaterialRequestInput, UploadDeclaration } from './types';

const materialKinds: readonly MaterialKind[] = [
  'text',
  'contact',
  'link',
  'file',
  'image',
  'video',
  'logo',
  'document',
  'details',
  'service',
  'testimonial',
  'employee',
  'legal_text',
  'other',
];

export class MaterialValidationError extends Error {
  constructor(readonly field: string) {
    super('VALIDATION_FAILED');
    this.name = 'MaterialValidationError';
  }
}

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new MaterialValidationError(field);
  }
  return value.trim();
}

export function parseMaterialRequestInput(input: Record<string, unknown>): MaterialRequestInput {
  const type = requiredText(input.type, 'type', 30) as MaterialKind;
  if (!materialKinds.includes(type)) throw new MaterialValidationError('type');
  const dueDate = requiredText(input.dueDate, 'dueDate', 10);
  const dueAt = new Date(`${dueDate}T23:59:59.999Z`);
  if (Number.isNaN(dueAt.valueOf()) || dueAt.toISOString().slice(0, 10) !== dueDate) {
    throw new MaterialValidationError('dueDate');
  }
  const category =
    typeof input.category === 'string' && input.category.trim() ? input.category.trim() : null;
  const stageId = typeof input.stageId === 'string' && input.stageId ? input.stageId : null;
  return {
    title: requiredText(input.title, 'title', 240),
    type,
    category,
    stageId,
    requestedFromUserId: requiredText(input.requestedFromUserId, 'requestedFromUserId', 64),
    dueAt,
  };
}

export function parseUploadDeclarations(value: unknown, maxBytes: number): UploadDeclaration[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new MaterialValidationError('files');
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new MaterialValidationError(`files.${index}`);
    }
    const input = item as Record<string, unknown>;
    const declaration = {
      name: requiredText(input.name, `files.${index}.name`, 240),
      mimeType: requiredText(input.mimeType, `files.${index}.mimeType`, 100),
      size: input.size,
      checksum: requiredText(input.checksum, `files.${index}.checksum`, 64).toLowerCase(),
    };
    if (typeof declaration.size !== 'number' || !/^[a-f0-9]{64}$/.test(declaration.checksum)) {
      throw new MaterialValidationError(`files.${index}`);
    }
    validateUploadDeclaration({
      name: declaration.name,
      mimeType: declaration.mimeType,
      size: declaration.size,
      maxBytes,
    });
    return declaration as UploadDeclaration;
  });
}

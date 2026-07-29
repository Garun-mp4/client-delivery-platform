import { extname } from 'node:path';

export const allowedFileTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'video/mp4': ['.mp4'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
} as const;

export type AllowedMimeType = keyof typeof allowedFileTypes;

export class FilePolicyError extends Error {
  constructor(readonly code: 'FILE_TOO_LARGE' | 'FILE_TYPE_NOT_ALLOWED' | 'FILE_NAME_INVALID') {
    super(code);
    this.name = 'FilePolicyError';
  }
}

function replaceUnsafeNameCharacters(value: string) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 || character === '/' || character === '\\'
        ? ' '
        : character;
    })
    .join('');
}

export function normalizeDisplayName(input: string): string {
  const name = replaceUnsafeNameCharacters(input.normalize('NFKC'))
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  if (!name || name.length > 240) throw new FilePolicyError('FILE_NAME_INVALID');
  return name;
}

export function validateUploadDeclaration(input: {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly maxBytes: number;
}): { readonly normalizedName: string; readonly mimeType: AllowedMimeType } {
  const normalizedName = normalizeDisplayName(input.name);
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > input.maxBytes) {
    throw new FilePolicyError('FILE_TOO_LARGE');
  }
  if (!(input.mimeType in allowedFileTypes)) {
    throw new FilePolicyError('FILE_TYPE_NOT_ALLOWED');
  }
  const mimeType = input.mimeType as AllowedMimeType;
  const extension = extname(normalizedName).toLowerCase();
  if (!(allowedFileTypes[mimeType] as readonly string[]).includes(extension)) {
    throw new FilePolicyError('FILE_TYPE_NOT_ALLOWED');
  }
  return { normalizedName, mimeType };
}

function isUtf8Text(value: Uint8Array) {
  if (value.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(value);
    return true;
  } catch {
    return false;
  }
}

export function sniffMimeType(bytes: Uint8Array): AllowedMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return 'image/png';
  }
  const ascii = new TextDecoder('latin1').decode(bytes.slice(0, 16));
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (ascii.startsWith('%PDF-')) return 'application/pdf';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (ascii.slice(4, 8) === 'ftyp') return 'video/mp4';
  if (ascii.startsWith('PK\u0003\u0004')) return null;
  if (isUtf8Text(bytes)) return 'text/plain';
  return null;
}

export function verifyDetectedType(declared: string, bytes: Uint8Array): AllowedMimeType {
  if (!(declared in allowedFileTypes)) throw new FilePolicyError('FILE_TYPE_NOT_ALLOWED');
  const detected = sniffMimeType(bytes);
  if (!detected) throw new FilePolicyError('FILE_TYPE_NOT_ALLOWED');
  if (declared === 'text/csv' && detected === 'text/plain') return 'text/csv';
  if (detected !== declared) throw new FilePolicyError('FILE_TYPE_NOT_ALLOWED');
  return detected;
}

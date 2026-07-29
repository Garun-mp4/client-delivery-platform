export type MaterialKind =
  | 'text'
  | 'contact'
  | 'link'
  | 'file'
  | 'image'
  | 'video'
  | 'logo'
  | 'document'
  | 'details'
  | 'service'
  | 'testimonial'
  | 'employee'
  | 'legal_text'
  | 'other';

export interface MaterialRequestInput {
  readonly title: string;
  readonly type: MaterialKind;
  readonly category: string | null;
  readonly stageId: string | null;
  readonly requestedFromUserId: string;
  readonly dueAt: Date;
}

export interface UploadDeclaration {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
}

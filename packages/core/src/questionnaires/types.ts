export const questionnaireFieldTypes = [
  'short_text',
  'long_text',
  'number',
  'email',
  'phone',
  'url',
  'single_choice',
  'multiple_choice',
  'date',
  'toggle',
  'file',
  'image',
  'repeating_group',
  'info',
] as const;

export type QuestionnaireFieldType = (typeof questionnaireFieldTypes)[number];

export interface QuestionnaireCondition {
  readonly fieldId: string;
  readonly operator: 'equals' | 'not_equals' | 'contains' | 'truthy';
  readonly value?: string | number | boolean;
}

export interface QuestionnaireField {
  readonly id: string;
  readonly type: QuestionnaireFieldType;
  readonly label: string;
  readonly required: boolean;
  readonly hint?: string;
  readonly example?: string;
  readonly options?: readonly string[];
  readonly condition?: QuestionnaireCondition;
  readonly fields?: readonly QuestionnaireField[];
}

export interface QuestionnaireSection {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly QuestionnaireField[];
}

export interface QuestionnaireSchema {
  readonly version: 1;
  readonly sections: readonly QuestionnaireSection[];
}

export type QuestionnaireAnswers = Readonly<Record<string, unknown>>;

export interface QuestionnaireInput {
  readonly title: string;
  readonly description: string | null;
  readonly assignedToUserId: string;
  readonly dueAt: Date | null;
  readonly schema: QuestionnaireSchema;
}

export interface QuestionnaireValidationResult {
  readonly answers: Record<string, unknown>;
  readonly errors: Readonly<Record<string, string>>;
  readonly completedFields: number;
  readonly totalFields: number;
  readonly progressPercent: number;
}

export type QuestionnaireReviewDecision = 'accepted' | 'clarification_requested';

import { describe, expect, it } from 'vitest';

import type { QuestionnaireSchema } from './types';
import {
  parseQuestionnaireSchema,
  sanitizeQuestionnaireDraft,
  validateQuestionnaireAnswers,
} from './validation';

const schema: QuestionnaireSchema = {
  version: 1,
  sections: [
    {
      id: 'company',
      title: 'О компании',
      fields: [
        { id: 'has_site', type: 'toggle', label: 'Есть сайт?', required: true },
        {
          id: 'site_url',
          type: 'url',
          label: 'Адрес сайта',
          required: true,
          condition: { fieldId: 'has_site', operator: 'equals', value: true },
        },
        {
          id: 'services',
          type: 'repeating_group',
          label: 'Услуги',
          required: true,
          fields: [
            { id: 'name', type: 'short_text', label: 'Название', required: true },
            { id: 'price', type: 'number', label: 'Цена', required: false },
          ],
        },
      ],
    },
  ],
};

describe('questionnaire schema and answers', () => {
  it('keeps hidden conditional values out of a submission and aligns progress', () => {
    const result = validateQuestionnaireAnswers(
      schema,
      {
        has_site: false,
        site_url: 'https://hidden.example',
        services: [{ name: 'Разработка', price: '150000' }],
      },
      { requireComplete: true },
    );
    expect(result.errors).toEqual({});
    expect(result.answers).toEqual({
      has_site: false,
      services: [{ name: 'Разработка', price: 150000 }],
    });
    expect(result.progressPercent).toBe(100);
    expect(result.totalFields).toBe(2);
  });

  it('validates visible required fields and repeating group rows', () => {
    const result = validateQuestionnaireAnswers(
      schema,
      { has_site: true, services: [{ name: '' }] },
      { requireComplete: true },
    );
    expect(result.errors).toMatchObject({
      site_url: 'Заполните обязательное поле.',
      'services.0.name': 'Заполните обязательное поле.',
    });
    expect(result.progressPercent).toBe(33);
  });

  it('rejects forward conditions and accepts file fields in milestone 06', () => {
    expect(() =>
      parseQuestionnaireSchema({
        version: 1,
        sections: [
          {
            id: 'section',
            title: 'Раздел',
            fields: [
              {
                id: 'dependent',
                type: 'short_text',
                label: 'Зависимое',
                required: false,
                condition: { fieldId: 'later', operator: 'truthy' },
              },
              { id: 'later', type: 'toggle', label: 'Позже', required: false },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseQuestionnaireSchema({
        version: 1,
        sections: [
          {
            id: 'section',
            title: 'Раздел',
            fields: [{ id: 'file', type: 'file', label: 'Файл', required: false }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseQuestionnaireSchema(
        {
          version: 1,
          sections: [
            {
              id: 'section',
              title: 'Раздел',
              fields: [{ id: 'file', type: 'file', label: 'Файл', required: false }],
            },
          ],
        },
        { allowFileFields: true },
      ),
    ).not.toThrow();
  });

  it('allows partial drafts but rejects unknown keys and oversized payloads', () => {
    expect(sanitizeQuestionnaireDraft(schema, { has_site: true })).toEqual({ has_site: true });
    expect(() => sanitizeQuestionnaireDraft(schema, { injected: 'value' })).toThrow();
    expect(() => sanitizeQuestionnaireDraft(schema, { site_url: 'x'.repeat(256_001) })).toThrow();
  });

  it('normalizes every scalar field type and reports invalid calendar dates', () => {
    const scalarSchema: QuestionnaireSchema = {
      version: 1,
      sections: [
        {
          id: 'details',
          title: 'Детали',
          fields: [
            { id: 'text', type: 'long_text', label: 'Текст', required: true },
            { id: 'number', type: 'number', label: 'Число', required: true },
            { id: 'email', type: 'email', label: 'Email', required: true },
            { id: 'phone', type: 'phone', label: 'Телефон', required: true },
            {
              id: 'choice',
              type: 'single_choice',
              label: 'Выбор',
              required: true,
              options: ['Первый', 'Второй'],
            },
            {
              id: 'choices',
              type: 'multiple_choice',
              label: 'Несколько',
              required: true,
              options: ['A', 'B'],
            },
            { id: 'date', type: 'date', label: 'Дата', required: true },
            { id: 'toggle', type: 'toggle', label: 'Флаг', required: true },
          ],
        },
      ],
    };
    const valid = validateQuestionnaireAnswers(
      scalarSchema,
      {
        text: '  Текст  ',
        number: '42',
        email: 'USER@EXAMPLE.COM',
        phone: '+7 900 000-00-00',
        choice: 'Первый',
        choices: ['A', 'A', 'B'],
        date: '2026-12-31',
        toggle: false,
      },
      { requireComplete: true },
    );
    expect(valid.errors).toEqual({});
    expect(valid.answers).toMatchObject({
      text: 'Текст',
      number: 42,
      email: 'user@example.com',
      choices: ['A', 'B'],
      date: '2026-12-31',
      toggle: false,
    });
    const invalid = validateQuestionnaireAnswers(
      scalarSchema,
      {
        text: 'Текст',
        number: 42,
        email: 'user@example.com',
        phone: '+7 900 000-00-00',
        choice: 'Первый',
        choices: ['A'],
        date: '2026-99-99',
        toggle: true,
      },
      { requireComplete: true },
    );
    expect(invalid.errors.date).toBe('Проверьте формат значения.');
  });
});

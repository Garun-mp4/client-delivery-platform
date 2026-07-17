'use client';

import { useMemo, useState } from 'react';

import type {
  QuestionnaireField,
  QuestionnaireFieldType,
  QuestionnaireSchema,
} from '@garun/core/questionnaires';

interface BuilderField {
  id: string;
  type: Exclude<QuestionnaireFieldType, 'file' | 'image'>;
  label: string;
  required: boolean;
  hint: string;
  example: string;
  options: string;
  conditionFieldId: string;
  conditionValue: string;
  groupFields: string;
}

interface BuilderSection {
  id: string;
  title: string;
  description: string;
  fields: BuilderField[];
}

const typeLabels: Readonly<Record<Exclude<QuestionnaireFieldType, 'file' | 'image'>, string>> = {
  short_text: 'Короткий текст',
  long_text: 'Длинный текст',
  number: 'Число',
  email: 'Email',
  phone: 'Телефон',
  url: 'URL',
  single_choice: 'Один вариант',
  multiple_choice: 'Несколько вариантов',
  date: 'Дата',
  toggle: 'Переключатель',
  repeating_group: 'Повторяемая группа',
  info: 'Информационный блок',
};

function identifier(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function newField(): BuilderField {
  return {
    id: identifier('field'),
    type: 'short_text',
    label: '',
    required: false,
    hint: '',
    example: '',
    options: '',
    conditionFieldId: '',
    conditionValue: '',
    groupFields: '',
  };
}

function newSection(): BuilderSection {
  return {
    id: identifier('section'),
    title: '',
    description: '',
    fields: [newField()],
  };
}

function conditionValue(value: string): string | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function serializeField(field: BuilderField): QuestionnaireField {
  const options = field.options
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const children =
    field.type === 'repeating_group'
      ? field.groupFields
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((label, index) => ({
            id: `item_${index + 1}`,
            type: 'short_text' as const,
            label,
            required: true,
          }))
      : undefined;
  return {
    id: field.id,
    type: field.type,
    label: field.label,
    required: field.type === 'info' ? false : field.required,
    ...(field.hint ? { hint: field.hint } : {}),
    ...(field.example ? { example: field.example } : {}),
    ...(options.length > 0 ? { options } : {}),
    ...(children ? { fields: children } : {}),
    ...(field.conditionFieldId
      ? {
          condition: {
            fieldId: field.conditionFieldId,
            operator: 'equals' as const,
            value: conditionValue(field.conditionValue),
          },
        }
      : {}),
  };
}

export function QuestionnaireBuilder({
  action,
  assignees,
}: {
  action: string;
  assignees: readonly { userId: string; name: string }[];
}) {
  const [sections, setSections] = useState<BuilderSection[]>([newSection()]);
  const schema = useMemo<QuestionnaireSchema>(
    () => ({
      version: 1,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        ...(section.description ? { description: section.description } : {}),
        fields: section.fields.map(serializeField),
      })),
    }),
    [sections],
  );

  function updateSection(index: number, patch: Partial<BuilderSection>) {
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    );
  }

  function updateField(sectionIndex: number, fieldIndex: number, patch: Partial<BuilderField>) {
    setSections((current) =>
      current.map((section, currentSection) =>
        currentSection === sectionIndex
          ? {
              ...section,
              fields: section.fields.map((field, currentField) =>
                currentField === fieldIndex ? { ...field, ...patch } : field,
              ),
            }
          : section,
      ),
    );
  }

  const precedingFields = (sectionIndex: number, fieldIndex: number) =>
    sections
      .flatMap((section, currentSection) =>
        section.fields.map((field, currentField) => ({
          field,
          before:
            currentSection < sectionIndex ||
            (currentSection === sectionIndex && currentField < fieldIndex),
        })),
      )
      .filter(
        ({ field, before }) => before && field.type !== 'info' && field.type !== 'repeating_group',
      )
      .map(({ field }) => field);

  return (
    <form className="questionnaire-builder" action={action} method="post">
      <input name="schema" type="hidden" value={JSON.stringify(schema)} />
      <div className="form-grid">
        <label>
          Название анкеты
          <input name="title" required maxLength={240} />
        </label>
        <label>
          Заполняет
          <select name="assignedToUserId" required defaultValue="">
            <option value="" disabled>
              Выберите участника
            </option>
            {assignees.map((assignee) => (
              <option key={assignee.userId} value={assignee.userId}>
                {assignee.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Срок
          <input name="dueDate" type="date" />
        </label>
        <label className="full-field">
          Пояснение клиенту
          <textarea name="description" rows={3} maxLength={5_000} />
        </label>
      </div>

      {sections.map((section, sectionIndex) => (
        <fieldset className="builder-section" key={section.id}>
          <legend>Раздел {sectionIndex + 1}</legend>
          <div className="form-grid">
            <label>
              Заголовок раздела
              <input
                value={section.title}
                required
                maxLength={240}
                onChange={(event) => updateSection(sectionIndex, { title: event.target.value })}
              />
            </label>
            <label>
              Пояснение
              <input
                value={section.description}
                maxLength={1_000}
                onChange={(event) =>
                  updateSection(sectionIndex, { description: event.target.value })
                }
              />
            </label>
          </div>
          {section.fields.map((field, fieldIndex) => {
            const conditions = precedingFields(sectionIndex, fieldIndex);
            return (
              <div className="builder-field" key={field.id}>
                <div className="section-heading">
                  <strong>Поле {fieldIndex + 1}</strong>
                  {section.fields.length > 1 ? (
                    <button
                      className="secondary compact-button"
                      type="button"
                      onClick={() =>
                        updateSection(sectionIndex, {
                          fields: section.fields.filter((_, index) => index !== fieldIndex),
                        })
                      }
                    >
                      Удалить поле
                    </button>
                  ) : null}
                </div>
                <div className="form-grid">
                  <label>
                    Тип
                    <select
                      value={field.type}
                      onChange={(event) =>
                        updateField(sectionIndex, fieldIndex, {
                          type: event.target.value as BuilderField['type'],
                        })
                      }
                    >
                      {Object.entries(typeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Вопрос или текст блока
                    <input
                      value={field.label}
                      required
                      maxLength={240}
                      onChange={(event) =>
                        updateField(sectionIndex, fieldIndex, { label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Подсказка
                    <input
                      value={field.hint}
                      maxLength={1_000}
                      onChange={(event) =>
                        updateField(sectionIndex, fieldIndex, { hint: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Пример ответа
                    <input
                      value={field.example}
                      maxLength={500}
                      onChange={(event) =>
                        updateField(sectionIndex, fieldIndex, { example: event.target.value })
                      }
                    />
                  </label>
                  {field.type === 'single_choice' || field.type === 'multiple_choice' ? (
                    <label className="full-field">
                      Варианты — каждый с новой строки
                      <textarea
                        value={field.options}
                        required
                        rows={4}
                        onChange={(event) =>
                          updateField(sectionIndex, fieldIndex, { options: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                  {field.type === 'repeating_group' ? (
                    <label className="full-field">
                      Поля одной записи — каждое с новой строки
                      <textarea
                        value={field.groupFields}
                        required
                        rows={4}
                        placeholder={'Название услуги\nКраткое описание'}
                        onChange={(event) =>
                          updateField(sectionIndex, fieldIndex, {
                            groupFields: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {conditions.length > 0 ? (
                    <>
                      <label>
                        Показывать, если заполнено поле
                        <select
                          value={field.conditionFieldId}
                          onChange={(event) =>
                            updateField(sectionIndex, fieldIndex, {
                              conditionFieldId: event.target.value,
                            })
                          }
                        >
                          <option value="">Показывать всегда</option>
                          {conditions.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label || candidate.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field.conditionFieldId ? (
                        <label>
                          Равно значению
                          <input
                            value={field.conditionValue}
                            required
                            placeholder="Например: true или Да"
                            onChange={(event) =>
                              updateField(sectionIndex, fieldIndex, {
                                conditionValue: event.target.value,
                              })
                            }
                          />
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  {field.type !== 'info' ? (
                    <label className="confirm-control full-field">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          updateField(sectionIndex, fieldIndex, {
                            required: event.target.checked,
                          })
                        }
                      />
                      Обязательный ответ
                    </label>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="builder-actions">
            <button
              className="secondary"
              type="button"
              onClick={() =>
                updateSection(sectionIndex, { fields: [...section.fields, newField()] })
              }
            >
              Добавить поле
            </button>
            {sections.length > 1 ? (
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  setSections((current) => current.filter((_, index) => index !== sectionIndex))
                }
              >
                Удалить раздел
              </button>
            ) : null}
          </div>
        </fieldset>
      ))}
      <div className="builder-actions">
        <button
          className="secondary"
          type="button"
          onClick={() => setSections((current) => [...current, newSection()])}
        >
          Добавить раздел
        </button>
        <button type="submit">Создать и отправить анкету</button>
      </div>
      <p className="fineprint">
        Файлы и изображения появятся после включения безопасного файлового модуля. Сейчас
        конструктор их намеренно не предлагает.
      </p>
    </form>
  );
}

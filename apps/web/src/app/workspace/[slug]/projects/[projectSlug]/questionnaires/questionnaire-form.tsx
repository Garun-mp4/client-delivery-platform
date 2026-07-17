'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  QuestionnaireAnswers,
  QuestionnaireCondition,
  QuestionnaireField,
  QuestionnaireSchema,
} from '@garun/core/questionnaires';

type SaveStatus = 'saved' | 'waiting' | 'saving' | 'error' | 'conflict' | 'submitting';

function conditionMatches(
  condition: QuestionnaireCondition | undefined,
  answers: QuestionnaireAnswers,
) {
  if (!condition) return true;
  const actual = answers[condition.fieldId];
  if (condition.operator === 'truthy') return Boolean(actual);
  if (condition.operator === 'equals') return actual === condition.value;
  if (condition.operator === 'not_equals') return actual !== condition.value;
  return Array.isArray(actual)
    ? actual.includes(condition.value)
    : typeof actual === 'string' && typeof condition.value === 'string'
      ? actual.includes(condition.value)
      : false;
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: QuestionnaireField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const describedBy = [field.hint ? `${field.id}-hint` : '', error ? `${field.id}-error` : '']
    .filter(Boolean)
    .join(' ');
  if (field.type === 'info') {
    return (
      <div className="questionnaire-info" id={`answer-${field.id}`}>
        {field.label}
      </div>
    );
  }
  if (field.type === 'repeating_group') {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    return (
      <fieldset className="repeating-field" id={`answer-${field.id}`}>
        <legend>
          {field.label}
          {field.required ? ' *' : ''}
        </legend>
        {field.hint ? (
          <p className="field-hint" id={`${field.id}-hint`}>
            {field.hint}
          </p>
        ) : null}
        {rows.map((row, rowIndex) => (
          <div className="repeating-row" key={`${field.id}-${rowIndex}`}>
            {(field.fields ?? []).map((child) => (
              <FieldInput
                key={child.id}
                field={child}
                value={row[child.id]}
                error={undefined}
                onChange={(childValue) =>
                  onChange(
                    rows.map((current, index) =>
                      index === rowIndex ? { ...current, [child.id]: childValue } : current,
                    ),
                  )
                }
              />
            ))}
            <button
              className="secondary"
              type="button"
              onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}
            >
              Удалить запись
            </button>
          </div>
        ))}
        <button
          className="secondary"
          type="button"
          onClick={() => onChange([...rows, {}])}
          aria-describedby={describedBy || undefined}
        >
          Добавить запись
        </button>
        {error ? (
          <p className="field-error" id={`${field.id}-error`} role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }
  const common = {
    id: field.id,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': Boolean(error),
  };
  let control;
  if (field.type === 'long_text') {
    control = (
      <textarea
        {...common}
        rows={6}
        value={typeof value === 'string' ? value : ''}
        placeholder={field.example}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else if (field.type === 'single_choice') {
    control = (
      <select
        {...common}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Выберите вариант</option>
        {field.options?.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  } else if (field.type === 'multiple_choice') {
    const selected = Array.isArray(value) ? value : [];
    control = (
      <div className="choice-list" {...common}>
        {field.options?.map((option) => (
          <label className="confirm-control" key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option),
                )
              }
            />
            {option}
          </label>
        ))}
      </div>
    );
  } else if (field.type === 'toggle') {
    control = (
      <label className="confirm-control">
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        Да
      </label>
    );
  } else if (field.type === 'file' || field.type === 'image') {
    control = <p className="notice">Это поле станет доступно после подключения файлов.</p>;
  } else {
    const inputType = {
      short_text: 'text',
      number: 'number',
      email: 'email',
      phone: 'tel',
      url: 'url',
      date: 'date',
    }[field.type];
    control = (
      <input
        {...common}
        type={inputType}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        placeholder={field.example}
        onChange={(event) =>
          onChange(
            field.type === 'number' && event.target.value !== ''
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
    );
  }
  return (
    <div className="questionnaire-field" id={`answer-${field.id}`}>
      <label htmlFor={field.type === 'multiple_choice' ? undefined : field.id}>
        {field.label}
        {field.required ? ' *' : ''}
      </label>
      {field.hint ? (
        <p className="field-hint" id={`${field.id}-hint`}>
          {field.hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p className="field-error" id={`${field.id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function QuestionnaireForm({
  schema,
  initialAnswers,
  initialVersion,
  initialSavedAt,
  initialProgress,
  draftUrl,
  submitUrl,
}: {
  schema: QuestionnaireSchema;
  initialAnswers: Record<string, unknown>;
  initialVersion: number;
  initialSavedAt: string;
  initialProgress: { completedFields: number; totalFields: number; progressPercent: number };
  draftUrl: string;
  submitUrl: string;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [progress, setProgress] = useState(initialProgress);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const versionRef = useRef(initialVersion);
  const sequenceRef = useRef(0);
  const queuedSequenceRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueSave = useCallback(
    (sequence: number, payload: Record<string, unknown>) => {
      if (sequence <= queuedSequenceRef.current) return queueRef.current;
      queuedSequenceRef.current = sequence;
      setStatus('saving');
      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch(draftUrl, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              answers: payload,
              version: versionRef.current,
              idempotencyKey: crypto.randomUUID(),
            }),
          });
          const body = (await response.json()) as {
            version?: number;
            lastSavedAt?: string;
            progress?: {
              completedFields: number;
              totalFields: number;
              progressPercent: number;
            };
            error?: { code?: string };
          };
          if (response.status === 409) {
            setStatus('conflict');
            throw new Error('CONFLICT');
          }
          if (
            !response.ok ||
            typeof body.version !== 'number' ||
            !body.lastSavedAt ||
            !body.progress
          ) {
            setStatus('error');
            throw new Error('SAVE_FAILED');
          }
          versionRef.current = body.version;
          setSavedAt(body.lastSavedAt);
          setProgress(body.progress);
          setStatus(sequence === sequenceRef.current ? 'saved' : 'waiting');
        });
      return queueRef.current;
    },
    [draftUrl],
  );

  useEffect(() => {
    if (sequenceRef.current === 0) return;
    setStatus('waiting');
    const sequence = sequenceRef.current;
    const timer = window.setTimeout(() => {
      void enqueueSave(sequence, answers).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, enqueueSave]);

  function change(fieldId: string, value: unknown) {
    if (status === 'conflict') return;
    sequenceRef.current += 1;
    setErrors((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  async function submit() {
    if (status === 'conflict') return;
    setStatus('submitting');
    try {
      const sequence = sequenceRef.current;
      if (sequence > 0) await enqueueSave(sequence, answers);
      await queueRef.current;
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: versionRef.current }),
      });
      const body = (await response.json()) as {
        error?: { code?: string; fields?: Record<string, string> };
      };
      if (response.status === 422 && body.error?.fields) {
        setErrors(body.error.fields);
        setStatus('error');
        const firstField = Object.keys(body.error.fields)[0];
        if (firstField) document.getElementById(`answer-${firstField.split('.')[0]}`)?.focus();
        return;
      }
      if (!response.ok) {
        setStatus(response.status === 409 ? 'conflict' : 'error');
        return;
      }
      window.location.reload();
    } catch {
      setStatus((current) => (current === 'conflict' ? current : 'error'));
    }
  }

  const statusText = {
    saved: `Сохранено ${new Date(savedAt).toLocaleString('ru-RU')}`,
    waiting: 'Есть несохранённые изменения…',
    saving: 'Сохраняем…',
    error: 'Не удалось сохранить. Проверьте сеть — подтверждённый черновик не потерян.',
    conflict: 'Анкета изменена в другой вкладке. Обновите страницу, чтобы не перезаписать данные.',
    submitting: 'Отправляем ответы…',
  }[status];

  return (
    <div className="questionnaire-form">
      <div className="questionnaire-progress" aria-label="Прогресс заполнения">
        <span>
          Заполнено {progress.completedFields} из {progress.totalFields}
        </span>
        <progress max={100} value={progress.progressPercent}>
          {progress.progressPercent}%
        </progress>
      </div>
      <div
        className={`autosave-status ${status === 'error' || status === 'conflict' ? 'error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {statusText}
      </div>
      {schema.sections.map((section) => (
        <section className="questionnaire-section" key={section.id} aria-labelledby={section.id}>
          <h2 id={section.id}>{section.title}</h2>
          {section.description ? <p className="muted">{section.description}</p> : null}
          {section.fields.map((field) =>
            conditionMatches(field.condition, answers) ? (
              <FieldInput
                key={field.id}
                field={field}
                value={answers[field.id]}
                error={errors[field.id]}
                onChange={(value) => change(field.id, value)}
              />
            ) : null,
          )}
        </section>
      ))}
      <div className="submission-bar">
        <span>Поля со звёздочкой обязательны.</span>
        <button
          type="button"
          disabled={status === 'conflict' || status === 'saving' || status === 'submitting'}
          onClick={() => void submit()}
        >
          Отправить ответы
        </button>
      </div>
    </div>
  );
}

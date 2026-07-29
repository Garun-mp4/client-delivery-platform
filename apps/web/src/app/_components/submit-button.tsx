'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

export function SubmitButton({
  children,
  pendingText = 'Сохраняем…',
  className,
  name,
  value,
  formNoValidate,
}: {
  readonly children: ReactNode;
  readonly pendingText?: string;
  readonly className?: string;
  readonly name?: string;
  readonly value?: string;
  readonly formNoValidate?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-disabled={pending}
      className={className}
      disabled={pending}
      formNoValidate={formNoValidate}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? pendingText : children}
    </button>
  );
}

'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

export function SubmitButton({
  children,
  pendingText = 'Сохраняем…',
  className,
  name,
  value,
}: {
  readonly children: ReactNode;
  readonly pendingText?: string;
  readonly className?: string;
  readonly name?: string;
  readonly value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-disabled={pending}
      className={className}
      disabled={pending}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? pendingText : children}
    </button>
  );
}

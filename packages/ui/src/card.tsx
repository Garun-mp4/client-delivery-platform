import type { HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLElement>;

export function Card({ className = '', ...props }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}

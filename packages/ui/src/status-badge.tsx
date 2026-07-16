import type { HTMLAttributes } from 'react';

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement>;

export function StatusBadge({ className = '', ...props }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ${className}`}
      {...props}
    />
  );
}

import type { HTMLAttributes } from 'react';

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement>;

export function StatusBadge({ className = '', ...props }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-[#b7d3c8] bg-[#edf5f1] px-3 py-1 text-sm font-semibold text-[#17624a] ${className}`}
      {...props}
    />
  );
}

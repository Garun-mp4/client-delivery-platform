import type { HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLElement>;

export function Card({ className = '', ...props }: CardProps) {
  return (
    <section
      className={`rounded-lg border border-[#d7d2c7] bg-[#fffdf8] p-6 ${className}`}
      {...props}
    />
  );
}

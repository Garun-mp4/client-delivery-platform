import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: 'primary' | 'neutral';
}

const toneClasses = {
  neutral:
    'border border-[#d7d2c7] bg-[#f7f4ed] text-[#1c211d] hover:border-[#b8b1a3] hover:bg-[#eeebe3]',
  primary: 'bg-[#17624a] text-white hover:bg-[#0f4f3b]',
} as const;

export function Button({
  className = '',
  tone = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17624a] disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses[tone]} ${className}`}
      type={type}
      {...props}
    />
  );
}

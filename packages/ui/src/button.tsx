import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: 'primary' | 'neutral';
}

const toneClasses = {
  neutral: 'bg-slate-100 text-slate-950 hover:bg-slate-200',
  primary: 'bg-blue-700 text-white hover:bg-blue-800',
} as const;

export function Button({
  className = '',
  tone = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses[tone]} ${className}`}
      type={type}
      {...props}
    />
  );
}

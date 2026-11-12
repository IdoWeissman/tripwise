import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

/** Primary keeps readable text when disabled (accent-deep on accent-tint-border, ~9:1) instead of fading. */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover disabled:bg-accent-tint-border disabled:text-accent-deep',
  secondary:
    'border border-border-input bg-surface text-ink hover:bg-surface-muted disabled:text-ink-muted disabled:hover:bg-surface',
  ghost: 'bg-transparent text-ink-secondary hover:bg-surface-muted disabled:text-ink-muted',
  destructive: 'bg-transparent text-negative-ink hover:bg-attention/40 disabled:opacity-60',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** 44px min height per design rules §1.6; one primary per region. */
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

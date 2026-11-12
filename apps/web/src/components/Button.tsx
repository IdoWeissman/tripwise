import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'vote' | 'secondary' | 'ghost' | 'destructive';

/** Primary keeps readable text when disabled (accent-deep on accent-tint-border, ~9:1) instead of fading. */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-sign text-white hover:bg-sign-raised disabled:bg-accent-tint-border disabled:text-accent-deep',
  /** Proposals' primary wears the section hue (Vote violet). */
  vote: 'bg-vote text-white hover:bg-vote/90 disabled:bg-vote-tint disabled:text-vote',
  secondary:
    'border-[1.5px] border-border bg-surface text-ink hover:border-border-input hover:bg-bg disabled:text-ink-muted disabled:hover:bg-surface',
  ghost: 'bg-transparent text-ink-secondary hover:bg-surface-muted disabled:text-ink-muted',
  destructive: 'bg-transparent text-negative-ink hover:bg-attention disabled:opacity-60',
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-[15px] font-bold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

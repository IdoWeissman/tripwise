import { useState, type InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Password field with a show/hide toggle (design rules §1.5). The toggle is a real button
 * (44px target, labelled, aria-pressed) and never submits the form.
 */
export function PasswordInput({ className = '', ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative flex">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={`w-full pr-12 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </span>
  );
}

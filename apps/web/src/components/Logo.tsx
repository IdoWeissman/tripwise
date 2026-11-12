import { Link } from 'react-router';

/** Wordmark with the yellow sign plate. `onSign` sets the word in white for the blue rail and header. */
export function Logo({ onSign = false, compact = false }: { onSign?: boolean; compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label={compact ? 'Tripwise — my trips' : undefined}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 text-xl font-extrabold tracking-[-0.01em] no-underline ${
        onSign ? 'text-white hover:text-white' : 'text-sign hover:text-sign'
      }`}
    >
      <span className="flex size-8 items-center justify-center rounded-control bg-signal">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-sign)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      </span>
      {!compact && 'Tripwise'}
    </Link>
  );
}

import { Link } from 'react-router';

export function Logo() {
  return (
    <Link
      to="/"
      className="flex min-h-11 shrink-0 items-center gap-2.5 text-lg font-bold text-ink no-underline"
    >
      <span className="flex size-8 items-center justify-center rounded-control bg-accent">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      </span>
      Tripwise
    </Link>
  );
}

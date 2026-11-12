import { useApolloClient } from '@apollo/client/react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { graphql } from '../gql';
import type { PlaceSearchQuery } from '../gql/graphql';
import { PinIcon } from './Icons';

const PlaceSearchDocument = graphql(`
  query PlaceSearch($query: String!) {
    placeSearch(query: $query) {
      name
      region
      country
      countryCode
      label
      destination
      timeZone
      currency
    }
  }
`);

export type PlaceOption = PlaceSearchQuery['placeSearch'][number];

type Status = 'idle' | 'loading' | 'error';

/**
 * Destination input — rules §1.5 Place field. Free text always works; real places are suggested
 * as you type (our API asks a geocoder) and picking one hands its zone and currency to the form.
 * ARIA combobox: arrows move, Enter picks, Esc closes; the list never blocks typing.
 */
export function PlaceField({
  label,
  value,
  onChange,
  onPick,
  hint,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (place: PlaceOption) => void;
  hint?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const client = useApolloClient();
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  // What the person typed (a pick fills the field but doesn't start a new search).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ for: string; options: PlaceOption[] }>({
    for: '',
    options: [],
  });
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const searchable = query.trim().length >= 2;
  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setStatus('loading');
      client
        .query({ query: PlaceSearchDocument, variables: { query } })
        .then(({ data }) => {
          if (cancelled) return;
          setResults({ for: query, options: data?.placeSearch ?? [] });
          setStatus('idle');
          setActive(-1);
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [client, query, searchable]);

  const options = searchable ? results.options : [];
  const settled = searchable && status === 'idle' && results.for === query;
  const message =
    status === 'error'
      ? "Suggestions aren't available right now — type the place."
      : status === 'loading' && options.length === 0
        ? 'Searching…'
        : settled && options.length === 0
          ? 'No matches — any place works, just type it.'
          : null;
  const showList = open && searchable && (options.length > 0 || !!message);

  const pick = (p: PlaceOption) => {
    onPick(p);
    setQuery('');
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && showList && active >= 0 && options[active]) {
      e.preventDefault(); // pick, don't submit the form
      pick(options[active]);
    } else if (e.key === 'Escape' && showList) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {/* in the flow, not floating: inside a dialog's scrolling body a floating list gets clipped */}
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={hint ? hintId : undefined}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-control border border-border-input bg-surface px-3 text-sm text-ink placeholder:text-ink-muted"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          hidden={!showList}
          className="mt-1.5 max-h-72 overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-popover"
        >
          {options.map((o, i) => (
            <li
              key={`${o.label}-${o.timeZone}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown would blur the input first and close the list before the click lands
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2 aria-selected:bg-surface-muted"
            >
              <PinIcon size={16} className="shrink-0 text-ink-muted" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{o.name}</span>
                <span className="truncate text-[13px] text-ink-muted">
                  {[o.region, o.country].filter(Boolean).join(', ')}
                  {o.currency && ` · ${o.currency}`}
                </span>
              </span>
            </li>
          ))}
          {message && (
            <li role="presentation" className="px-3.5 py-3 text-[13px] text-ink-muted">
              {message}
            </li>
          )}
        </ul>
      </div>
      {hint && (
        <p id={hintId} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {settled ? `${options.length} suggestion${options.length === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  );
}

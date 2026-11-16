import { useApolloClient } from '@apollo/client/react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { graphql } from '../gql';
import type { PlaceSuggestionsQuery } from '../gql/graphql';
import { CloseIcon, PinIcon } from './Icons';

const PlaceSuggestionsDocument = graphql(`
  query PlaceSuggestions($tripId: ID!, $query: String!) {
    placeSuggestions(tripId: $tripId, query: $query) {
      googlePlaceId
      name
      address
      kind
    }
  }
`);

export type PlaceMatch = PlaceSuggestionsQuery['placeSuggestions'][number];

/**
 * "What" field for activities and ideas — rules §1.5 Place search. Typing searches real places
 * near the trip's destination; picking one fills the title and attaches the place. Free text
 * always works (not everything is a place). Same combobox behaviour as the destination field.
 */
export function PlaceSearchField({
  tripId,
  label,
  value,
  onChange,
  place,
  onPick,
  enabled,
  placeholder,
  autoFocus,
}: {
  tripId: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  place: PlaceMatch | null;
  onPick: (place: PlaceMatch | null) => void;
  /** False when place search isn't set up: a plain text field. */
  enabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const client = useApolloClient();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ for: string; options: PlaceMatch[] }>({
    for: '',
    options: [],
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const searchable = enabled && query.trim().length >= 2;
  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setStatus('loading');
      client
        .query({ query: PlaceSuggestionsDocument, variables: { tripId, query } })
        .then(({ data }) => {
          if (cancelled) return;
          setResults({ for: query, options: data?.placeSuggestions ?? [] });
          setStatus('idle');
          setActive(-1);
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [client, query, searchable, tripId]);

  const options = searchable ? results.options : [];
  const settled = searchable && status === 'idle' && results.for === query;
  const message =
    status === 'error'
      ? "Place search isn't available right now — just type a title."
      : status === 'loading' && options.length === 0
        ? 'Searching places…'
        : settled && options.length === 0
          ? 'No places found — that’s fine, keep it as a title.'
          : null;
  const showList = open && searchable && (options.length > 0 || !!message);

  const pick = (p: PlaceMatch) => {
    onPick(p);
    onChange(p.name);
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
      e.preventDefault();
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
      <div className="relative">
        <input
          id={id}
          type="text"
          role={enabled ? 'combobox' : undefined}
          autoComplete="off"
          aria-autocomplete={enabled ? 'list' : undefined}
          aria-expanded={enabled ? showList : undefined}
          aria-controls={enabled ? listId : undefined}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          required
          autoFocus={autoFocus}
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
        {enabled && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} suggestions`}
            hidden={!showList}
            className="mt-1.5 max-h-72 overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-popover"
          >
            {options.map((o, i) => (
              <li
                key={o.googlePlaceId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2 aria-selected:bg-surface-muted"
              >
                <PinIcon size={16} className="shrink-0 text-ink-muted" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{o.name}</span>
                  <span className="truncate text-[13px] text-ink-muted">
                    {[o.kind, o.address].filter(Boolean).join(' · ')}
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
        )}
      </div>
      {place ? (
        <div className="flex items-center gap-2 rounded-control bg-accent-tint py-1 pr-1 pl-3 text-accent-strong">
          <PinIcon size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[13px]">
            <span className="font-semibold">{place.name}</span>
            {place.address && <span> · {place.address}</span>}
          </span>
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label={`Remove place ${place.name}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-control hover:bg-surface"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ) : (
        enabled && (
          <p className="text-[13px] text-ink-muted">
            Type a place to find it on the map, or any title.
          </p>
        )
      )}
      <span className="sr-only" aria-live="polite">
        {settled ? `${options.length} place${options.length === 1 ? '' : 's'} found` : ''}
      </span>
    </div>
  );
}

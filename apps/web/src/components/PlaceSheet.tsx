import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { graphql } from '../gql';
import { PRICE_WORDS } from '../lib/maps';
import { Dialog } from './Dialog';
import { ExternalIcon, PinIcon, StarIcon } from './Icons';
import { ErrorState, Skeleton } from './States';

const PlaceDetailsDocument = graphql(`
  query PlaceDetails($tripId: ID!, $id: ID!) {
    place(tripId: $tripId, id: $id) {
      id
      details {
        name
        address
        kind
        rating
        ratingCount
        priceLevel
        openingHours
        openNow
        mapsUrl
        website
        photoUrl
        photoAuthors {
          name
          url
        }
      }
    }
  }
`);

/** Monday-first, as Google lists the week; JS counts from Sunday. */
const todayIndex = () => (new Date().getDay() + 6) % 7;

/**
 * Place details — rules §2 Place sheet. Fetched live from Google every time it opens (Google's
 * terms don't allow storing them), with the photo credit and Google Maps link the terms require.
 */
export function PlaceSheet({
  tripId,
  placeId,
  title,
  onClose,
}: {
  tripId: string;
  placeId: string;
  /** The activity's title, shown while details load. */
  title: string;
  onClose: () => void;
}) {
  const { data, loading, error, refetch } = useQuery(PlaceDetailsDocument, {
    variables: { tripId, id: placeId },
  });
  const [week, setWeek] = useState(false);
  const d = data?.place?.details;
  const today = d?.openingHours[todayIndex()];

  return (
    <Dialog open onClose={onClose} title={d?.name ?? title}>
      <div className="flex flex-col gap-4">
        {loading && !data && (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-44 rounded-card" />
            <Skeleton className="h-5 w-2/3 rounded-control" />
            <Skeleton className="h-5 w-1/2 rounded-control" />
          </div>
        )}
        {(error || (data && !d)) && (
          <ErrorState
            message="We couldn't load this place's details right now."
            onRetry={() => void refetch()}
          />
        )}
        {d && (
          <>
            {d.photoUrl && (
              <figure className="flex flex-col gap-1">
                <img
                  src={d.photoUrl}
                  alt={`Photo of ${d.name}`}
                  className="h-48 w-full rounded-card bg-surface-muted object-cover"
                  loading="lazy"
                />
                {d.photoAuthors.length > 0 && (
                  <figcaption className="text-xs text-ink-muted">
                    Photo:{' '}
                    {d.photoAuthors.map((a, i) => (
                      <span key={a.name}>
                        {i > 0 && ', '}
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noreferrer">
                            {a.name}
                          </a>
                        ) : (
                          a.name
                        )}
                      </span>
                    ))}
                  </figcaption>
                )}
              </figure>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {d.kind && <span className="text-ink-secondary">{d.kind}</span>}
              {d.rating != null && (
                <span className="flex items-center gap-1 font-semibold">
                  <StarIcon size={14} className="text-accent" />
                  <span className="figures">{d.rating.toFixed(1)}</span>
                  {d.ratingCount != null && (
                    <span className="font-normal text-ink-muted figures">
                      ({d.ratingCount.toLocaleString()})
                    </span>
                  )}
                  <span className="sr-only">out of 5</span>
                </span>
              )}
              {d.priceLevel != null && (
                <span className="text-ink-secondary">{PRICE_WORDS[d.priceLevel]}</span>
              )}
            </div>

            {(d.openNow != null || today) && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm">
                  {d.openNow != null && (
                    <span
                      className={`font-semibold ${d.openNow ? 'text-ink' : 'text-negative-ink'}`}
                    >
                      {d.openNow ? 'Open now' : 'Closed now'}
                    </span>
                  )}
                  {today && (
                    <span className="text-ink-secondary">
                      {d.openNow != null && ' · '}
                      Today {today.replace(/^[^:]+:\s*/, '')}
                    </span>
                  )}
                </p>
                {d.openingHours.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-expanded={week}
                      onClick={() => setWeek((w) => !w)}
                      className="flex min-h-11 items-center self-start text-sm font-semibold text-accent-strong"
                    >
                      {week ? 'Hide opening hours' : 'All opening hours'}
                    </button>
                    {week && (
                      <ul className="flex flex-col gap-1 text-[13px] text-ink-secondary">
                        {d.openingHours.map((line, i) => (
                          <li
                            key={line}
                            className={i === todayIndex() ? 'font-semibold text-ink' : ''}
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {d.address && (
              <p className="flex items-start gap-2 text-sm text-ink-secondary">
                <PinIcon size={16} className="mt-0.5 shrink-0" />
                {d.address}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              {d.mapsUrl && (
                <a
                  href={d.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-2 rounded-control bg-sign px-4.5 text-sm font-semibold text-white no-underline hover:bg-sign-raised"
                >
                  Open in Google Maps
                  <ExternalIcon size={16} />
                </a>
              )}
              {d.website && (
                <a
                  href={d.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-2 rounded-control border-[1.5px] border-border bg-surface px-4.5 text-sm font-semibold text-ink no-underline hover:border-border-input hover:bg-bg"
                >
                  Website
                  <ExternalIcon size={16} />
                </a>
              )}
            </div>
            <p className="text-xs text-ink-muted">Details from Google, as of now.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

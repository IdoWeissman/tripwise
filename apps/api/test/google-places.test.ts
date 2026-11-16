import { describe, expect, it } from 'vitest';
import { googlePlaces, isGooglePlaceId } from '../src/places/google.js';
import { nearDestination } from '../src/graphql/resolvers/places.js';

const PLACE = 'ChIJexamplePlaceId01';

function fakeGoogle(handler: (url: string, init: RequestInit) => unknown) {
  const calls: { url: string; mask: string | null; key: string | null }[] = [];
  const fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      mask: headers['X-Goog-FieldMask'] ?? null,
      key: headers['X-Goog-Api-Key'] ?? null,
    });
    return Response.json(handler(url, init ?? {}));
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('Google Places client', () => {
  it('searches with Pro fields only and keeps complete results', async () => {
    const g = fakeGoogle(() => ({
      places: [
        {
          id: PLACE,
          displayName: { text: 'Example Market' },
          shortFormattedAddress: 'Av. Exemplo 1, Lisboa',
          location: { latitude: 38.7, longitude: -9.14 },
          primaryTypeDisplayName: { text: 'Market' },
        },
        { id: 'ChIJnoLocation000001', displayName: { text: 'No location' } },
      ],
    }));
    const results = await googlePlaces({ apiKey: 'k', fetch: g.fetch }).search('example market');
    expect(results).toEqual([
      {
        googlePlaceId: PLACE,
        name: 'Example Market',
        address: 'Av. Exemplo 1, Lisboa',
        kind: 'Market',
        lat: 38.7,
        lng: -9.14,
      },
    ]);
    expect(g.calls[0]!.key).toBe('k');
    // No Enterprise fields (rating, hours, price) in a list nobody has opened.
    expect(g.calls[0]!.mask).not.toMatch(/rating|OpeningHours|priceLevel|websiteUri/);
  });

  it('reads details, price level and photo credits; photos come back without the key', async () => {
    const g = fakeGoogle((url) =>
      url.includes('/media')
        ? { photoUri: 'https://lh3.googleusercontent.com/p/example=s640' }
        : {
            id: PLACE,
            displayName: { text: 'Example Market' },
            formattedAddress: 'Av. Exemplo 1, 1200 Lisboa, Portugal',
            priceLevel: 'PRICE_LEVEL_MODERATE',
            rating: 4.6,
            userRatingCount: 12000,
            regularOpeningHours: { weekdayDescriptions: ['Monday: 10:00 AM – 12:00 AM'] },
            currentOpeningHours: { openNow: true },
            googleMapsUri: 'https://maps.google.com/?cid=1',
            photos: [
              {
                name: `places/${PLACE}/photos/AbC123`,
                authorAttributions: [
                  { displayName: 'Dana', uri: 'https://maps.google.com/contrib/1' },
                ],
              },
            ],
          },
    );
    const client = googlePlaces({ apiKey: 'k', fetch: g.fetch });
    const d = (await client.details(PLACE))!;
    expect(d).toMatchObject({
      priceLevel: 2,
      rating: 4.6,
      openNow: true,
      photoAuthors: [{ name: 'Dana' }],
    });
    const photo = await client.photoUrl(d.photoName!);
    expect(photo).toBe('https://lh3.googleusercontent.com/p/example=s640');
    expect(g.calls[1]!.url).toContain('skipHttpRedirect=true');
    expect(g.calls[1]!.url).not.toContain('key=');
  });

  it('never puts an unexpected id into a URL', async () => {
    const g = fakeGoogle(() => ({}));
    const client = googlePlaces({ apiKey: 'k', fetch: g.fetch });
    expect(isGooglePlaceId('../../admin')).toBe(false);
    expect(await client.details('../../admin')).toBeNull();
    expect(await client.photoUrl('https://evil.example/x')).toBeNull();
    expect(g.calls).toHaveLength(0);
  });
});

describe('search near the destination', () => {
  it('adds the destination unless the query already names it', () => {
    expect(nearDestination('time out market', 'Lisbon, Portugal')).toBe(
      'time out market, Lisbon, Portugal',
    );
    expect(nearDestination('Lisbon cathedral', 'Lisbon, Portugal')).toBe('Lisbon cathedral');
  });
});

/**
 * Google Places API (New), server side. The key never leaves the server.
 *
 * Costs depend on the fields asked for, so each call asks for the cheapest set that does its job:
 * search = Text Search Pro (name, address, location, type), coordinates = Place Details Essentials
 * (location), and the full card = Place Details Enterprise (rating, hours, price, website), which
 * runs only when someone opens a place.
 *
 * Google's terms allow storing place IDs indefinitely and coordinates for 30 days; everything else
 * is fetched live and never stored.
 */

const BASE = 'https://places.googleapis.com/v1';

export interface PlaceSuggestion {
  googlePlaceId: string;
  name: string;
  address: string | null;
  kind: string | null;
  lat: number;
  lng: number;
}

export interface PlaceDetails {
  googlePlaceId: string;
  name: string;
  address: string | null;
  kind: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  ratingCount: number | null;
  /** 0 (free) to 4 (very expensive), as Google rates it. */
  priceLevel: number | null;
  /** "Monday: 9:00 AM – 6:00 PM", one line per weekday. */
  openingHours: string[];
  openNow: boolean | null;
  mapsUrl: string | null;
  website: string | null;
  /** Google photo resource name; turned into a URL by `photoUrl`. Never stored. */
  photoName: string | null;
  /** Photo authors to credit wherever the photo is shown (Google's terms). */
  photoAuthors: { name: string; url: string | null }[];
}

/** What the day planner needs: when it's open and what kind of place it is. */
export interface PlanInfo {
  primaryType: string | null;
  /** Google's periods (day 0 = Sunday); empty when Google has no hours. */
  periods: {
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }[];
}

export interface PlacesClient {
  search(query: string, opts?: { language?: string }): Promise<PlaceSuggestion[]>;
  location(googlePlaceId: string): Promise<{ lat: number; lng: number } | null>;
  details(googlePlaceId: string, opts?: { language?: string }): Promise<PlaceDetails | null>;
  photoUrl(photoName: string, maxWidthPx?: number): Promise<string | null>;
  planInfo(googlePlaceId: string): Promise<PlanInfo | null>;
}

const PRICE_LEVELS = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
];

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[]; periods?: PlanInfo['periods'] };
  primaryType?: string;
  currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
  websiteUri?: string;
  photos?: { name?: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
}

/** Place IDs are letters, digits, "-" and "_"; anything else never reaches a URL. */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
export const isGooglePlaceId = (id: string) => PLACE_ID.test(id);

export function googlePlaces(opts: { apiKey: string; fetch?: typeof fetch }): PlacesClient {
  const doFetch = opts.fetch ?? fetch;
  const call = async (url: string, init: RequestInit & { fieldMask?: string }) => {
    const res = await doFetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': opts.apiKey,
        ...(init.fieldMask ? { 'X-Goog-FieldMask': init.fieldMask } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<unknown>;
  };

  return {
    async search(query, { language } = {}) {
      const body = (await call(`${BASE}/places:searchText`, {
        method: 'POST',
        // Pro fields only: no ratings or hours in a list nobody has opened yet.
        fieldMask:
          'places.id,places.displayName,places.shortFormattedAddress,places.location,places.primaryTypeDisplayName',
        body: JSON.stringify({ textQuery: query, pageSize: 8, languageCode: language ?? 'en' }),
      })) as { places?: RawPlace[] };
      return (body.places ?? []).flatMap((p) =>
        p.id && p.displayName?.text && p.location?.latitude != null && p.location.longitude != null
          ? [
              {
                googlePlaceId: p.id,
                name: p.displayName.text,
                address: p.shortFormattedAddress ?? null,
                kind: p.primaryTypeDisplayName?.text ?? null,
                lat: p.location.latitude,
                lng: p.location.longitude,
              },
            ]
          : [],
      );
    },

    async location(googlePlaceId) {
      if (!isGooglePlaceId(googlePlaceId)) return null;
      const p = (await call(`${BASE}/places/${googlePlaceId}`, {
        method: 'GET',
        fieldMask: 'id,location', // Essentials
      })) as RawPlace;
      const { latitude, longitude } = p.location ?? {};
      return latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null;
    },

    async details(googlePlaceId, { language } = {}) {
      if (!isGooglePlaceId(googlePlaceId)) return null;
      const p = (await call(
        `${BASE}/places/${googlePlaceId}?languageCode=${encodeURIComponent(language ?? 'en')}`,
        {
          method: 'GET',
          fieldMask: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'primaryTypeDisplayName',
            'googleMapsUri',
            'photos',
            'rating',
            'userRatingCount',
            'priceLevel',
            'regularOpeningHours',
            'currentOpeningHours.openNow',
            'websiteUri',
          ].join(','),
        },
      )) as RawPlace;
      if (!p.id) return null;
      const photo = p.photos?.[0];
      const level = p.priceLevel ? PRICE_LEVELS.indexOf(p.priceLevel) : -1;
      return {
        googlePlaceId: p.id,
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? null,
        kind: p.primaryTypeDisplayName?.text ?? null,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        priceLevel: level >= 0 ? level : null,
        openingHours: p.regularOpeningHours?.weekdayDescriptions ?? [],
        openNow: p.currentOpeningHours?.openNow ?? null,
        mapsUrl: p.googleMapsUri ?? null,
        website: p.websiteUri ?? null,
        photoName: photo?.name ?? null,
        photoAuthors: (photo?.authorAttributions ?? []).flatMap((a) =>
          a.displayName ? [{ name: a.displayName, url: a.uri ?? null }] : [],
        ),
      };
    },

    async planInfo(googlePlaceId) {
      if (!isGooglePlaceId(googlePlaceId)) return null;
      const p = (await call(`${BASE}/places/${googlePlaceId}`, {
        method: 'GET',
        // Hours are an Enterprise field: asked for only when a day with this place is checked.
        fieldMask: 'id,primaryType,regularOpeningHours.periods',
      })) as RawPlace;
      if (!p.id) return null;
      return {
        primaryType: p.primaryType ?? null,
        periods: (p.regularOpeningHours?.periods ?? []).filter(
          (x) => x.open && typeof x.open.day === 'number',
        ),
      };
    },

    async photoUrl(photoName, maxWidthPx = 640) {
      if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) return null;
      // skipHttpRedirect returns a public googleusercontent URL, so the browser never sees our key.
      const body = (await call(
        `${BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`,
        { method: 'GET' },
      )) as { photoUri?: string };
      return body.photoUri && /^https:\/\//.test(body.photoUri) ? body.photoUri : null;
    },
  };
}

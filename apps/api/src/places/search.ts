/**
 * Destination search for the trip form, backed by the Open-Meteo Geocoding API
 * (free, no key, made for as-you-type search; results carry the IANA time zone).
 * The browser asks us, not Open-Meteo: the production CSP stays same-origin, the visitor's IP
 * isn't shared, and repeated prefixes are answered from a small cache.
 */
import { CURRENCY_BY_COUNTRY } from './currencies.js';

export interface PlaceSuggestion {
  name: string;
  /** State / province / region, when it helps tell places apart. */
  region: string | null;
  country: string;
  countryCode: string;
  /** "Portland, Oregon, United States" — for the suggestion list. */
  label: string;
  /** What goes in the Destination field: "Lisbon, Portugal". */
  destination: string;
  timeZone: string;
  /** The currency people pay in there, when known. */
  currency: string | null;
}

interface GeoResult {
  name?: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  timezone?: string;
  feature_code?: string;
  population?: number;
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_LIMIT = 500;
const TIMEOUT_MS = 3000;
const cache = new Map<string, PlaceSuggestion[]>();

/** Turns the API's results into suggestions: places with a zone only, one per label. */
export function toSuggestions(results: GeoResult[] | undefined): PlaceSuggestion[] {
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const r of results ?? []) {
    if (!r.name || !r.country || !r.country_code || !r.timezone) continue;
    const code = r.country_code.toUpperCase();
    const region = r.admin1 && r.admin1 !== r.name && r.admin1 !== r.country ? r.admin1 : null;
    const label = [r.name, region, r.country].filter(Boolean).join(', ');
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      name: r.name,
      region,
      country: r.country,
      countryCode: code,
      label,
      destination: r.name === r.country ? r.name : `${r.name}, ${r.country}`,
      timeZone: r.timezone,
      currency: CURRENCY_BY_COUNTRY[code] ?? null,
    });
  }
  return out;
}

export async function searchPlaces(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceSuggestion[]> {
  // "Lisbon, Por…" searches for "Lisbon"; the API matches names, not "name, country".
  const q = query.split(',')[0]!.trim().slice(0, 60);
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const url = `${ENDPOINT}?${new URLSearchParams({ name: q, count: '8', language: 'en', format: 'json' })}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const body = (await res.json()) as { results?: GeoResult[] };
  const suggestions = toSuggestions(body.results).slice(0, 6);

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, suggestions);
  return suggestions;
}

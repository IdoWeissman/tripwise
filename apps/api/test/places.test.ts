import { describe, expect, it } from 'vitest';
import { searchPlaces, toSuggestions } from '../src/places/search.js';

const portland = {
  name: 'Portland',
  admin1: 'Oregon',
  country: 'United States',
  country_code: 'US',
  timezone: 'America/Los_Angeles',
};

describe('place search', () => {
  it('maps geocoder results to suggestions with zone and currency', () => {
    const [lisbon, pdx] = toSuggestions([
      {
        name: 'Lisbon',
        admin1: 'Lisbon',
        country: 'Portugal',
        country_code: 'PT',
        timezone: 'Europe/Lisbon',
      },
      portland,
      { ...portland }, // duplicate label
      { name: 'Nowhere', country: 'Somewhere' }, // no zone or code: dropped
    ]);
    expect(lisbon).toEqual({
      name: 'Lisbon',
      region: null,
      country: 'Portugal',
      countryCode: 'PT',
      label: 'Lisbon, Portugal',
      destination: 'Lisbon, Portugal',
      timeZone: 'Europe/Lisbon',
      currency: 'EUR',
    });
    expect(pdx).toMatchObject({
      label: 'Portland, Oregon, United States',
      destination: 'Portland, United States',
      timeZone: 'America/Los_Angeles',
      currency: 'USD',
    });
    expect(toSuggestions([portland, portland])).toHaveLength(1);
    expect(toSuggestions(undefined)).toEqual([]);
  });

  it('searches the name before the comma, skips short queries and caches', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ results: [portland] }));
    }) as unknown as typeof fetch;
    expect(await searchPlaces('P', fake)).toEqual([]);
    expect(await searchPlaces('Portland, Ore', fake)).toHaveLength(1);
    await searchPlaces('portland', fake);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('name=Portland');
  });
});

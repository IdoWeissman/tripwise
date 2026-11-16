import { useQuery } from '@apollo/client/react';
import { graphql } from '../gql';

export const MapsConfigDocument = graphql(`
  query MapsConfig {
    maps {
      placesEnabled
      mapEnabled
      browserKey
      mapId
    }
  }
`);

/** What's switched on: place search (server key) and the map (browser key). */
export function useMaps() {
  const { data, loading } = useQuery(MapsConfigDocument, { fetchPolicy: 'cache-first' });
  return {
    loading: loading && !data,
    placesEnabled: data?.maps.placesEnabled ?? false,
    mapEnabled: data?.maps.mapEnabled ?? false,
    browserKey: data?.maps.browserKey ?? null,
    mapId: data?.maps.mapId ?? 'DEMO_MAP_ID',
  };
}

let loading: Promise<void> | null = null;

/**
 * Loads the Maps JavaScript API once per page. The key is the restricted browser key; it's public
 * by design. Rejects (and lets a retry start over) when the script can't load.
 */
export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  // Typed as always present, but it isn't until the script has loaded.
  const g = (window as unknown as { google?: { maps?: { importLibrary?: unknown } } }).google;
  if (g?.maps?.importLibrary) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const callback = `__tripwiseMaps${Date.now()}`;
    (window as unknown as Record<string, () => void>)[callback] = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=marker&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('The map could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** "Inexpensive" … "Very expensive", Google's 0–4 price level in words. */
export const PRICE_WORDS = ['Free', 'Inexpensive', 'Moderate', 'Expensive', 'Very expensive'];

/**
 * Pins at (nearly) the same spot, the stay and a breakfast round the corner, say, would hide each
 * other. Each extra pin within ~40 m of an earlier one moves round it on a small circle, so every
 * plate stays readable; the list keeps the true order.
 */
export function spread(stops: readonly { key: string; lat: number; lng: number }[]) {
  const NEAR = 0.0004; // degrees, ~40 m
  const out = new Map<string, { lat: number; lng: number }>();
  const anchors: { lat: number; lng: number; count: number }[] = [];
  for (const s of stops) {
    const a = anchors.find((x) => Math.abs(x.lat - s.lat) < NEAR && Math.abs(x.lng - s.lng) < NEAR);
    if (!a) {
      anchors.push({ lat: s.lat, lng: s.lng, count: 0 });
      out.set(s.key, { lat: s.lat, lng: s.lng });
      continue;
    }
    a.count++;
    const angle = (a.count * 2 * Math.PI) / 6;
    out.set(s.key, {
      lat: a.lat + NEAR * Math.sin(angle),
      lng: a.lng + (NEAR * Math.cos(angle)) / Math.cos((a.lat * Math.PI) / 180),
    });
  }
  return out;
}

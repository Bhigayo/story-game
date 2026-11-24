// How wide is a road? One place decides, so the road surface, pavements, parked cars, bins, lamps
// and pedestrians all agree. Uses the OpenStreetMap `width` tag when there is one, then the lane
// count (about 3.1 m a lane in a city), then a typical UK width for the type of road.

/** Roads that cars drive on (they get asphalt, kerbs and pavements). */
export const CARRIAGEWAYS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service',
])

const LANE = 3.1
// Typical full width, both directions together (for a one-way road the lane count is used instead)
const TYPICAL: Record<string, number> = {
  motorway: 7.2, motorway_link: 4.2, trunk: 7.2, trunk_link: 4.2, primary: 7.2, primary_link: 4.2,
  secondary: 6.8, secondary_link: 4.2, tertiary: 6.2, tertiary_link: 4.2, unclassified: 5.6, residential: 5.4,
  living_street: 4.2, service: 3.6,
}
const ONEWAY_LANES: Record<string, number> = { motorway: 2, trunk: 2, primary: 2, secondary: 2, tertiary: 1.6, unclassified: 1.4, residential: 1.4 }

export const isOneway = (p: Record<string, string>) => p.oneway === 'yes' || p.oneway === '-1' || p.oneway === '1' || p.junction === 'roundabout'

/** Lanes of traffic across the whole carriageway (for painting lane lines). */
export function laneCount(p: Record<string, string>): number {
  const tagged = Number(p.lanes)
  if (tagged >= 1) return Math.round(tagged)
  return Math.max(1, Math.round(roadWidth(p) / LANE))
}

/** Width in metres of a carriageway, or null if this isn't a road for cars. */
export function roadWidth(p: Record<string, string>): number {
  const tagged = parseFloat(p.width)
  if (tagged >= 2 && tagged <= 30) return tagged
  const lanes = Number(p.lanes)
  if (lanes >= 1) return Math.max(3.2, lanes * LANE)
  if (isOneway(p)) return Math.max(3.4, (ONEWAY_LANES[p.highway] ?? 1) * LANE)
  return TYPICAL[p.highway] ?? 3.6
}

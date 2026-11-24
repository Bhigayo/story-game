// How wide a road is: the same rules as src/world/roadWidth.ts (keep the two in step), so the server's
// pedestrians walk on the pavements the client draws. OSM `width`, then lanes, then a typical UK width.
const LANE = 3.1
const TYPICAL = {
  motorway: 7.2, motorway_link: 4.2, trunk: 7.2, trunk_link: 4.2, primary: 7.2, primary_link: 4.2,
  secondary: 6.8, secondary_link: 4.2, tertiary: 6.2, tertiary_link: 4.2, unclassified: 5.6, residential: 5.4,
  living_street: 4.2, service: 3.6,
}
const ONEWAY_LANES = { motorway: 2, trunk: 2, primary: 2, secondary: 2, tertiary: 1.6, unclassified: 1.4, residential: 1.4 }
const isOneway = (p) => p.oneway === 'yes' || p.oneway === '-1' || p.oneway === '1' || p.junction === 'roundabout'

export function roadWidth(p) {
  const tagged = parseFloat(p.width)
  if (tagged >= 2 && tagged <= 30) return tagged
  const lanes = Number(p.lanes)
  if (lanes >= 1) return Math.max(3.2, lanes * LANE)
  if (isOneway(p)) return Math.max(3.4, (ONEWAY_LANES[p.highway] ?? 1) * LANE)
  return TYPICAL[p.highway] ?? 3.6
}

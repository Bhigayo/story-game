import { toWorld } from './districts.mjs'
export { toWorld, inBounds, DISTRICTS } from './districts.mjs'

// Getting around Birmingham: fares, journey times and which modes make sense for a trip.
// All money is in pence. Pure functions only, so the rules are easy to test.
//
// FARE SOURCES (checked Nov 2026)
//   bus   VERIFIED  NX West Midlands adult single is capped at £3.00 (£2.90 on most routes).
//                   A monthly Swift pass (the £70 "Bus pass" bill every player pays) covers it.
//   tram  VERIFIED  West Midlands Metro 2026 singles: Zone 1 £2.50, Zone 1-2 £3.50
//                   (increase from £2.30 / £3.20, reported by Express & Star, Nov 2025).
//   train ESTIMATE  West Midlands Railway local fares, modelled as a base plus a per-km rate.
//   uber  ESTIMATE  UberX metered style: booking fee + per-km + per-minute, £5 minimum,
//                   with surge pricing that comes and goes. Real prices vary by minute.
// The Digbeth tram stop is shown as "Digbeth High St (Metro)": the Eastside extension was due
// to open in 2026, and the game assumes it is running.

export const FARES = {
  bus: { single: 290, cap: 300 },
  tram: { zone1: 250, zone12: 350, zone1MaxKm: 3.2 },
  train: { base: 240, perKm: 28 },
  uber: { base: 320, perKm: 70, perMin: 16, min: 500, wait: 30 },
}

const WALK_KMH = 5
const WALK_ROUTE = 1.25
const ROAD_ROUTE = 1.35
const RAIL_ROUTE = 1.2
const SPEED = { bus: 14, tram: 20, train: 40, uber: 22 } // km/h in the vehicle
const WAIT = { bus: 6, tram: 5, train: 8, uber: 4 } // minutes
const STOP_REACH_M = 900 // furthest you'd walk to a stop

const stop = (id, name, mode, lon, lat) => {
  const [x, z] = toWorld(lon, lat)
  return { id, name, mode, x, z }
}
// Stations whose position is taken from the building on the map
const stopAt = (id, name, mode, x, z) => ({ id, name, mode, x, z })

// Approximate positions of real stops and stations
export const STOPS = [
  stop('bus-digbeth', 'Digbeth High St', 'bus', -1.8868, 52.4765),
  stop('bus-bullring', 'Bull Ring Bus Station', 'bus', -1.8935, 52.4774),
  stop('bus-aston', 'Aston University', 'bus', -1.8893, 52.4866),
  stop('bus-airport', 'Birmingham Airport', 'bus', -1.7480, 52.4537),
  stop('tram-digbeth', 'Digbeth High St (Metro)', 'tram', -1.8890, 52.4767),
  stop('tram-bull', 'Bull Street (Metro)', 'tram', -1.8978, 52.4812),
  stop('tram-ns', 'Grand Central (Metro)', 'tram', -1.8985, 52.4777),
  stop('tram-aston', 'Aston Uni (Metro)', 'tram', -1.8897, 52.4858),
  stopAt('rail-moor', 'Moor Street Station', 'train', -471, -321),
  stopAt('rail-ns', 'Birmingham New Street', 'train', -948, -176),
  stop('rail-snow', 'Snow Hill Station', 'train', -1.8996, 52.4834),
  stop('rail-aston', 'Aston Station', 'train', -1.8744, 52.5000),
  stop('rail-airport', 'Birmingham International', 'train', -1.7254, 52.4503),
]

// Places that are not built yet: you can see what getting there would cost, but not go.
export const FAR_DESTINATIONS = [
  { id: 'far-bullring', name: 'Bullring & Selfridges', icon: '🛍️', lon: -1.8941, lat: 52.4774 },
  { id: 'far-centre', name: 'City Centre (New Street)', icon: '🏙️', lon: -1.8984, lat: 52.4778 },
  { id: 'far-bcu', name: 'BCU City Centre Campus', icon: '🎓', lon: -1.8928, lat: 52.4859 },
  { id: 'far-aston', name: 'Aston University', icon: '🎓', lon: -1.8893, lat: 52.4866 },
  { id: 'far-airport', name: 'Birmingham Airport', icon: '✈️', lon: -1.7480, lat: 52.4537 },
].map((d) => {
  const [x, z] = toWorld(d.lon, d.lat)
  return { id: d.id, name: d.name, icon: d.icon, x, z }
})

const metres = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const minutesFor = (m, kmh) => (m / 1000 / kmh) * 60

function nearestStop(point, mode) {
  let best = null
  for (const s of STOPS) {
    if (s.mode !== mode) continue
    const d = metres(point, s)
    if (!best || d < best.d) best = { stop: s, d }
  }
  return best
}

/** Surge for Uber, changing about once a minute. Deterministic for a given minute so it can be tested. */
export function surgeAt(now = Date.now()) {
  const minute = Math.floor(now / 60000)
  const n = Math.abs(Math.sin(minute * 12.9898) * 43758.5453) % 1
  return n < 0.7 ? 1 : n < 0.9 ? 1.3 : 1.7
}

export const formatPence = (p) => `£${(p / 100).toFixed(2)}`

/**
 * Prices every way of getting from `from` to `to`.
 * opts: { hasPass: boolean, surge: number }
 * Returns { straight, walk, modes: [{ id, label, available, reason?, fare, minutes, note }] }
 */
export function quote(from, to, opts = {}) {
  const { hasPass = true, surge = 1 } = opts
  const straight = metres(from, to)
  const walkMin = minutesFor(straight * WALK_ROUTE, WALK_KMH)
  const roadKm = (straight * ROAD_ROUTE) / 1000
  const railKm = (straight * RAIL_ROUTE) / 1000

  const walk = { id: 'walk', label: 'Walk', icon: '🚶', available: true, fare: 0, minutes: Math.max(1, Math.round(walkMin)), note: 'Free. You walk it yourself.' }

  // A public mode works if you can reach a stop at each end, and the trip beats walking
  const publicMode = (id, label, icon, fareFor, noteFor) => {
    const base = { id, label, icon, available: false, fare: 0, minutes: 0, note: '' }
    const a = nearestStop(from, id)
    const b = nearestStop(to, id)
    if (!a || !b || a.stop.id === b.stop.id) return { ...base, reason: `No ${label.toLowerCase()} service for this trip` }
    if (a.d > STOP_REACH_M) return { ...base, reason: `Nearest ${label.toLowerCase()} stop is ${Math.round(a.d)} m away` }
    if (b.d > STOP_REACH_M) return { ...base, reason: `No ${label.toLowerCase()} stop near there` }
    const vehicleKm = (metres(a.stop, b.stop) * (id === 'bus' ? ROAD_ROUTE : RAIL_ROUTE)) / 1000
    const minutes = minutesFor(a.d * WALK_ROUTE, WALK_KMH) + WAIT[id] + (vehicleKm / SPEED[id]) * 60 + minutesFor(b.d * WALK_ROUTE, WALK_KMH)
    if (minutes >= walkMin) return { ...base, reason: 'Walking is quicker', minutes: Math.round(minutes) }
    return { ...base, available: true, fare: fareFor(vehicleKm), minutes: Math.max(1, Math.round(minutes)), note: noteFor(a.stop, b.stop) }
  }

  const bus = publicMode(
    'bus', 'NX bus', '🚌',
    () => (hasPass ? 0 : Math.min(FARES.bus.single, FARES.bus.cap)),
    (a, b) => `${a.name} to ${b.name}. ${hasPass ? 'Covered by your Swift bus pass.' : 'Adult single.'}`,
  )
  const tram = publicMode(
    'tram', 'Tram', '🚊',
    (km) => (km <= FARES.tram.zone1MaxKm ? FARES.tram.zone1 : FARES.tram.zone12),
    (a, b) => `${a.name} to ${b.name}. ${metres(a, b) / 1000 * RAIL_ROUTE <= FARES.tram.zone1MaxKm ? 'Metro Zone 1 single.' : 'Metro Zone 1-2 single.'}`,
  )
  const train = publicMode(
    'train', 'Train', '🚆',
    (km) => Math.round((FARES.train.base + FARES.train.perKm * km) / 10) * 10,
    (a, b) => `${a.name} to ${b.name}. Estimated single fare.`,
  )

  // Uber: you can be picked up anywhere, so it only needs a trip worth taking
  let uber
  if (straight < 200) {
    uber = { id: 'uber', label: 'Uber', icon: '🚕', available: false, fare: 0, minutes: 0, note: '', reason: 'Too close for a cab' }
  } else {
    const minutes = WAIT.uber + (roadKm / SPEED.uber) * 60
    const metered = FARES.uber.base + FARES.uber.perKm * roadKm + FARES.uber.perMin * ((roadKm / SPEED.uber) * 60)
    const fare = Math.round((Math.max(FARES.uber.min, metered) * surge) / 10) * 10
    uber = {
      id: 'uber', label: 'Uber', icon: '🚕', available: true, fare, minutes: Math.max(1, Math.round(minutes)),
      note: surge > 1 ? `Busy right now: prices ×${surge}. Estimated fare.` : 'Door to door. Estimated fare.', surge,
    }
  }

  return { straight: Math.round(straight), walk, modes: [walk, bus, tram, train, uber] }
}

/** Real minutes become a short wait in game: 1 minute of journey is about 1.5 seconds of waiting. */
export const TRAVEL_SECONDS_PER_MIN = Number(process.env.TRAVEL_SCALE) || 1.5
const MIN_SECONDS = process.env.TRAVEL_SCALE ? 0.3 : 3
export const travelSeconds = (minutes) => Math.min(30, Math.max(MIN_SECONDS, minutes * TRAVEL_SECONDS_PER_MIN))

/** Takes the fare and counts the ride. The caller has already checked they can afford it. */
export function bookTrip(profile, fare) {
  profile.balance -= fare
  profile.stats.rides = (profile.stats.rides ?? 0) + 1
  profile.stats.fares = (profile.stats.fares ?? 0) + fare
}

// Health, hospitals and police stations (v49, E15).
// You have 100 health. Being hit by a car on foot, or a hard crash at the wheel, costs some; it comes back
// slowly once nothing has hurt you for a while. At 0 you're WASTED: you wake up at the nearest hospital,
// billed, with the police off your back. Busted now takes you to the nearest police station.

// Spots on the pavement outside each building (worked out from the map: the first clear point between the
// building and its nearest road). The hospitals are invented names on real hospital buildings; the police
// stations are the real ones.
export const HOSPITALS = [
  { id: 'steelhouse', name: 'Steelhouse Lane Hospital', x: -562.9, z: -1033.4 },
  { id: 'westside', name: 'Westside Hospital', x: -1347.2, z: -631.9 },
]
export const STATIONS = [
  { id: 'lloyd', name: 'Lloyd House police station', x: -840.4, z: -893.6 },
  { id: 'digbeth', name: 'Digbeth police station', x: -363, z: -53.4 },
]

export const HEALTH = {
  max: 100,
  regenAfterMs: 10000, // nothing has hurt you for this long...
  regenPerSecond: 2, // ...then it comes back at this rate
  hospitalBill: 10000, // pence (£100), or whatever you have
  wastedMs: 4500, // how long the WASTED screen holds before you wake at the hospital
  bustedMs: 4000, // the same for BUSTED
  knockedMs: 1400, // knocked over by a car, but alive: you can't move for this long
  carHitFrom: 4.5, // m/s: slower than this, a car just nudges you
}

/** Hit by a car on foot: 10 m/s (22 mph) costs about half your health, 18 m/s (40 mph) all of it. */
export const carHitDamage = (speed) => (speed < HEALTH.carHitFrom ? 0 : Math.round(15 + (speed - HEALTH.carHitFrom) * 6.5))

/** A crash at the wheel: nothing below 8 m/s of impact (18 mph), about a third of your health at 15 m/s. */
export const crashDamage = (impact) => (impact < 8 ? 0 : Math.round((impact - 8) * 4.5))

/** The nearest place in a list. */
export const nearest = (list, x, z) => list.reduce((best, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z) ? p : best))

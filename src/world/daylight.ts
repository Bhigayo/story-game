// Day, night and rain (v46). Everyone sees the same sky: the hour comes from the server's clock, which
// every client is already synced to (NetClient sets `clock.offset`), and so does the weather.
//
// A game day is 48 real minutes. The hour drives keyframes (night, dawn, day, golden hour, dusk) for the
// sun or moon, sky, fog and ambient light, and `lights`: 0 by day, 1 at night, which brightens windows,
// shop fronts, street lamps, signs and headlights. Those materials register here with their day and night
// values (`onDayNight`); wet surfaces register with `onWet`.
//
// Dev: ?hour=22 fixes the time, ?rain=1 (or 0) fixes the weather, ?day=4 makes a day last 4 minutes.
import * as THREE from 'three'

export const clock = { offset: 0 } // server time minus local time, in ms

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const FIXED_HOUR = params.has('hour') ? Number(params.get('hour')) : null
const FIXED_RAIN = params.has('rain') ? Number(params.get('rain')) : null
const DAY_MS = (Number(params.get('day')) || 48) * 60_000
const START_HOUR = 19 // at server time 0 it's 7 pm, so new servers start in the evening

/** The hour of the day, 0..24, the same for every player. */
export function gameHour(now = Date.now()) {
  if (FIXED_HOUR !== null && Number.isFinite(FIXED_HOUR)) return ((FIXED_HOUR % 24) + 24) % 24
  const t = now + clock.offset
  return (((t / DAY_MS) * 24 + START_HOUR) % 24 + 24) % 24
}

// ---- Weather: rain comes and goes on a schedule everyone shares ----
const SLOT_MS = 9 * 60_000 // weather can change every 9 real minutes...
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
/** Rain 0..1. About a third of slots are wet; it eases in and out over a couple of minutes. */
export function rainAmount(now = Date.now()) {
  if (FIXED_RAIN !== null && Number.isFinite(FIXED_RAIN)) return Math.max(0, Math.min(1, FIXED_RAIN))
  const t = (now + clock.offset) / SLOT_MS
  const slot = Math.floor(t)
  const wet = (k: number) => (hash(k) < 0.34 ? 0.45 + hash(k + 0.5) * 0.55 : 0)
  const f = t - slot
  const ease = (x: number) => x * x * (3 - 2 * x)
  // ...blending into the next slot over the last 20% of this one
  return f < 0.8 ? wet(slot) : wet(slot) + (wet(slot + 1) - wet(slot)) * ease((f - 0.8) / 0.2)
}

// ---- Keyframes ----
export type Sky = {
  sunElevation: number // radians above the horizon (the moon, at night)
  sunColour: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  fog: string
  horizon: string
  mid: string
  top: string
  skyline: string
  exposure: number
  env: number // reflections
  lights: number // 0 = day, 1 = full night
}

const KEYS: [number, Sky][] = [
  [0, { sunElevation: 0.6, sunColour: '#8FA8E0', sunIntensity: 0.35, hemiSky: '#3A4478', hemiGround: '#231C2C', hemiIntensity: 0.55, fog: '#1D1B2E', horizon: '#2A2540', mid: '#171633', top: '#07081A', skyline: '#24203A', exposure: 1.0, env: 0.18, lights: 1 }],
  [5, { sunElevation: 0.5, sunColour: '#8FA8E0', sunIntensity: 0.3, hemiSky: '#3A4478', hemiGround: '#231C2C', hemiIntensity: 0.5, fog: '#1F1D30', horizon: '#33294A', mid: '#1A1836', top: '#080A1C', skyline: '#26223C', exposure: 1.0, env: 0.18, lights: 1 }],
  [6.5, { sunElevation: 0.08, sunColour: '#FF9C6B', sunIntensity: 1.6, hemiSky: '#8C90C8', hemiGround: '#4A3C4E', hemiIntensity: 0.65, fog: '#C79A9F', horizon: '#F4A27A', mid: '#B47B9A', top: '#3B3F78', skyline: '#7D6A8C', exposure: 1.0, env: 0.35, lights: 0.55 }],
  [8.5, { sunElevation: 0.55, sunColour: '#FFE7C4', sunIntensity: 2.8, hemiSky: '#B9CBEA', hemiGround: '#6B6460', hemiIntensity: 0.95, fog: '#B9C3CF', horizon: '#D8DDE2', mid: '#9DB4D4', top: '#5E86C2', skyline: '#9AA3B4', exposure: 1.0, env: 0.55, lights: 0 }],
  [13, { sunElevation: 0.95, sunColour: '#FFF2DC', sunIntensity: 3.0, hemiSky: '#BED0EE', hemiGround: '#6E6862', hemiIntensity: 1.0, fog: '#BCC6D2', horizon: '#DCE1E6', mid: '#A2B9D8', top: '#5A84C4', skyline: '#9EA6B6', exposure: 1.0, env: 0.6, lights: 0 }],
  [17, { sunElevation: 0.42, sunColour: '#FFDDB0', sunIntensity: 2.8, hemiSky: '#B4BEE0', hemiGround: '#6A5E5C', hemiIntensity: 0.9, fog: '#C6B8BC', horizon: '#EFCDB2', mid: '#AFA9C8', top: '#4F6FB0', skyline: '#9A92A8', exposure: 1.0, env: 0.5, lights: 0.05 }],
  // the golden hour the game was built in
  [19, { sunElevation: 0.16, sunColour: '#FFB070', sunIntensity: 3.0, hemiSky: '#9DA3E8', hemiGround: '#5B4660', hemiIntensity: 0.8, fog: '#C08A9E', horizon: '#F59E73', mid: '#B86190', top: '#2B296B', skyline: '#8A6C93', exposure: 1.0, env: 0.45, lights: 0.55 }],
  [20.5, { sunElevation: 0.02, sunColour: '#E8806A', sunIntensity: 1.1, hemiSky: '#6B5FA8', hemiGround: '#3A2C42', hemiIntensity: 0.65, fog: '#5A4366', horizon: '#C2687A', mid: '#5E3D72', top: '#151548', skyline: '#4A3A5E', exposure: 1.0, env: 0.3, lights: 0.9 }],
  [22, { sunElevation: 0.55, sunColour: '#8FA8E0', sunIntensity: 0.35, hemiSky: '#3A4478', hemiGround: '#231C2C', hemiIntensity: 0.55, fog: '#1D1B2E', horizon: '#2A2540', mid: '#171633', top: '#07081A', skyline: '#24203A', exposure: 1.0, env: 0.18, lights: 1 }],
  [24, { sunElevation: 0.6, sunColour: '#8FA8E0', sunIntensity: 0.35, hemiSky: '#3A4478', hemiGround: '#231C2C', hemiIntensity: 0.55, fog: '#1D1B2E', horizon: '#2A2540', mid: '#171633', top: '#07081A', skyline: '#24203A', exposure: 1.0, env: 0.18, lights: 1 }],
]

const ca = new THREE.Color()
const cb = new THREE.Color()
const mixHex = (a: string, b: string, t: number) => '#' + ca.set(a).lerp(cb.set(b), t).getHexString()
const RAIN_GREY: Partial<Sky> = { fog: '#6E7178', horizon: '#80848C', mid: '#6C7078', top: '#4C5058', skyline: '#5C5F66' }

/** The sky at an hour, with rain greying it down (`rain` 0..1). */
export function skyAt(hour: number, rain = 0): Sky {
  let i = 0
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++
  const [h0, a] = KEYS[i]
  const [h1, b] = KEYS[i + 1]
  const t = Math.max(0, Math.min(1, (hour - h0) / (h1 - h0)))
  const out = {} as Sky
  for (const k of Object.keys(a) as (keyof Sky)[]) {
    const va = a[k]
    const vb = b[k]
    ;(out as Record<string, unknown>)[k] = typeof va === 'number' ? va + ((vb as number) - va) * t : mixHex(va as string, vb as string, t)
  }
  if (rain > 0) {
    // overcast: the colours sink toward grey (darker at night), the sun weakens, lights come on earlier
    const night = out.lights
    for (const k of Object.keys(RAIN_GREY) as (keyof Sky)[]) {
      const grey = ca.set(RAIN_GREY[k] as string).multiplyScalar(1 - night * 0.75)
      ;(out as Record<string, unknown>)[k] = '#' + cb.set(out[k] as string).lerp(grey, rain * 0.7).getHexString()
    }
    out.sunIntensity *= 1 - rain * 0.6
    out.lights = Math.min(1, out.lights + rain * 0.3)
  }
  return out
}

// ---- Things that change between day and night (or wet and dry) ----
type Knob = { apply: (lights: number, wet: number) => void }
const KNOBS: Knob[] = []
export const daylight = { hour: 19, rain: 0, lights: 0.55 }

/** A material property that sits at `day` in daylight and `night` after dark (e.g. a window's glow). */
export function onDayNight<T extends object>(target: T, prop: keyof T & string, day: number, night: number) {
  KNOBS.push({ apply: (l) => void ((target as Record<string, number>)[prop] = day + (night - day) * l) })
}
/** A colour that scales between `day` and `night` brightness (for MeshBasic materials, which ignore light). */
export function onDayNightColour(colour: THREE.Color, day: number, night: number) {
  const base = colour.clone()
  KNOBS.push({ apply: (l) => void colour.copy(base).multiplyScalar(day + (night - day) * l) })
}
/** A material property that changes when it's raining (e.g. a road's roughness). */
export function onWet<T extends object>(target: T, prop: keyof T & string, dry: number, wet: number) {
  KNOBS.push({ apply: (_, w) => void ((target as Record<string, number>)[prop] = dry + (wet - dry) * w) })
}

/** Called once a frame by <Atmosphere />. */
export function applyDaylight(lights: number, wet: number) {
  daylight.lights = lights
  for (const k of KNOBS) k.apply(lights, wet)
}

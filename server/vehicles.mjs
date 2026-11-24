// Cars. The SERVER owns them: it runs the physics, stops them at walls and decides who may drive.
// A client only ever says "enter", "exit" and "I am holding throttle/steer/handbrake".
//
// Heading convention (same as the player's rotation.y): forward = (sin h, cos h).
// Steering: +1 is right, which turns the heading DOWN (h decreases).
import { blocked } from './colliders.mjs'
import { inBounds } from './districts.mjs'

export const CAR = {
  length: 4.2,
  wheelbase: 2.6,
  half: 1.2, // the two collision circles sit this far ahead of and behind the centre
  radius: 1.0,
  accel: 7, // m/s^2
  brake: 16,
  handbrake: 12,
  drag: 2.2, // rolling resistance when you lift off
  maxForward: 18, // ~40 mph
  maxReverse: 5,
  steerAngle: 0.62, // radians at a standstill, reduced with speed
  enterRange: 3.5,
  exitMaxSpeed: 3, // you can only get out when nearly stopped
  carjackMaxSpeed: 3.5, // a traffic car going slower than this (~8 mph) can be carjacked
  inputTimeoutMs: 600,
}

const COLOURS = ['#8F2D2D', '#2D4F8F', '#D9D4C7', '#3A3F4A', '#4F7A4B', '#B8862F']

// Where cars are parked at the start (each anchor is nudged to the nearest free spot).
const ANCHORS = [
  { x: 128, z: 52, h: Math.PI / 2 },
  { x: 118, z: 46, h: 0 },
  { x: 103, z: 86, h: Math.PI },
  { x: 150, z: 58, h: Math.PI / 2 },
  { x: 190, z: 70, h: 0 },
  { x: 138, z: 34, h: -Math.PI / 2 },
]

export const hitsWall = (x, z, h) => {
  const fx = Math.sin(h) * CAR.half
  const fz = Math.cos(h) * CAR.half
  return (
    !inBounds({ x, z }) ||
    blocked(x + fx, z + fz, CAR.radius) ||
    blocked(x - fx, z - fz, CAR.radius) ||
    blocked(x, z, CAR.radius)
  )
}

function freeSpot(anchor) {
  for (let r = 0; r <= 30; r += 1) {
    const steps = Math.max(1, r * 8)
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2
      const x = anchor.x + Math.cos(a) * r
      const z = anchor.z + Math.sin(a) * r
      if (!hitsWall(x, z, anchor.h)) return { x, z, h: anchor.h }
    }
  }
  return null
}

// Cars 2, 4 and 5 belong to other people: taking one is a crime. The rest are loaners (free to use).
const OWNED = new Set(['car2', 'car4', 'car5'])

export const VEHICLES = []
ANCHORS.forEach((anchor, i) => {
  const spot = freeSpot(anchor)
  if (!spot) return
  VEHICLES.push({
    id: `car${i + 1}`,
    colour: COLOURS[i % COLOURS.length],
    owned: OWNED.has(`car${i + 1}`),
    police: false,
    ai: false,
    x: spot.x, z: spot.z, h: spot.h,
    home: { ...spot },
    speed: 0,
    steer: 0,
    driver: null, // player id
    input: { throttle: 0, steer: 0, brake: false, at: 0 },
  })
})

export const vehicleById = (id) => VEHICLES.find((v) => v.id === id) ?? null

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/** Records what the driver is holding. Values are clamped, so a client can't ask for more than 1. */
export function setInput(vehicle, msg, now) {
  vehicle.input = {
    throttle: clamp(Number.isFinite(msg.throttle) ? msg.throttle : 0, -1, 1),
    steer: clamp(Number.isFinite(msg.steer) ? msg.steer : 0, -1, 1),
    brake: Boolean(msg.brake),
    at: now,
  }
}

// ---- Damage (v43, C7) ----
// Every vehicle has health 0..100. Hitting a wall or another vehicle above ~3 m/s (7 mph) costs health
// in proportion to the impact; a big one (over ~8 m/s) also spins the car for half a second. Below 60 the
// engine is tired (less power); below 30 it's limping; at 0 it's a wreck: the engine is dead.
/** Car-on-car crashes since the last tick: { a, b, impact } (index.mjs judges them). */
export const CRASHES = []
export const DAMAGE = { minImpact: 3, perMs: 4.5, spinFrom: 8, spinMs: 550, policeTough: 0.6 }

function damage(v, impact, now) {
  if (impact < DAMAGE.minImpact || v.wrecked) return 0
  const hit = (impact - DAMAGE.minImpact) * DAMAGE.perMs * (v.police ? DAMAGE.policeTough : 1)
  v.health = Math.max(0, (v.health ?? 100) - hit)
  v.hitAt = now
  v.lastImpact = impact // the driver feels it too (v49: index.mjs hurts a player at the wheel)
  if (impact > DAMAGE.spinFrom) {
    v.spinUntil = now + DAMAGE.spinMs
    v.spinDir = Math.random() < 0.5 ? -1 : 1
  }
  if (v.health <= 0) {
    v.wrecked = true
    v.wreckedAt = now
  }
  return hit
}

/** How much of the engine is left: full power above 60 health, less below, nothing once wrecked. */
const enginePower = (v) => (v.wrecked ? 0 : (v.health ?? 100) >= 60 ? 1 : (v.health ?? 100) >= 30 ? 0.8 : 0.55)

/** Advances one car by dt seconds. */
export function stepVehicle(v, dt, now, others) {
  const live = (v.driver || v.ai) && now - v.input.at < CAR.inputTimeoutMs
  let input = live ? v.input : { throttle: 0, steer: 0, brake: false }
  const power = enginePower(v)
  if (power === 0) input = { throttle: 0, steer: input.steer, brake: true } // a wreck: dead engine, it just rolls to a stop
  const spinning = now < (v.spinUntil ?? 0)
  if (spinning) input = { ...input, steer: 0 } // knocked sideways: the steering does nothing for a moment

  v.steer += (input.steer - v.steer) * Math.min(1, dt * 8)
  const top = (v.topSpeed ?? CAR.maxForward) * (power === 1 ? 1 : power === 0.8 ? 0.85 : 0.6)

  // Longitudinal: engine, brakes, handbrake and rolling drag
  let a = 0
  if (input.throttle > 0) a = v.speed < -0.3 ? CAR.brake : CAR.accel * power * input.throttle * Math.max(0, 1 - Math.max(0, v.speed) / top)
  else if (input.throttle < 0) a = v.speed > 0.3 ? -CAR.brake : -CAR.accel * power * 0.6 * -input.throttle * (1 - Math.max(0, -v.speed) / CAR.maxReverse)
  else a = -Math.sign(v.speed) * CAR.drag
  if (input.brake) a += -Math.sign(v.speed) * CAR.handbrake

  const before = v.speed
  v.speed = clamp(v.speed + a * dt, -CAR.maxReverse, Math.max(top, v.speed)) // a damaged car slows down to its new top speed
  // Drag and brakes bring you TO a stop, they never push you backwards
  if (input.throttle === 0 && Math.sign(before) !== Math.sign(v.speed) && before !== 0) v.speed = 0
  if (input.brake && input.throttle === 0 && Math.abs(v.speed) < 0.3) v.speed = 0

  // Steering gets lighter the faster you go
  const angle = input.steer === 0 && Math.abs(v.steer) < 0.02 ? 0 : v.steer * (CAR.steerAngle / (1 + Math.abs(v.speed) / 9))
  let dh = -(v.speed / CAR.wheelbase) * Math.tan(angle) * dt
  if (spinning) dh += v.spinDir * 2.4 * Math.min(1, Math.abs(v.speed) / 6) * dt
  const hMid = v.h + dh / 2
  const nx = v.x + Math.sin(hMid) * v.speed * dt
  const nz = v.z + Math.cos(hMid) * v.speed * dt
  const nh = v.h + dh

  // Walls and the edge of the built city: stop dead and bounce back a little
  if (v.speed !== 0 && !v.underground && hitsWall(nx, nz, nh)) {
    damage(v, Math.abs(v.speed), now)
    v.speed = -v.speed * 0.25
    if (Math.abs(v.speed) < 0.4) v.speed = 0
    return
  }
  // Other cars: only a problem if you are driving INTO them (so an overlap can always be driven out of)
  for (const o of others) {
    if (o === v || Boolean(o.underground) !== Boolean(v.underground)) continue
    const now2 = Math.hypot(nx - o.x, nz - o.z)
    if (now2 < CAR.radius * 2.2 && now2 < Math.hypot(v.x - o.x, v.z - o.z)) {
      // Both take the knock, by how fast they were closing on each other
      const rvx = Math.sin(v.h) * v.speed - Math.sin(o.h) * o.speed
      const rvz = Math.cos(v.h) * v.speed - Math.cos(o.h) * o.speed
      const impact = Math.hypot(rvx, rvz)
      // one crash, counted once (each car's own step sees it, and it can last a few frames)
      if (!(v.bumpWith === o.id && now - v.bumpAt < 600)) {
        damage(v, impact, now)
        damage(o, impact, now)
        if (impact > 5) CRASHES.push({ a: v, b: o, impact }) // for the police: ramming is a crime (v44)
        v.bumpWith = o.id
        o.bumpWith = v.id
        v.bumpAt = o.bumpAt = now
      }
      v.speed = -v.speed * 0.2
      return
    }
  }
  v.x = nx
  v.z = nz
  v.h = nh
}

/** Can this player get in? Returns an error text, or null if fine. */
export function cannotEnter(player, vehicle) {
  if (!vehicle) return 'No such car'
  if (player.vehicleId) return 'You are already driving'
  if (vehicle.police) return 'That is a police car'
  // A traffic car can be taken if it's stopped or crawling: the driver gets dragged out (v43)
  if (vehicle.traffic && Math.abs(vehicle.speed) > CAR.carjackMaxSpeed) return 'Too fast: wait till it stops'
  if (vehicle.driver) return 'Someone is already driving that'
  if (Math.hypot(player.x - vehicle.x, player.z - vehicle.z) > CAR.enterRange) return 'Too far from the car'
  return null
}

/** Finds a free spot beside the car for the driver to step out. Null if there is no room. */
export function exitSpot(v) {
  const side = [Math.cos(v.h), -Math.sin(v.h)] // left
  const back = [-Math.sin(v.h), -Math.cos(v.h)]
  const tries = [
    [side[0] * 2.3, side[1] * 2.3],
    [-side[0] * 2.3, -side[1] * 2.3],
    [back[0] * 3.6, back[1] * 3.6],
    [-back[0] * 3.6, -back[1] * 3.6],
  ]
  for (const [dx, dz] of tries) {
    const x = v.x + dx
    const z = v.z + dz
    if (inBounds({ x, z }) && !blocked(x, z, 0.65)) return { x, z }
  }
  return null
}

export const vehicleSnapshot = (v) => ({
  id: v.id,
  c: v.colour,
  x: Math.round(v.x * 100) / 100,
  z: Math.round(v.z * 100) / 100,
  h: Math.round(v.h * 1000) / 1000,
  v: Math.round(v.speed * 100) / 100,
  s: Math.round(v.steer * 100) / 100,
  d: v.driver,
  o: v.owned ? 1 : 0,
  p: v.police ? 1 : 0,
  t: v.traffic ? 1 : 0,
  k: v.kind ?? 'car', // car | van | taxi (v43)
  hp: Math.round(v.health ?? 100), // 0..100 (v43, C7); 0 = wrecked
})

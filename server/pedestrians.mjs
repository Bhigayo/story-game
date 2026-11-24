// People on the pavements (v42). Server-side, like the traffic, so every player sees the same people,
// cars can stop for them, and hitting one has consequences.
//
// A pedestrian walks along one side of a road (the pavement is `w / 2 + 1` m from the centreline, where the
// client draws it). At the end of the road they pick another road at that junction and carry on round the
// same corner, or sometimes cross it: at traffic lights they wait for the road they're crossing to be on red
// (the green man), elsewhere for a gap in the traffic. A car coming at them makes them jump clear; a car
// that hits them knocks them down for a while, and if a player was driving, `onHit` reports it.
import { ROAD_NODES, nearestNode } from './roads.mjs'
import { NODE_JUNCTION, lightFor } from './signals.mjs'

export const PEDS = {
  perPlayer: 28, // people around each player
  spawnMin: 45, // spawned this far from every player at least (not popping in under your nose)...
  spawnMax: 150, // ...and within this of someone
  dropAt: 190, // removed once nobody is this close
  walk: [1.15, 1.6], // m/s
  crossChance: 0.3, // at a junction: cross the next road rather than turn the corner
  maxWaitMs: 30000, // give up waiting to cross after this long
  downMs: 14000, // lying on the ground after being hit
}

const NO_PAVEMENT = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'tunnel'])
export const PEOPLE = []
let nextId = 1

// Undirected neighbours, with the road's width, for walking (people ignore one-way streets)
const ADJ = ROAD_NODES.map(() => [])
ROAD_NODES.forEach((n, a) => {
  for (const e of n.out) {
    if (NO_PAVEMENT.has(e.kind)) continue
    if (!ADJ[a].some((x) => x.to === e.to)) ADJ[a].push({ to: e.to, w: e.w ?? 6, len: e.len })
    if (!ADJ[e.to].some((x) => x.to === a)) ADJ[e.to].push({ to: a, w: e.w ?? 6, len: e.len })
  }
})
const edgeW = (a, b) => ADJ[a].find((x) => x.to === b)?.w ?? 6

const rand = (lo, hi) => lo + Math.random() * (hi - lo)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/** A point on the pavement: `t` metres along the road a -> b, on `side` (+1 = left of a -> b). */
function pavement(a, b, t, side) {
  const A = ROAD_NODES[a]
  const B = ROAD_NODES[b]
  const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
  const dx = (B.x - A.x) / len
  const dz = (B.z - A.z) / len
  const off = edgeW(a, b) / 2 + 1
  // left of travel is (dz, -dx)
  return { x: A.x + dx * t + dz * off * side, z: A.z + dz * t - dx * off * side, len }
}

function spawnNear(p, players) {
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.floor(Math.random() * ROAD_NODES.length)
    if (!ADJ[a].length) continue
    const n = ROAD_NODES[a]
    const d = Math.hypot(n.x - p.x, n.z - p.z)
    if (d > PEDS.spawnMax || d < PEDS.spawnMin) continue
    if (players.some((q) => Math.hypot(n.x - q.x, n.z - q.z) < PEDS.spawnMin)) continue
    const next = ADJ[a][Math.floor(Math.random() * ADJ[a].length)]
    const side = Math.random() < 0.5 ? 1 : -1
    const t = rand(0, next.len)
    const at = pavement(a, next.to, t, side)
    PEOPLE.push({
      id: `p${nextId++}`,
      look: Math.floor(Math.random() * 6),
      speed: rand(...PEDS.walk),
      reaction: rand(200, 700), // ms before they notice a car coming at them
      a, b: next.to, t, side, // where they are on the network
      x: at.x, z: at.z, h: 0,
      state: 'walk', // walk | toCross | wait | cross | flee | down | rejoin
      since: Date.now(),
    })
    return true
  }
  return false
}

/** Arrived at node `b` of a -> b: choose the next road, and whether to cross it. */
function atJunction(u, now) {
  const here = u.b
  const options = ADJ[here].filter((x) => x.to !== u.a)
  const next = options.length ? options[Math.floor(Math.random() * options.length)] : ADJ[here].find((x) => x.to === u.a)
  if (!next) {
    u.state = 'down' // stranded on a lone node: lie low, then get removed
    u.since = now
    return
  }
  // Which side of the new road keeps them on the same corner?
  const here2 = { x: u.x, z: u.z }
  const left = pavement(here, next.to, 0, 1)
  const right = pavement(here, next.to, 0, -1)
  const sameSide = Math.hypot(left.x - here2.x, left.z - here2.z) < Math.hypot(right.x - here2.x, right.z - here2.z) ? 1 : -1
  u.a = here
  u.b = next.to
  u.t = 0
  u.side = sameSide
  const j = NODE_JUNCTION.get(here)
  const wide = next.w >= 4.5
  if (wide && next.len > 14 && Math.random() < PEDS.crossChance) {
    // Cross the new road a few metres from the junction (outside the box, inside the stop line)
    u.crossAt = Math.min(next.len * 0.4, j ? Math.max(4, j.r - 1) : 5)
    u.state = 'toCross'
    u.since = now
  }
}

/** Is it safe to step out across a -> b at `u.crossAt`? */
function safeToCross(u, cars, now) {
  const j = NODE_JUNCTION.get(u.a)
  if (j?.lit) {
    // The green man: the road being crossed has a red light
    const A = ROAD_NODES[u.a]
    const B = ROAD_NODES[u.b]
    const bearing = Math.atan2(B.x - A.x, B.z - A.z)
    const d = Math.abs(wrap(bearing - j.axis))
    const phase = d < Math.PI / 4 || d > (3 * Math.PI) / 4 ? 'A' : 'B'
    if (lightFor(j, phase, now) !== 'red') return false
  }
  // And look both ways anyway: nothing moving close to where they'll cross
  const mid = pavement(u.a, u.b, u.crossAt, 0)
  for (const c of cars) {
    const d = Math.hypot(c.x - mid.x, c.z - mid.z)
    if (d < 7) return false
    if (Math.abs(c.speed) > 1 && d < (j?.lit ? 14 : 30)) {
      // heading towards the crossing?
      const toX = mid.x - c.x
      const toZ = mid.z - c.z
      if ((Math.sin(c.h) * toX + Math.cos(c.h) * toZ) / d > 0.5) return false
    }
  }
  return true
}

const moveTo = (u, tx, tz, speed, dt) => {
  const dx = tx - u.x
  const dz = tz - u.z
  const d = Math.hypot(dx, dz)
  if (d < 0.05) return true
  const step = Math.min(d, speed * dt)
  u.x += (dx / d) * step
  u.z += (dz / d) * step
  u.h = Math.atan2(dx, dz)
  return step >= d - 1e-6
}

/** A car about to run them over: jump clear, sideways from its path. Knocked down if it's too late. */
function dodge(u, cars, now, onHit) {
  for (const c of cars) {
    const dx = u.x - c.x
    const dz = u.z - c.z
    const d = Math.hypot(dx, dz)
    if (d > 14) continue
    const speed = Math.abs(c.speed)
    const fx = Math.sin(c.h) * Math.sign(c.speed || 1)
    const fz = Math.cos(c.h) * Math.sign(c.speed || 1)
    const along = dx * fx + dz * fz
    const across = dx * fz - dz * fx // + = to the car's left
    // Hit: inside the car's footprint while it's moving
    if (speed > 4.5 && Math.abs(along) < 2.4 && Math.abs(across) < 1.25) {
      u.state = 'down'
      u.since = now
      u.h = Math.atan2(fx, fz)
      // thrown a little forward and aside
      u.x += fx * Math.min(4, speed * 0.25) + fz * Math.sign(across || 1) * 0.6
      u.z += fz * Math.min(4, speed * 0.25) - fx * Math.sign(across || 1) * 0.6
      onHit?.(c, u, speed)
      return
    }
    // About to be hit: jump out of the way, once they've noticed (people react late: 0.2 to 0.7 s)
    if (speed > 2.5 && along > 0 && along < 2 + speed * 0.7 && Math.abs(across) < 2.2 && u.state !== 'flee') {
      if (!u.spotted || now - u.spotted > 2000) u.spotted = now
      if (now - u.spotted < u.reaction) continue
      const away = across >= 0 ? 1 : -1
      u.fleeX = u.x + fz * away * 3.2
      u.fleeZ = u.z - fx * away * 3.2
      u.state = 'flee'
      u.since = now
      u.spotted = 0
      return
    }
  }
}

/** One step for everyone. `cars` is every vehicle; `onHit(car, person, speed)` when one is knocked down. */
export function tickPedestrians({ players, cars, now, dt, onHit }) {
  const live = players.filter((p) => !p.travel)
  // Leave the empty parts of the map
  for (let i = PEOPLE.length - 1; i >= 0; i--) {
    const u = PEOPLE[i]
    const near = live.some((p) => Math.hypot(p.x - u.x, p.z - u.z) < PEDS.dropAt)
    if (!near || (u.state === 'down' && !ADJ[u.b]?.length)) PEOPLE.splice(i, 1)
  }
  // Fill the streets round each player (a couple a tick, so they don't all appear at once)
  let made = 0
  for (const p of live) {
    const around = PEOPLE.filter((u) => Math.hypot(u.x - p.x, u.z - p.z) < PEDS.spawnMax).length
    if (around < PEDS.perPlayer && made < 3 && spawnNear(p, live)) made++
  }

  for (const u of PEOPLE) {
    const nearCars = cars.filter((c) => Math.abs(c.x - u.x) < 40 && Math.abs(c.z - u.z) < 40 && !c.underground)
    if (u.state !== 'down') dodge(u, nearCars, now, onHit)

    switch (u.state) {
      case 'down':
        if (now - u.since > PEDS.downMs) {
          u.state = 'rejoin'
          u.since = now
        }
        break
      case 'flee':
        if (moveTo(u, u.fleeX, u.fleeZ, 4.2, dt) || now - u.since > (u.fleeMs ?? 1500)) {
          u.state = 'rejoin'
          u.since = now
        }
        break
      case 'rejoin': {
        // back to the pavement where they were (a little shaken: slower)
        const back = pavement(u.a, u.b, u.t, u.side)
        if (moveTo(u, back.x, back.z, u.speed * 0.8, dt)) u.state = 'walk'
        break
      }
      case 'toCross': {
        const kerb = pavement(u.a, u.b, u.crossAt, u.side)
        if (moveTo(u, kerb.x, kerb.z, u.speed, dt)) {
          u.state = 'wait'
          u.since = now
          // face the road
          const far = pavement(u.a, u.b, u.crossAt, -u.side)
          u.h = Math.atan2(far.x - u.x, far.z - u.z)
        }
        break
      }
      case 'wait':
        if (safeToCross(u, nearCars, now)) {
          u.state = 'cross'
          u.since = now
        } else if (now - u.since > PEDS.maxWaitMs) {
          u.t = u.crossAt
          u.state = 'walk' // fed up: carry on along this side instead
        }
        break
      case 'cross': {
        const far = pavement(u.a, u.b, u.crossAt, -u.side)
        if (moveTo(u, far.x, far.z, u.speed * 1.25, dt)) {
          u.side = -u.side
          u.t = u.crossAt
          u.state = 'walk'
        }
        break
      }
      default: {
        // walk along the pavement towards b
        const len = pavement(u.a, u.b, 0, u.side).len
        u.t = Math.min(len, u.t + u.speed * dt)
        const at = pavement(u.a, u.b, u.t, u.side)
        moveTo(u, at.x, at.z, u.speed * 3, dt)
        if (u.t >= len - 0.01) atJunction(u, now)
      }
    }
  }
}

/** Someone dragged out of their car (v43): they run off, then go back to walking the pavements. */
export function addFleeing(x, z, awayX, awayZ, now = Date.now()) {
  let a = nearestNode(x, z, 80)
  if (a < 0 || !ADJ[a]?.length) a = ADJ.findIndex((n, i) => n.length && Math.hypot(ROAD_NODES[i].x - x, ROAD_NODES[i].z - z) < 200)
  if (a < 0) return null
  const next = ADJ[a][0]
  const u = {
    id: `p${nextId++}`,
    look: Math.floor(Math.random() * 6),
    speed: rand(...PEDS.walk),
    reaction: rand(200, 700),
    a, b: next.to, t: 0, side: Math.random() < 0.5 ? 1 : -1,
    x, z, h: Math.atan2(awayX - x, awayZ - z),
    state: 'flee', fleeX: awayX, fleeZ: awayZ,
    since: now,
  }
  PEOPLE.push(u)
  return u
}

const STATE_CODE = { walk: 0, toCross: 0, rejoin: 0, wait: 1, cross: 2, flee: 3, down: 4 }

/** Compact form for the network: [id, x, z, heading, state (0 walk, 1 wait, 2 cross, 3 run, 4 down), look]. */
export const pedSnapshot = (u) => [u.id, Math.round(u.x * 10) / 10, Math.round(u.z * 10) / 10, Math.round(u.h * 100) / 100, STATE_CODE[u.state] ?? 0, u.look]

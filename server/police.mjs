// Heat and the police. Everything here is decided by the server.
//
// Heat is a number from 0 to 100 per player. Crimes add to it (see addHeat). Stars are just heat
// in bands: 1 star from 10, 2 from 30, 3 from 50, 4 from 70, 5 from 90.
// While you are wanted the server keeps police cars on your tail. They are ordinary cars (same
// physics, same walls) driven by a small AI. To lose them: get 100 m away and stay out of reach
// for a while, and your heat drains. If they catch you stopped, you are busted: fined and released.
import { VEHICLES, hitsWall, setInput } from './vehicles.mjs'
import { blocked } from './colliders.mjs'
import { ROAD_NODES, nearestNode, route } from './roads.mjs'

export const HEAT = {
  max: 100,
  bands: [10, 30, 50, 70, 90],
  theft: 25,
  carjack: 35, // dragging a driver out of their car (v43): two stars
  hitPedestrian: 22, // knocking someone down (v42): one star on its own...
  hitPedestrianFast: 40, // ...two if you were going properly fast
  // v44 (C8): crimes the police have to SEE (a patrol or a pursuing car within `witnessRange`)...
  redLight: 12, // through a red light, in front of them: one star
  speeding: 10, // flat out (over ~34 mph) right past them
  ramCar: 10, // ramming someone's car
  // ...and ones that always count
  ramPolice: 30, // ramming a police car
  hitOfficer: 30, // running an officer down
  witnessRange: 70,
  seenRange: 100, // a police car this close can see you
  searchAfterMs: 15000, // out of sight this long and the heat starts draining
  drainPerSecond: 6,
  units: [0, 1, 2, 3, 3, 4], // how many cars at each star level
  spawnMin: 50,
  spawnMax: 90,
  despawnRange: 240, // a car left this far behind is dropped (and replaced closer if you are still wanted)
  topSpeed: 17, // a touch slower than you, so a clean getaway is possible
  arrestOnFoot: { range: 1.6, ms: 1000 }, // an officer's hand on your shoulder for a second (v44)
  arrestInCar: { range: 16, ms: 1800, speed: 4 }, // cars box you in rather than touching you
  fine: 5000, // pence
  officerSpeed: 4.7, // m/s: you run at 5, so you can just outrun them
  deployRange: 24, // a police car this close to you on foot pulls up and the officers get out
  officerLeash: 80, // an officer this far from their car gives up and goes back
}

// ---- Officers on foot (v44, C8) ----
export const OFFICERS = []
let nextOfficer = 1

/** Is a police car or officer close enough to see (x, z)? Patrols count: they're the witnesses. */
export function policeSee(x, z, range = HEAT.witnessRange) {
  return VEHICLES.some((v) => v.police && !v.wrecked && Math.hypot(v.x - x, v.z - z) < range) || OFFICERS.some((o) => o.state !== 'down' && Math.hypot(o.x - x, o.z - z) < range * 0.6)
}

/** Steps a person toward (tx, tz), sliding along walls rather than walking through them. */
function stepToward(o, tx, tz, speed, dt) {
  const dx = tx - o.x
  const dz = tz - o.z
  const d = Math.hypot(dx, dz)
  if (d < 0.05) return true
  const s = Math.min(d, speed * dt)
  const nx = o.x + (dx / d) * s
  const nz = o.z + (dz / d) * s
  o.h = Math.atan2(dx, dz)
  if (!blocked(nx, nz, 0.4)) {
    o.x = nx
    o.z = nz
  } else if (!blocked(nx, o.z, 0.4)) o.x = nx
  else if (!blocked(o.x, nz, 0.4)) o.z = nz
  return s >= d - 1e-6
}

function deploy(u, now) {
  const crew = u.crew ?? 1
  const right = [-Math.cos(u.h), Math.sin(u.h)]
  for (let k = 0; k < crew; k++) {
    const side = k === 0 ? 1 : -1 // driver's side first, then the passenger
    OFFICERS.push({
      id: `off${nextOfficer++}`,
      unit: u.id,
      target: u.target,
      x: u.x + right[0] * 1.6 * side,
      z: u.z + right[1] * 1.6 * side,
      h: u.h,
      state: 'chase', // chase | return | down
      since: now,
    })
  }
  u.crewOut = crew
}

/** Officers chase their target, go back to the car when it's pointless, and can be run down. */
function tickOfficers(players, now, dt, onHitOfficer) {
  const byId = new Map(players.map((p) => [p.id, p]))
  for (let i = OFFICERS.length - 1; i >= 0; i--) {
    const o = OFFICERS[i]
    const car = VEHICLES.find((v) => v.id === o.unit && !v.wrecked)
    const p = byId.get(o.target)

    // A car going at them
    if (o.state !== 'down') {
      for (const v of VEHICLES) {
        if (v === car || Math.abs(v.speed) < 4.5 || Math.hypot(v.x - o.x, v.z - o.z) > 1.8) continue
        o.state = 'down'
        o.since = now
        if (v.driver) onHitOfficer?.(v.driver)
        break
      }
    }

    if (o.state === 'down') {
      if (now - o.since > 7000) o.state = 'return'
    } else if (o.state === 'chase') {
      const giveUp = !p || !(p.heat > 0) || p.vehicleId || !car || Math.hypot(o.x - car.x, o.z - car.z) > HEAT.officerLeash
      if (giveUp) o.state = 'return'
      else stepToward(o, p.x, p.z, HEAT.officerSpeed, dt)
    }
    if (o.state === 'return') {
      if (!car) {
        if (now - o.since > 20000 || !players.some((q) => Math.hypot(q.x - o.x, q.z - o.z) < 200)) OFFICERS.splice(i, 1)
        continue
      }
      if (stepToward(o, car.x, car.z, HEAT.officerSpeed * 0.8, dt) || Math.hypot(o.x - car.x, o.z - car.z) < 2) {
        OFFICERS.splice(i, 1) // back in the car
        car.crewOut = Math.max(0, (car.crewOut ?? 1) - 1)
      }
    }
  }
}

/** Someone's officers, nearest first. */
const officersOf = (player) => OFFICERS.filter((o) => o.target === player.id && o.state === 'chase')

/** For the network: [id, x, z, heading, state (3 running, 0 walking back, 4 down), look 100 = police]. */
export const officerSnapshot = (o) => [o.id, Math.round(o.x * 10) / 10, Math.round(o.z * 10) / 10, Math.round(o.h * 100) / 100, o.state === 'down' ? 4 : o.state === 'chase' ? 3 : 0, 100]

export const levelOf = (heat) => HEAT.bands.filter((b) => heat >= b).length

let nextUnit = 1
const rand = (a, b) => a + Math.random() * (b - a)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/** Adds heat for a crime. Returns the new star level. */
export function addHeat(player, points, now = Date.now()) {
  player.heat = clamp((player.heat ?? 0) + points, 0, HEAT.max)
  player.heatSeenAt = now // a fresh crime is a fresh sighting
  player.lastKnown = { x: player.x, z: player.z }
  return levelOf(player.heat)
}

const unitsOf = (player) => VEHICLES.filter((v) => v.police && !v.wrecked && v.target === player.id) // a wrecked unit gets replaced

export function removeUnits(player) {
  for (let i = VEHICLES.length - 1; i >= 0; i--) {
    if (VEHICLES[i].police && VEHICLES[i].target === player.id) VEHICLES.splice(i, 1)
  }
  for (let i = OFFICERS.length - 1; i >= 0; i--) if (OFFICERS[i].target === player.id) OFFICERS.splice(i, 1)
}

/** A patrol car near the chase joins it, rather than a new car appearing (v44). */
function recruitPatrol(player, centre) {
  const patrol = VEHICLES.filter((v) => v.police && v.traffic && !v.wrecked && Math.hypot(v.x - centre.x, v.z - centre.z) < 160).sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z))[0]
  if (!patrol) return false
  patrol.traffic = false
  patrol.ai = true
  patrol.target = player.id
  patrol.topSpeed = HEAT.topSpeed
  patrol.crew = levelOf(player.heat ?? 0) >= 3 ? 2 : 1
  patrol.mind = { lastX: patrol.x, lastZ: patrol.z, lastCheck: Date.now(), reverseUntil: 0, reverseSteer: 1, stuckSince: 0 }
  delete patrol.drive
  return true
}

/** True if a car could drive straight from A to B without touching a building. */
function clearLine(ax, az, bx, bz, h) {
  const d = Math.hypot(bx - ax, bz - az)
  for (let t = 4; t < d - 6; t += 4) {
    if (hitsWall(ax + ((bx - ax) * t) / d, az + ((bz - az) * t) / d, h)) return false
  }
  return true
}

/** A free spot about 90 to 130 m from a point, facing it. */
function spawnSpot(centre) {
  // Preferred: on a road, 50 to 110 m away, in the same road network as the target
  const goalNode = nearestNode(centre.x, centre.z, 120)
  if (goalNode >= 0) {
    const piece = ROAD_NODES[goalNode].piece
    const candidates = []
    for (let i = 0; i < ROAD_NODES.length; i++) {
      const n = ROAD_NODES[i]
      if (n.piece !== piece || !n.out.length) continue
      const d = Math.hypot(n.x - centre.x, n.z - centre.z)
      if (d >= HEAT.spawnMin && d <= HEAT.spawnMax) candidates.push(i)
    }
    for (let tries = 0; tries < 20 && candidates.length; tries++) {
      const n = ROAD_NODES[candidates[Math.floor(Math.random() * candidates.length)]]
      const next = ROAD_NODES[n.out[0].to]
      const h = Math.atan2(next.x - n.x, next.z - n.z)
      if (!hitsWall(n.x, n.z, h) && !VEHICLES.some((o) => Math.hypot(o.x - n.x, o.z - n.z) < 4)) return { x: n.x, z: n.z, h }
    }
  }
  for (let tries = 0; tries < 60; tries++) {
    const a = Math.random() * Math.PI * 2
    const r = rand(HEAT.spawnMin, HEAT.spawnMax)
    const x = centre.x + Math.cos(a) * r
    const z = centre.z + Math.sin(a) * r
    const h = Math.atan2(centre.x - x, centre.z - z)
    if (hitsWall(x, z, h) || VEHICLES.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) continue
    if (clearLine(x, z, centre.x, centre.z, h)) return { x, z, h }
  }
  return null
}

function spawnUnit(player, centre) {
  const spot = spawnSpot(centre)
  if (!spot) return
  VEHICLES.push({
    id: `pol${nextUnit++}`,
    colour: '#E8EAF0',
    owned: false,
    police: true,
    ai: true,
    target: player.id,
    topSpeed: HEAT.topSpeed,
    crew: levelOf(player.heat ?? 0) >= 3 ? 2 : 1, // officers in the car (v44)
    x: spot.x, z: spot.z, h: spot.h,
    speed: 0,
    steer: 0,
    driver: null,
    input: { throttle: 0, steer: 0, brake: false, at: 0 },
    mind: { lastX: spot.x, lastZ: spot.z, lastCheck: Date.now(), reverseUntil: 0, reverseSteer: 1, stuckSince: 0 },
  })
}

/** What the AI "presses" this moment: head for the target, feel for walls, back out when stuck. */
function think(u, tx, tz, now, onFoot) {
  const m = u.mind
  // Officers are out (v44): the car waits, parked
  if (u.crewOut > 0) return { throttle: 0, steer: 0, brake: true }
  // Closing on someone on foot: pull up nearby so the officers can get out
  if (onFoot && Math.hypot(tx - u.x, tz - u.z) < 14) return { throttle: 0, steer: 0, brake: true }
  // No clear straight run to the target: follow the roads instead
  if (Math.hypot(tx - u.x, tz - u.z) > 18 && !clearLine(u.x, u.z, tx, tz, u.h)) {
    if (!m.path || now - m.pathAt > 2000) {
      m.pathAt = now
      m.path = route(nearestNode(u.x, u.z, 40), nearestNode(tx, tz, 60)) ?? null
      m.pathIdx = 0
    }
    if (m.path) {
      while (m.pathIdx < m.path.length - 1 && Math.hypot(ROAD_NODES[m.path[m.pathIdx]].x - u.x, ROAD_NODES[m.path[m.pathIdx]].z - u.z) < 7) m.pathIdx++
      const wp = ROAD_NODES[m.path[Math.min(m.pathIdx + 1, m.path.length - 1)]]
      tx = wp.x
      tz = wp.z
    }
  } else m.path = null
  const dx = tx - u.x
  const dz = tz - u.z
  const dist = Math.hypot(dx, dz)
  const diff = wrap(Math.atan2(dx, dz) - u.h) // positive = target is to the left

  // Stuck? (barely moved in 1.5 s while still far away) then reverse out, turning
  if (now - m.lastCheck > 1500) {
    if (Math.hypot(u.x - m.lastX, u.z - m.lastZ) < 1.2 && dist > 6 && now > m.reverseUntil) {
      m.reverseUntil = now + 1100
      m.reverseSteer = Math.random() < 0.5 ? -1 : 1
    }
    m.lastX = u.x
    m.lastZ = u.z
    m.lastCheck = now
  }
  if (now < m.reverseUntil) return { throttle: -1, steer: m.reverseSteer, brake: false }

  const probe = (a) => hitsWall(u.x + Math.sin(u.h + a) * 9, u.z + Math.cos(u.h + a) * 9, u.h + a)
  const ahead = probe(0)
  const left = probe(0.6)
  const right = probe(-0.6)

  let steer = -clamp(diff * 1.6, -1, 1) // steering is +1 = right, which turns the heading down
  let throttle = 1
  if (ahead) {
    throttle = 0.35
    if (!left) steer = -1
    else if (!right) steer = 1
    else {
      m.reverseUntil = now + 900
      m.reverseSteer = diff > 0 ? 1 : -1
    }
  } else {
    if (left && steer < 0) steer = 0
    if (right && steer > 0) steer = 0
    if (Math.abs(diff) > 1 && u.speed > 8) throttle = 0.4
  }
  return { throttle, steer, brake: false }
}

/**
 * Runs the police once per server tick (about 10 times a second).
 * ctx: { players, now, dt, onBusted }
 *
 * Seen: one of your police cars is within 100 m. While seen, they know exactly where you are.
 * Not seen: they head for the last place they saw you, and after 12 s they give up and leave.
 * Their reinforcements arrive around that last-known spot, so teleporting or driving off really loses them.
 */
export function tickPolice(ctx) {
  const { players, now, dt } = ctx
  tickOfficers(players, now, dt, ctx.onHitOfficer)
  for (const p of players) {
    const heat = p.heat ?? 0

    if (heat <= 0) {
      if (p.wantedLevel) {
        p.wantedLevel = 0
        p.wantedSearching = false
        p.send?.({ t: 'wanted', level: 0, searching: false })
      }
      removeUnits(p)
      continue
    }

    // Can they see you?
    p.lastKnown ??= { x: p.x, z: p.z }
    let units = unitsOf(p)
    const seen = units.some((u) => Math.hypot(u.x - p.x, u.z - p.z) <= HEAT.seenRange)
    if (seen) {
      p.heatSeenAt = now
      p.lastKnown = { x: p.x, z: p.z }
    }
    const searching = !seen && now - (p.heatSeenAt ?? now) > HEAT.searchAfterMs

    if (searching) {
      // They have lost you: the cars leave and your heat drains
      removeUnits(p)
      p.heat = Math.max(0, heat - HEAT.drainPerSecond * dt)
      p.arrestMs = 0
    } else {
      const level = levelOf(heat)
      const goal = p.lastKnown

      for (const u of units) {
        if (!(u.crewOut > 0) && Math.hypot(u.x - goal.x, u.z - goal.z) > HEAT.despawnRange) VEHICLES.splice(VEHICLES.indexOf(u), 1)
      }
      for (const u of unitsOf(p)) {
        // No real progress toward you for 6 s (jammed on a corner): swap for a fresh car
        const m = u.mind
        const d = Math.hypot(u.x - p.x, u.z - p.z)
        if (u.crewOut > 0) {
          m.progressAt = now // parked on purpose: the officers are out
          continue
        }
        if (!m.progressAt || d < m.bestDist - 3 || d <= HEAT.arrestInCar.range) {
          m.bestDist = d
          m.progressAt = now
        } else if (now - m.progressAt > 6000) VEHICLES.splice(VEHICLES.indexOf(u), 1)
      }
      units = unitsOf(p)
      if (units.length < HEAT.units[level] && now - (p.lastSpawn ?? 0) > 2000) {
        p.lastSpawn = now
        if (!recruitPatrol(p, goal)) spawnUnit(p, goal)
      }
      while (unitsOf(p).length > HEAT.units[level]) VEHICLES.splice(VEHICLES.indexOf(unitsOf(p).pop()), 1)

      const car = p.vehicleId ? VEHICLES.find((v) => v.id === p.vehicleId) : null
      for (const u of unitsOf(p)) {
        setInput(u, think(u, goal.x, goal.z, now, !car), now)
        // On foot and they've pulled up close: out they get (v44)
        if (!car && !(u.crewOut > 0) && Math.abs(u.speed) < 2 && Math.hypot(u.x - p.x, u.z - p.z) < HEAT.deployRange) deploy(u, now)
      }

      // Caught? On foot: an officer has to reach you. In a car: boxed in by their cars.
      const rule = car ? HEAT.arrestInCar : HEAT.arrestOnFoot
      const close = car ? unitsOf(p).some((u) => Math.hypot(u.x - p.x, u.z - p.z) <= rule.range) : officersOf(p).some((o) => Math.hypot(o.x - p.x, o.z - p.z) <= rule.range)
      const slowEnough = car ? Math.abs(car.speed) < rule.speed : true
      if (close && slowEnough) {
        p.arrestMs = (p.arrestMs ?? 0) + dt * 1000
        if (p.arrestMs >= rule.ms) {
          p.arrestMs = 0
          p.heat = 0
          removeUnits(p)
          ctx.onBusted(p)
          continue
        }
      } else {
        p.arrestMs = 0
      }
    }

    const newLevel = levelOf(p.heat)
    if (newLevel !== p.wantedLevel || searching !== p.wantedSearching) {
      p.wantedLevel = newLevel
      p.wantedSearching = searching
      p.send?.({ t: 'wanted', level: newLevel, searching })
    }
  }
}

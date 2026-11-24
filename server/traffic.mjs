// Everyday traffic: cars that drive around the streets near the players, on the left, following the
// road graph, slowing for corners and for anything in their way. They are ordinary server cars (same
// physics and walls as yours), so a player can crash into them. They can't be driven yet.
//
// Cars only exist near players: a few are kept around each player, and any car left far behind
// is removed. Nothing runs when nobody is online.
//
// v34: cars stop at red lights (and at amber when they can stop in time), and give way when they
// come out of a smaller road at a junction without lights. See signals.mjs.
import { VEHICLES, hitsWall, setInput } from './vehicles.mjs'
import { ROAD_NODES, edgeKind, nearestNode, randomNode, route } from './roads.mjs'
import { PEOPLE } from './pedestrians.mjs'
import { OFFICERS } from './police.mjs'
import { NODE_JUNCTION, SIGNAL, armFor, lightFor } from './signals.mjs'

export const TRAFFIC = {
  perPlayer: 10, // cars kept within 220 m of each player
  spawnMin: 80, // never spawn closer than this (so nobody sees a car appear)
  spawnMax: 210,
  despawnRange: 300,
  spawnEveryMs: 700,
  lookahead: 6.5, // metres: reach a node, aim for the next
  laneOffset: 1.5, // drive this far to the left of the road's centre line (two-way roads)
}

// Speed limits in m/s (13.4 is 30 mph)
const LIMIT = { tunnel: 13, bus: 6, trunk: 14, trunk_link: 9, primary: 13.4, secondary: 12, tertiary: 10.5, unclassified: 9.5, residential: 8.5, living_street: 5, service: 6 }
const VAN_COLOURS = ['#E8E6E0', '#E8E6E0', '#C9CCD1', '#2B4A7A', '#B5442E']
const COLOURS = ['#7B1E1E', '#2B4A7A', '#CFC8B8', '#35383F', '#46674A', '#9C7A2C', '#B9BCC2', '#1E1E22', '#5B3A66']

let nextId = 1
const rand = (a, b) => a + Math.random() * (b - a)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

export const trafficCars = () => VEHICLES.filter((v) => v.traffic)
/** Horns sounded since the last tick: { id, x, z } (index.mjs passes them on to nearby players). */
export const HORNS = []

function spawn(player, players) {
  const piece = (() => {
    const n = nearestNode(player.x, player.z, 150)
    return n >= 0 ? ROAD_NODES[n].piece : null
  })()
  if (piece === null) return false
  for (let tries = 0; tries < 6; tries++) {
    const id = randomNode(player.x, player.z, TRAFFIC.spawnMin, TRAFFIC.spawnMax, piece)
    if (id === null) return false
    const n = ROAD_NODES[id]
    if (players.some((p) => Math.hypot(p.x - n.x, p.z - n.z) < TRAFFIC.spawnMin)) continue
    const next = ROAD_NODES[n.out[0].to]
    const h = Math.atan2(next.x - n.x, next.z - n.z)
    if (hitsWall(n.x, n.z, h) || VEHICLES.some((o) => Math.hypot(o.x - n.x, o.z - n.z) < 8)) continue
    // Mostly cars, some vans, the odd black cab (v43)
    const roll = Math.random()
    const kind = roll < 0.18 ? 'van' : roll < 0.3 ? 'taxi' : 'car'
    const patrol = roll > 0.93 // about 1 in 14: a police car on patrol (v44): they're the ones who see crimes
    VEHICLES.push({
      id: `tr${nextId++}`,
      kind,
      colour: kind === 'taxi' ? '#17181B' : kind === 'van' ? VAN_COLOURS[Math.floor(Math.random() * VAN_COLOURS.length)] : COLOURS[Math.floor(Math.random() * COLOURS.length)],
      topSpeed: kind === 'van' ? 15 : undefined,
      ...(patrol ? { police: true, colour: '#E8EAF0' } : {}),
      owned: false,
      police: false,
      traffic: true,
      ai: true,
      x: n.x, z: n.z, h,
      speed: 0,
      steer: 0,
      driver: null,
      input: { throttle: 0, steer: 0, brake: false, at: 0 },
      drive: { node: id, path: null, idx: 0, pace: rand(0.78, 0.95), progressAt: Date.now(), bestSpot: { x: n.x, z: n.z } },
    })
    return true
  }
  return false
}

/** Pick somewhere to go: a road node 150 to 500 m away in the same piece of road. */
function newRoute(u) {
  const from = nearestNode(u.x, u.z, 40)
  if (from < 0) return false
  const to = randomNode(u.x, u.z, 150, 500, ROAD_NODES[from].piece) ?? randomNode(u.x, u.z, 40, 500, ROAD_NODES[from].piece)
  if (to === null) return false
  const path = route(from, to, 6000, false, true)
  if (!path || path.length < 3) return false
  u.drive.path = path
  u.drive.idx = 0
  return true
}

function drive(u, others, walkers, now) {
  const d = u.drive
  if (!d.path || d.idx >= d.path.length - 1) {
    if (!newRoute(u)) {
      d.noRouteSince ||= now // nowhere to go from here: the car is removed after a few seconds
      return { throttle: 0, steer: 0, brake: true }
    }
    d.noRouteSince = 0
  }
  const path = d.path
  // Reached this node? aim for the next
  while (d.idx < path.length - 2 && Math.hypot(ROAD_NODES[path[d.idx + 1]].x - u.x, ROAD_NODES[path[d.idx + 1]].z - u.z) < TRAFFIC.lookahead) d.idx++
  const a = ROAD_NODES[path[d.idx]]
  const b = ROAD_NODES[path[d.idx + 1]]
  const kind = edgeKind(path[d.idx], path[d.idx + 1])
  // In an underpass: no walls above ground to hit, nobody up top to see it (index.mjs doesn't send it)
  u.underground = kind === 'tunnel'
  const oneWay = !ROAD_NODES[path[d.idx + 1]].out.some((e) => e.to === path[d.idx])
  let sx = b.x - a.x
  let sz = b.z - a.z
  const sl = Math.hypot(sx, sz) || 1
  sx /= sl
  sz /= sl
  // Drive on the left: the left of travel is (dz, -dx)
  const off = oneWay ? 0 : TRAFFIC.laneOffset
  const tx = b.x + sz * off
  const tz = b.z - sx * off

  // Lost the route (shoved off it)? Plan again
  if (Math.hypot(a.x - u.x, a.z - u.z) > 30 && Math.hypot(b.x - u.x, b.z - u.z) > 30) {
    d.path = null
    return { throttle: 0, steer: 0, brake: true }
  }

  const diff = wrap(Math.atan2(tx - u.x, tz - u.z) - u.h) // positive: target is to the left
  const steer = -clamp(diff * 1.7, -1, 1)

  // How fast? The limit, less round corners
  const limit = (LIMIT[kind] ?? 9) * d.pace
  const next = ROAD_NODES[path[Math.min(d.idx + 2, path.length - 1)]]
  const turn = Math.abs(wrap(Math.atan2(next.x - b.x, next.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z)))
  let want = limit * (1 - 0.65 * clamp(Math.max(turn, Math.abs(diff)) / 1.2, 0, 1))

  // Anything in the way? Look ahead in a narrow cone and slow to a stop behind it
  const fx = Math.sin(u.h)
  const fz = Math.cos(u.h)
  let gap = Infinity
  let blocker = null // what's closest in front (for the horn)
  const consider = (ox, oz, r, who) => {
    const dx = ox - u.x
    const dz = oz - u.z
    const along = dx * fx + dz * fz
    if (along < 1 || along > 30) return
    const side = Math.abs(dx * fz - dz * fx)
    if (side < 1.6 + r && along - 2.4 - r < gap) {
      gap = along - 2.4 - r
      blocker = who
    }
  }
  for (const o of others) if (o !== u && Boolean(o.underground) === Boolean(u.underground)) consider(o.x, o.z, 1, o)
  // people get a wider berth than cars do: they step out, and they don't brake (v42)
  if (!u.underground) for (const w of walkers) consider(w.x, w.z, w.state ? 1.3 : 0.5, w)

  // Stuck behind a player (or a player's car) for a while: lean on the horn (v43). Never at other
  // traffic, and never at people crossing.
  const byPlayer = blocker && gap < 5 && (blocker.driver || (blocker.ws && !blocker.vehicleId))
  if (byPlayer) {
    d.blockedSince ||= now
    if (now - d.blockedSince > 2500 && now - (d.hornAt ?? 0) > 6000) {
      d.hornAt = now
      HORNS.push({ id: u.id, x: u.x, z: u.z })
    }
  } else d.blockedSince = 0
  let brake = false
  let throttle
  if (gap < 3) {
    want = 0
  } else if (gap < 28) {
    want = Math.min(want, Math.max(0, (gap - 3) * 0.55))
  }
  if (u.speed > want + 1.2) {
    throttle = 0
    brake = gap < 12 || u.speed > want + 4
  } else {
    throttle = clamp((want - u.speed) / 2.5, 0, 1)
  }
  // Lights and give-way at the next junction on the route
  const rule = junctionRule(u, path, d.idx, now, others)
  d.holding = rule.hold
  if (rule.want < want) want = rule.want
  if (rule.want < 0.5) gap = Math.min(gap, 2)
  if (u.speed > want + 1.2) {
    throttle = 0
    brake = gap < 12 || u.speed > want + 4 || rule.want < u.speed - 1
  } else if (rule.want < Infinity) {
    throttle = Math.min(throttle, clamp((want - u.speed) / 2.5, 0, 1))
  }
  if (want === 0 && u.speed < 0.3) brake = true
  return { throttle, steer, brake }
}

/**
 * The next junction ahead on the route (within 45 m): what speed it allows.
 * Red, or amber with room to stop: stop just before the junction. Give way: slow down, and wait
 * while another car is crossing. Once a car is inside a junction it always carries on.
 */
function junctionRule(u, path, idx, now, others) {
  const free = { want: Infinity, hold: false }
  let along = Math.hypot(ROAD_NODES[path[idx + 1]].x - u.x, ROAD_NODES[path[idx + 1]].z - u.z)
  for (let k = idx + 1; k < path.length && along < 45; k++) {
    if (k > idx + 1) along += Math.hypot(ROAD_NODES[path[k]].x - ROAD_NODES[path[k - 1]].x, ROAD_NODES[path[k]].z - ROAD_NODES[path[k - 1]].z)
    const j = NODE_JUNCTION.get(path[k])
    if (!j) continue
    const toCentre = Math.hypot(j.x - u.x, j.z - u.z)
    if (toCentre < j.r) return free // already in it: clear the junction
    const prev = ROAD_NODES[path[k - 1]] ?? u
    const node = ROAD_NODES[path[k]]
    const b = Math.atan2(node.x - prev.x, node.z - prev.z)
    const stopIn = toCentre - j.r - SIGNAL.stopBack
    const stopAt = (dist) => (dist < 0.8 ? 0 : Math.max(0, dist * 0.5))
    if (j.lit) {
      const colour = lightFor(j, armFor(j, b).ph, now)
      if (colour === 'green') return free
      const canStop = u.speed * u.speed / 10 < stopIn + 1 // about 5 m/s^2 of braking
      if (colour === 'red' || canStop) return { want: stopAt(stopIn), hold: stopIn < 6 }
      return free // amber and too close to stop: go
    }
    // Give way: only traffic from the smaller road waits
    const mine = RANK_OF[edgeKind(path[k - 1] ?? path[k], path[k])] ?? 0
    if (mine >= j.rank) return free
    u.drive.waitSince ||= now
    if (now - u.drive.waitSince > 7000) return free // waited long enough: nose out
    const busy = others.some((o) => o !== u && Math.abs(o.speed) > 1.5 && Math.hypot(o.x - j.x, o.z - j.z) < j.r + 14 && Math.abs(Math.atan2(Math.sin(o.h - u.h), Math.cos(o.h - u.h))) > 0.5)
    if (busy) return { want: stopAt(stopIn), hold: stopIn < 6 }
    return { want: stopIn < 14 ? 4 : Infinity, hold: false }
  }
  u.drive.waitSince = 0
  return free
}
const RANK_OF = { tunnel: 6, bus: 0, trunk: 6, trunk_link: 5, primary: 5, primary_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 2, unclassified: 1, residential: 1, living_street: 0, service: 0 }


/** Run once per server tick (about 10 times a second). */
export function tickTraffic({ players, now }) {
  const live = players.filter((p) => !p.travel)
  if (live.length === 0) return

  const cars = trafficCars()

  // Drop cars left far behind, and cars jammed for too long
  for (const u of cars) {
    const near = live.some((p) => Math.hypot(p.x - u.x, p.z - u.z) < TRAFFIC.despawnRange)
    const moved = Math.hypot(u.x - u.drive.bestSpot.x, u.z - u.drive.bestSpot.z) > 4
    if (u.drive.holding) u.drive.progressAt = now // waiting at a light is not a jam
    if (moved) {
      u.drive.bestSpot = { x: u.x, z: u.z }
      u.drive.progressAt = now
    }
    // Out of range, nowhere to go, or jammed: remove it (jammed cars out of sight go sooner)
    const watched = live.some((p) => Math.hypot(p.x - u.x, p.z - u.z) < 100)
    const jammedFor = now - u.drive.progressAt
    if (!near || (u.drive.noRouteSince && now - u.drive.noRouteSince > 3000) || jammedFor > (watched ? 30000 : 10000)) VEHICLES.splice(VEHICLES.indexOf(u), 1)
  }

  // Keep a few around every player
  if (now - (tickTraffic.lastSpawn ?? 0) > TRAFFIC.spawnEveryMs) {
    tickTraffic.lastSpawn = now
    for (const p of live) {
      const around = trafficCars().filter((u) => Math.hypot(u.x - p.x, u.z - p.z) < 220).length
      if (around < TRAFFIC.perPlayer && spawn(p, live)) break // one new car per round
    }
  }

  const others = VEHICLES
  const walkers = [...live.filter((p) => !p.vehicleId), ...PEOPLE, ...OFFICERS] // players on foot, people on the pavements (v42), officers (v44)
  for (const u of trafficCars()) setInput(u, drive(u, others, walkers, now), now)
}

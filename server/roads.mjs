// The road network as a graph: where a car can drive, which way, and how to get from A to B.
// Built from the same OpenStreetMap district files as the map. Used by the police and traffic, and
// (later) by the GPS. Nodes are every vertex of a drivable road; edges go both ways unless the road
// is one-way. Only the biggest connected piece is kept, so a route can never lead nowhere.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { toWorld } from './districts.mjs'
import { roadWidth } from './roadwidth.mjs'

const FILES = ['digbeth.geojson', 'centre.geojson'] // keep in step with src/world/districts.ts
const DRIVABLE = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service',
])
// 'bus' = a bus gate or bus-only street (Birmingham closed several through-routes to cars). Slow on
// purpose: GPS and traffic only use one when there's no ordinary way round, so the city stays joined up.
const MAIN = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'])
const SPEED = { bus: 2, tunnel: 16, motorway: 20, trunk: 16, primary: 14, secondary: 13, tertiary: 12, unclassified: 11, residential: 10, living_street: 6, service: 7 }
const CELL = 32

const nodes = [] // { x, z, out: [{ to, len, kind }] }
const index = new Map() // snapped lon/lat -> node id
const grid = new Map()

const snap = (n) => Math.round(n * 1e6)
const nodeAt = (lon, lat) => {
  const k = `${snap(lon)},${snap(lat)}`
  let id = index.get(k)
  if (id === undefined) {
    const [x, z] = toWorld(lon, lat)
    id = nodes.length
    nodes.push({ x, z, out: [] })
    index.set(k, id)
  }
  return id
}

function addEdge(a, b, kind, w) {
  const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z)
  if (len < 0.01 || nodes[a].out.some((e) => e.to === b)) return
  nodes[a].out.push({ to: b, len, kind, w }) // w: carriageway width in metres (pavements start at w / 2)
}

const seen = new Set()
for (const name of FILES) {
  const path = fileURLToPath(new URL(`../public/data/${name}`, import.meta.url))
  if (!existsSync(path)) continue
  try {
    for (const f of JSON.parse(readFileSync(path, 'utf8')).features ?? []) {
      const p = f.properties ?? {}
      const id = f.id ?? p['@id']
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      if (f.geometry?.type !== 'LineString' || !(DRIVABLE.has(p.highway) || p.highway === 'busway')) continue
      const busOnly = p.highway === 'busway' || ((p.access === 'no' || p.motor_vehicle === 'no') && (p.psv === 'yes' || p.bus === 'yes' || p.psv === 'designated' || p.bus === 'designated'))
      // Underpasses on the main roads (the A38 Queensway, Suffolk Street Queensway) are kept as 'tunnel'
      // edges: they're how you drive into the south of the centre. Other tunnels (car parks, alleys) are not.
      const tunnel = p.tunnel === 'yes' && MAIN.has(p.highway)
      if ((p.tunnel === 'yes' && !tunnel) || p.tunnel === 'building_passage' || p.access === 'private' || (p.access === 'no' && !busOnly)) continue
      if (p.service === 'parking_aisle' || p.service === 'driveway') continue
      const coords = f.geometry.coordinates
      const ids = coords.map(([lon, lat]) => nodeAt(lon, lat))
      const one = p.oneway === 'yes' || p.oneway === '1' || p.junction === 'roundabout' ? 1 : p.oneway === '-1' ? -1 : 0
      for (let i = 0; i < ids.length - 1; i++) {
        const kind = busOnly ? 'bus' : tunnel ? 'tunnel' : p.highway
        const w = roadWidth(p)
        if (one >= 0) addEdge(ids[i], ids[i + 1], kind, w)
        if (one <= 0) addEdge(ids[i + 1], ids[i], kind, w)
      }
    }
  } catch (err) {
    console.warn(`roads: could not read ${name}:`, err.message)
  }
}

// Keep every strongly-connected piece of 10+ nodes (from any node in a piece you can reach every other).
// The map files are clipped at their edges, so the roads can come in several separate pieces.
const MIN_PIECE = 10
function pieces() {
  const n = nodes.length
  const rev = Array.from({ length: n }, () => [])
  nodes.forEach((nd, a) => nd.out.forEach((e) => rev[e.to].push(a)))
  const reach = (start, next) => {
    const mark = new Uint8Array(n)
    const stack = [start]
    mark[start] = 1
    while (stack.length) {
      const a = stack.pop()
      for (const b of next(a)) if (!mark[b]) { mark[b] = 1; stack.push(b) }
    }
    return mark
  }
  const out = []
  const done = new Uint8Array(n)
  for (let s = 0; s < n; s++) {
    if (done[s] || nodes[s].out.length === 0) continue
    const f = reach(s, (a) => nodes[a].out.map((e) => e.to))
    const r = reach(s, (a) => rev[a])
    const comp = []
    for (let i = 0; i < n; i++) if (f[i] && r[i] && !done[i]) { comp.push(i); done[i] = 1 }
    done[s] = 1
    if (comp.length >= MIN_PIECE) out.push(comp)
  }
  return out
}

const remap = new Map()
export const ROAD_NODES = []
pieces().forEach((comp, piece) => {
  for (const i of comp) {
    remap.set(i, ROAD_NODES.length)
    ROAD_NODES.push({ x: nodes[i].x, z: nodes[i].z, piece, out: [] })
  }
})
nodes.forEach((nd, i) => {
  if (!remap.has(i)) return
  for (const e of nd.out) if (remap.has(e.to) && ROAD_NODES[remap.get(e.to)].piece === ROAD_NODES[remap.get(i)].piece) ROAD_NODES[remap.get(i)].out.push({ to: remap.get(e.to), len: e.len, kind: e.kind, w: e.w })
})
ROAD_NODES.forEach((nd, i) => {
  const k = `${Math.floor(nd.x / CELL)},${Math.floor(nd.z / CELL)}`
  if (!grid.has(k)) grid.set(k, [])
  grid.get(k).push(i)
})

export const roadStats = () => ({ nodes: ROAD_NODES.length, edges: ROAD_NODES.reduce((s, n) => s + n.out.length, 0), dropped: nodes.length - ROAD_NODES.length, pieces: new Set(ROAD_NODES.map((n) => n.piece)).size })

/** The road node nearest to a point (within `max` metres), or -1. */
export function nearestNode(x, z, max = 80) {
  const r = Math.ceil(max / CELL)
  const cx = Math.floor(x / CELL)
  const cz = Math.floor(z / CELL)
  let best = -1
  let bd = max
  for (let i = cx - r; i <= cx + r; i++) {
    for (let j = cz - r; j <= cz + r; j++) {
      for (const id of grid.get(`${i},${j}`) ?? []) {
        const d = Math.hypot(ROAD_NODES[id].x - x, ROAD_NODES[id].z - z)
        if (d < bd) { bd = d; best = id }
      }
    }
  }
  return best
}

// Who can reach each node (for walking routes, which ignore one-way streets)
let incoming = null
const incomingOf = (i) => {
  if (!incoming) {
    incoming = Array.from({ length: ROAD_NODES.length }, () => [])
    ROAD_NODES.forEach((nd, a) => nd.out.forEach((e) => incoming[e.to].push({ to: a, len: e.len, kind: e.kind })))
  }
  return incoming[i]
}

/**
 * Shortest route from node `a` to node `b` as a list of node ids (A*), or null.
 * Driving respects one-way streets and prefers faster roads; `walk` ignores one-ways and just
 * takes the shortest distance (used by the GPS line when you're on foot).
 * Underpasses ('tunnel' edges) are only used when `tunnels` is set: by AI traffic, which is hidden
 * while it's underground. You and the police drive on the surface.
 */
export function route(a, b, limit = 6000, walk = false, tunnels = false) {
  if (a < 0 || b < 0 || ROAD_NODES[a].piece !== ROAD_NODES[b].piece) return null // different pieces of road are not linked
  if (a === b) return [a]
  const goal = ROAD_NODES[b]
  const h = (i) => Math.hypot(ROAD_NODES[i].x - goal.x, ROAD_NODES[i].z - goal.z)
  const g = new Map([[a, 0]])
  const from = new Map()
  const open = [[h(a), a]]
  const closed = new Set()
  let steps = 0
  while (open.length && steps++ < limit) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i
    const [, cur] = open.splice(bi, 1)[0]
    if (cur === b) {
      const path = [b]
      while (from.has(path[0])) path.unshift(from.get(path[0]))
      return path
    }
    if (closed.has(cur)) continue
    closed.add(cur)
    const next = walk ? [...ROAD_NODES[cur].out, ...incomingOf(cur)] : ROAD_NODES[cur].out
    for (const e of next) {
      if (e.kind === 'tunnel' && !tunnels) continue
      const cost = g.get(cur) + (walk ? e.len / 10 : e.len / (SPEED[e.kind] ?? 9))
      if (cost < (g.get(e.to) ?? Infinity)) {
        g.set(e.to, cost)
        from.set(e.to, cur)
        open.push([cost + h(e.to) / 20, e.to])
      }
    }
  }
  return null
}

/** The kind of road ("secondary", "service"...) on the edge between two neighbouring nodes. */
export function edgeKind(a, b) {
  return ROAD_NODES[a]?.out.find((e) => e.to === b)?.kind ?? 'unclassified'
}

/** A random road node 80 to 500 m (by default) from a point, in the given piece of road. Null if none. */
export function randomNode(x, z, minD, maxD, piece = null) {
  const pick = []
  for (let i = 0; i < ROAD_NODES.length; i++) {
    const n = ROAD_NODES[i]
    if (piece !== null && n.piece !== piece) continue
    if (!n.out.length) continue
    const d = Math.hypot(n.x - x, n.z - z)
    if (d >= minD && d <= maxD) pick.push(i)
  }
  return pick.length ? pick[Math.floor(Math.random() * pick.length)] : null
}

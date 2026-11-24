// Traffic lights and junction rules (v34).
//
// The map data has no traffic-light points, so junctions are found from the road graph: wherever three
// or more roads meet and at least one of them is a main road (trunk, primary, secondary or tertiary),
// the junction gets lights. Nodes a few metres apart (dual carriageways, wide junctions) are merged
// into one junction.
//
// Each lit junction splits its approaches into two groups, A (the main road's axis) and B (the
// crossing roads), and runs a UK cycle: A green, A amber, all red, B green, B amber, all red.
// Every junction starts at a different point in the cycle, so the city doesn't change all at once.
//
// The cycle is a pure function of the clock, so the client only needs the junction list once
// (sent on join) and works out the colours itself from the server time.
//
// Minor junctions (three or more roads, no main road among them, or a minor road meeting a main one
// without lights) are "give way": traffic from the smaller road slows and waits for a gap.
import { ROAD_NODES } from './roads.mjs'

export const SIGNAL = {
  greenA: 14000, // main road
  amber: 3000,
  allRed: 2000,
  greenB: 11000, // side roads
  mergeRadius: 16, // junction nodes closer than this are one junction
  stopBack: 3, // stop this far before the junction's edge
}
export const CYCLE = SIGNAL.greenA + SIGNAL.amber + SIGNAL.allRed + SIGNAL.greenB + SIGNAL.amber + SIGNAL.allRed

const MAJOR = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'])
const RANK = { trunk: 6, trunk_link: 5, primary: 5, primary_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 2, unclassified: 1, residential: 1, living_street: 0, service: 0 }
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// ---- Undirected neighbours and the road kinds that touch each node ----
const n = ROAD_NODES.length
const nbr = Array.from({ length: n }, () => new Set())
const kinds = Array.from({ length: n }, () => new Set())
ROAD_NODES.forEach((nd, a) => {
  for (const e of nd.out) {
    nbr[a].add(e.to)
    nbr[e.to].add(a)
    kinds[a].add(e.kind)
    kinds[e.to].add(e.kind)
  }
})
const rankAt = (i) => Math.max(0, ...[...kinds[i]].map((k) => RANK[k] ?? 0))

// ---- Junction nodes, merged into clusters ----
const isJunction = (i) => nbr[i].size >= 3
const parent = Array.from({ length: n }, (_, i) => i)
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
const cand = []
for (let i = 0; i < n; i++) if (isJunction(i)) cand.push(i)
const CELL = SIGNAL.mergeRadius
const grid = new Map()
for (const i of cand) {
  const k = `${Math.floor(ROAD_NODES[i].x / CELL)},${Math.floor(ROAD_NODES[i].z / CELL)}`
  if (!grid.has(k)) grid.set(k, [])
  grid.get(k).push(i)
}
for (const i of cand) {
  const cx = Math.floor(ROAD_NODES[i].x / CELL)
  const cz = Math.floor(ROAD_NODES[i].z / CELL)
  for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
    for (const j of grid.get(`${a},${b}`) ?? []) {
      if (j <= i) continue
      if (Math.hypot(ROAD_NODES[i].x - ROAD_NODES[j].x, ROAD_NODES[i].z - ROAD_NODES[j].z) < SIGNAL.mergeRadius) parent[find(j)] = find(i)
    }
  }
}
const clusters = new Map()
for (const i of cand) {
  const r = find(i)
  if (!clusters.has(r)) clusters.set(r, [])
  clusters.get(r).push(i)
}

/** Every junction: { id, x, z, r, nodes:Set, lit, offset, axis, arms:[{ b, ph, rank }] } */
export const JUNCTIONS = []
/** road node id -> junction */
export const NODE_JUNCTION = new Map()

let seed = 34
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

for (const members of clusters.values()) {
  const set = new Set(members)
  const x = members.reduce((s, i) => s + ROAD_NODES[i].x, 0) / members.length
  const z = members.reduce((s, i) => s + ROAD_NODES[i].z, 0) / members.length
  // Approaches: every edge that enters the cluster from outside it (direction of travel)
  const arms = []
  for (const i of members) {
    for (const from of nbr[i]) {
      if (set.has(from)) continue
      if (!ROAD_NODES[from].out.some((e) => e.to === i)) continue // one-way out of the junction: not an approach
      const kind = ROAD_NODES[from].out.find((e) => e.to === i).kind
      const b = Math.atan2(ROAD_NODES[i].x - ROAD_NODES[from].x, ROAD_NODES[i].z - ROAD_NODES[from].z)
      // merge approaches that point the same way (within 25 degrees)
      const same = arms.find((a) => Math.abs(wrap(a.b - b)) < 0.44)
      if (same) {
        if ((RANK[kind] ?? 0) > same.rank) { same.rank = RANK[kind] ?? 0; same.kind = kind }
        continue
      }
      arms.push({ b, rank: RANK[kind] ?? 0, kind })
    }
  }
  if (arms.length < 2) continue
  const major = members.some((i) => [...kinds[i]].some((k) => MAJOR.has(k)))
  // Axis A: the biggest road through the junction
  const top = [...arms].sort((p, q) => q.rank - p.rank)[0]
  const axis = top.b
  for (const a of arms) {
    const d = Math.abs(wrap(a.b - axis))
    a.ph = d < Math.PI / 4 || d > (3 * Math.PI) / 4 ? 'A' : 'B'
  }
  const lit = major && members.some(isJunction) && arms.some((a) => a.ph === 'A') && arms.some((a) => a.ph === 'B') && arms.length >= 3
  const r = Math.max(6, ...members.map((i) => Math.hypot(ROAD_NODES[i].x - x, ROAD_NODES[i].z - z) + 5))
  const j = { id: JUNCTIONS.length, x, z, r, nodes: set, lit, offset: Math.floor(rnd() * CYCLE), axis, arms, rank: Math.max(...members.map(rankAt)) }
  JUNCTIONS.push(j)
  for (const i of members) NODE_JUNCTION.set(i, j)
}

/** The colour for phase 'A' or 'B' at a junction at time `now`: 'green' | 'amber' | 'red'. */
export function lightFor(j, phase, now) {
  const t = (now + j.offset) % CYCLE
  const aEnd = SIGNAL.greenA
  const aAmb = aEnd + SIGNAL.amber
  const red1 = aAmb + SIGNAL.allRed
  const bEnd = red1 + SIGNAL.greenB
  const bAmb = bEnd + SIGNAL.amber
  if (phase === 'A') return t < aEnd ? 'green' : t < aAmb ? 'amber' : 'red'
  return t >= red1 && t < bEnd ? 'green' : t >= bEnd && t < bAmb ? 'amber' : 'red'
}

/** Which arm a car arriving on bearing `b` uses (the closest match). */
export function armFor(j, b) {
  let best = j.arms[0]
  let bd = Infinity
  for (const a of j.arms) {
    const d = Math.abs(wrap(a.b - b))
    if (d < bd) { bd = d; best = a }
  }
  return best
}

export const signalStats = () => ({ junctions: JUNCTIONS.length, lit: JUNCTIONS.filter((j) => j.lit).length, giveWay: JUNCTIONS.filter((j) => !j.lit).length, arms: JUNCTIONS.filter((j) => j.lit).reduce((s, j) => s + j.arms.length, 0) })

/** What the client needs to draw the lights (sent once, on join). */
export const signalsMessage = () => ({
  t: 'signals',
  cycle: { greenA: SIGNAL.greenA, amber: SIGNAL.amber, allRed: SIGNAL.allRed, greenB: SIGNAL.greenB },
  serverNow: Date.now(),
  list: JUNCTIONS.filter((j) => j.lit).map((j) => ({
    id: j.id,
    x: Math.round(j.x * 10) / 10,
    z: Math.round(j.z * 10) / 10,
    r: Math.round(j.r * 10) / 10,
    o: j.offset,
    arms: j.arms.map((a) => ({ b: Math.round(a.b * 1000) / 1000, ph: a.ph })),
  })),
})

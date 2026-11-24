import { toWorld } from './geo'

// Water you cannot walk or drive into: canals, rivers and ponds. A road or path on a bridge crosses
// them freely (anywhere near a bridge counts as dry). server/colliders.mjs does the same for cars.
type Pt = [number, number]
type Poly = { pts: Pt[]; x0: number; x1: number; z0: number; z1: number }
type Seg = { a: Pt; b: Pt }

const CELL = 24
const grid = new Map<string, Poly[]>()
const bridges = new Map<string, Seg[]>()
const key = (cx: number, cz: number) => `${cx},${cz}`
const HALF: Record<string, number> = { river: 7, canal: 3.5 }

function addPoly(pts: Pt[]) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const poly = { pts, x0, x1, z0, z1 }
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = key(cx, cz)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k)!.push(poly)
    }
}

function addBridge(a: Pt, b: Pt) {
  const seg = { a, b }
  for (let cx = Math.floor((Math.min(a[0], b[0]) - 5) / CELL); cx <= Math.floor((Math.max(a[0], b[0]) + 5) / CELL); cx++)
    for (let cz = Math.floor((Math.min(a[1], b[1]) - 5) / CELL); cz <= Math.floor((Math.max(a[1], b[1]) + 5) / CELL); cz++) {
      const k = key(cx, cz)
      if (!bridges.has(k)) bridges.set(k, [])
      bridges.get(k)!.push(seg)
    }
}

export function setupWater(features: any[]) {
  grid.clear()
  bridges.clear()
  for (const f of features) {
    const p = f.properties ?? {}
    const g = f.geometry
    if (g?.type === 'Polygon' && !p.building && (p.natural === 'water' || p.water)) {
      addPoly(g.coordinates[0].map(([lon, lat]: number[]) => toWorld(lon, lat)))
    } else if (g?.type === 'LineString' && p.waterway && HALF[p.waterway] && p.tunnel !== 'yes' && p.tunnel !== 'building_passage') {
      const pts: Pt[] = g.coordinates.map(([lon, lat]: number[]) => toWorld(lon, lat))
      const half = HALF[p.waterway] - 0.1
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i]
        const [bx, bz] = pts[i + 1]
        const len = Math.hypot(bx - ax, bz - az)
        if (len < 0.01) continue
        const nx = (-(bz - az) / len) * half
        const nz = ((bx - ax) / len) * half
        addPoly([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]])
      }
    } else if (g?.type === 'LineString' && p.highway && (['yes', 'viaduct', 'movable', 'aqueduct'].includes(p.bridge) || Number(p.layer) >= 1)) {
      const pts: Pt[] = g.coordinates.map(([lon, lat]: number[]) => toWorld(lon, lat))
      for (let i = 0; i < pts.length - 1; i++) addBridge(pts[i], pts[i + 1])
    }
  }
}

function inside(x: number, z: number, pts: Pt[]) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

function onBridge(x: number, z: number) {
  for (const { a, b } of bridges.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2))
    if (Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) < 4) return true
  }
  return false
}

/** Is this spot in water that cannot be crossed? */
export function waterBlocked(x: number, z: number) {
  const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)))
  if (!list) return false
  for (const p of list) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue
    if (inside(x, z, p.pts)) return !onBridge(x, z)
  }
  return false
}

// Building footprints for the server, so it can decide where a car may go.
// Reads the same district files as the browser and applies the same rules (outer ring of every
// Polygon that has a `building` tag), so the server and the client agree about where the walls are.
// A spatial grid keeps `blocked()` fast even with the whole city centre loaded.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { toWorld } from './districts.mjs'

const FILES = ['digbeth.geojson', 'centre.geojson'] // keep in step with src/world/districts.ts
const CELL = 16
const MAX_RADIUS = 4 // the biggest shape we ever test (cell lists are padded by this)

const cells = new Map()
let buildings = 0

const key = (cx, cz) => `${cx},${cz}`

function register(polygon) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, z] of polygon) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  const shape = { polygon, x0, x1, z0, z1 }
  for (let cx = Math.floor((x0 - MAX_RADIUS) / CELL); cx <= Math.floor((x1 + MAX_RADIUS) / CELL); cx++) {
    for (let cz = Math.floor((z0 - MAX_RADIUS) / CELL); cz <= Math.floor((z1 + MAX_RADIUS) / CELL); cz++) {
      const k = key(cx, cz)
      if (!cells.has(k)) cells.set(k, [])
      cells.get(k).push(shape)
    }
  }
  buildings++
}

// ---- Water: canals, rivers and ponds. Same rules as src/world/water.ts (a bridge makes the spot dry).
const waterCells = new Map()
const bridgeCells = new Map()
const HALF_WIDTH = { river: 7, canal: 3.5 }
const push = (map, k, v) => {
  if (!map.has(k)) map.set(k, [])
  map.get(k).push(v)
}
function addWater(pts) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const poly = { pts, x0, x1, z0, z1 }
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) push(waterCells, key(cx, cz), poly)
}
function addBridge(a, b) {
  const seg = { a, b }
  for (let cx = Math.floor((Math.min(a[0], b[0]) - 5) / CELL); cx <= Math.floor((Math.max(a[0], b[0]) + 5) / CELL); cx++)
    for (let cz = Math.floor((Math.min(a[1], b[1]) - 5) / CELL); cz <= Math.floor((Math.max(a[1], b[1]) + 5) / CELL); cz++) push(bridgeCells, key(cx, cz), seg)
}
function registerWaterFeature(f) {
  const p = f.properties ?? {}
  const g = f.geometry
  if (g?.type === 'Polygon' && !p.building && (p.natural === 'water' || p.water)) {
    addWater(g.coordinates[0].map(([lon, lat]) => toWorld(lon, lat)))
  } else if (g?.type === 'LineString' && p.waterway && HALF_WIDTH[p.waterway] && p.tunnel !== 'yes' && p.tunnel !== 'building_passage') {
    const pts = g.coordinates.map(([lon, lat]) => toWorld(lon, lat))
    const half = HALF_WIDTH[p.waterway] - 0.1
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 0.01) continue
      const nx = (-(bz - az) / len) * half
      const nz = ((bx - ax) / len) * half
      addWater([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]])
    }
  } else if (g?.type === 'LineString' && p.highway && (['yes', 'viaduct', 'movable', 'aqueduct'].includes(p.bridge) || Number(p.layer) >= 1)) {
    const pts = g.coordinates.map(([lon, lat]) => toWorld(lon, lat))
    for (let i = 0; i < pts.length - 1; i++) addBridge(pts[i], pts[i + 1])
  }
}
const nearBridge = (x, z) => {
  for (const { a, b } of bridgeCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2))
    if (Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) < 4) return true
  }
  return false
}
function inWater(x, z) {
  for (const p of waterCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue
    let hit = false
    for (let i = 0, j = p.pts.length - 1; i < p.pts.length; j = i++) {
      const [xi, zi] = p.pts[i]
      const [xj, zj] = p.pts[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
    }
    if (hit) return !nearBridge(x, z)
  }
  return false
}

const seen = new Set()
for (const name of FILES) {
  const path = fileURLToPath(new URL(`../public/data/${name}`, import.meta.url))
  if (!existsSync(path)) continue
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    for (const f of data.features ?? []) {
      const id = f.id ?? f.properties?.['@id']
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      registerWaterFeature(f)
      if (f.geometry?.type !== 'Polygon' || !f.properties?.building) continue
      register(f.geometry.coordinates[0].map(([lon, lat]) => toWorld(lon, lat)))
    }
  } catch (error) {
    console.error(`Could not read ${name} for collisions:`, error.message)
  }
}

function inside(x, z, polygon) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

function segmentDistance(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz))
}

/** Is a circle of `radius` metres at (x, z) touching a building? */
export function blocked(x, z, radius = 0.65) {
  if (inWater(x, z)) return true
  const list = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)))
  if (!list) return false
  for (const s of list) {
    if (x < s.x0 - radius || x > s.x1 + radius || z < s.z0 - radius || z > s.z1 + radius) continue
    if (inside(x, z, s.polygon)) return true
    const p = s.polygon
    for (let i = 0; i < p.length; i++) {
      if (segmentDistance(x, z, p[i], p[(i + 1) % p.length]) < radius) return true
    }
  }
  return false
}

export const colliderCount = () => buildings

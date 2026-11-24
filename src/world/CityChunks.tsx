// The city's buildings and streets, drawn in 160 m blocks (v39).
//
// Before v39 every building was its own set of meshes (walls, windows, door frame, door, handle, shop
// glass, sign) and every road its own (surface, lane lines, two pavements, two kerbs), each with its own
// material: 1,300+ draw calls a frame, which held a laptop to about 30 fps. Now each block merges all of
// that into about nine draw calls: brick walls, plain walls, windows (lit and car-park), doors, signs
// (one shared sheet), road surface, paving, kerbs and lane markings. Colours ride along as vertex or
// instance colours, so the city looks the same.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toWorld } from './geo'
import { spotOf, useNearby, type Spot } from './nearby'
import { asphaltPatch, brickPatch, pavementPatch } from './surfaces'
import { CARRIAGEWAYS, isOneway, laneCount, roadWidth } from './roadWidth'
import { SIGN_H, SIGN_W, STYLES, hashOf, heightOf, paintSign, styleOf } from './buildingStyle'
import { LANDMARK_IDS, featureId } from './Landmarks'
import { onDayNight, onDayNightColour, onWet } from './daylight'

export type Feature = {
  type: string
  id?: string
  properties: Record<string, string>
  geometry: { type: string; coordinates: any }
}

const CELL = 160 // metres per block

// ---- Shared materials (one shader each for the whole city) ----
const cacheKey = <M extends THREE.Material>(m: M, key: string): M => {
  m.customProgramCacheKey = () => key
  return m
}
const MAT = {
  brick: cacheKey(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'britlife-brick-vc'),
  plain: cacheKey(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'britlife-plain-vc'),
  windowLit: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0.05, emissive: '#FFB257', emissiveIntensity: 0.9 }),
  windowDark: new THREE.MeshStandardMaterial({ color: '#2B2F33', roughness: 0.22, metalness: 0.05 }),
  door: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
  // lit shop windows: flat bright colour that the bloom picks up (v41)
  shopGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.92, 0.92, 0.92), toneMapped: false }),
  asphalt: cacheKey(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 'britlife-asphalt-vc'),
  paving: cacheKey(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 'britlife-pavement-vc'),
  kerb: new THREE.MeshStandardMaterial({ color: '#85817A', roughness: 1, side: THREE.DoubleSide }),
  marking: new THREE.MeshStandardMaterial({ color: '#E8E4D8', roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
}
// Day and night, wet and dry (v46): windows and shop fronts glow after dark; streets shine in the rain
onDayNight(MAT.windowLit, 'emissiveIntensity', 0.08, 1.3)
onDayNightColour(MAT.shopGlow.color, 0.42, 1.05)
onWet(MAT.asphalt, 'roughness', 1, 0.3)
onWet(MAT.asphalt, 'metalness', 0, 0.18)
onWet(MAT.paving, 'roughness', 1, 0.5)
MAT.brick.onBeforeCompile = brickPatch
MAT.asphalt.onBeforeCompile = asphaltPatch
MAT.paving.onBeforeCompile = pavementPatch

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const ROAD_COLOUR: Record<string, string> = {
  trunk: '#383A3D', trunk_link: '#3C3E42', primary: '#383A3D', secondary: '#414348', tertiary: '#494B50',
  unclassified: '#505258', residential: '#505258', living_street: '#5C5D62', service: '#66676A',
  pedestrian: '#B9B5AB', footway: '#C9C5BA',
}

// ---- Helpers ----
const tmpColour = new THREE.Color()
/** Gives every vertex of a geometry one colour (converted to the renderer's linear colour space). */
function paint(geo: THREE.BufferGeometry, hex: string) {
  tmpColour.set(hex)
  const n = geo.getAttribute('position').count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    c[i * 3] = tmpColour.r
    c[i * 3 + 1] = tmpColour.g
    c[i * 3 + 2] = tmpColour.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return geo
}
/** Keeps only the attributes a merge needs, so geometries from different sources can be joined. */
function only(geo: THREE.BufferGeometry, names: string[]) {
  for (const name of Object.keys(geo.attributes)) if (!names.includes(name)) geo.deleteAttribute(name)
  return geo
}
function merged(list: THREE.BufferGeometry[]) {
  if (!list.length) return null
  const out = mergeGeometries(list, false)
  for (const g of list) g.dispose()
  return out
}

// ---- Buildings ----
type Box = { x: number; y: number; z: number; ry: number; rx?: number; sx: number; sy: number; sz: number; colour: string }
type SignPart = { name: string; bg: string; fg: string; matrix: THREE.Matrix4; w: number; h: number }

function buildingParts(feature: Feature, index: number, roads: RoadIndex) {
  const ring: number[][] = feature.geometry.coordinates[0]
  const tags = feature.properties
  const styleId = styleOf(tags)
  const style = STYLES[styleId]
  const key = String(feature.id ?? index)
  const height = heightOf(tags, style, key)
  const isCommercial = Boolean(tags.shop || tags.office || tags.amenity || tags.building === 'commercial' || tags.building === 'retail')
  const pts = ring.map(([lon, lat]) => toWorld(lon, lat))

  // Walls and roof
  const shape = new THREE.Shape()
  pts.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
  shape.closePath()
  const body = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  body.rotateX(-Math.PI / 2)
  body.computeVertexNormals()
  only(body, ['position', 'normal'])
  paint(body, style.colours[Math.floor(hashOf(key + 'c') * style.colours.length)])

  // The front: the wall that faces a street (falls back to the longest wall); shops get a shopfront there
  const front = frontOf(pts, roads)
  const shop = shopfrontOf(tags, styleId, key, front)

  // Upper-floor windows (a shopfront building keeps its ground floor for the shop)
  const windows: Box[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i]
    const [x2, z2] = pts[i + 1]
    const dx = x2 - x1
    const dz = z2 - z1
    const length = Math.hypot(dx, dz)
    if (length < 4) continue
    const nx = -dz / length
    const nz = dx / length
    const ry = Math.atan2(nx, nz)
    const count = Math.max(1, Math.floor(length / style.window.spacing))
    for (let floor = shop ? Math.max(1, style.window.first) : style.window.first; floor < Math.floor(height / style.floorH); floor++) {
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count
        windows.push({ x: x1 + dx * t + nx * 0.08, y: floor * style.floorH + style.floorH * 0.6, z: z1 + dz * t + nz * 0.08, ry, sx: style.window.w, sy: style.window.h, sz: 0.08, colour: style.window.colour })
      }
    }
  }

  const doors: Box[] = []
  const glow: Box[] = []
  let sign: SignPart | null = null
  if (front) {
    const ox = front.x + front.nx * 0.12
    const oz = front.z + front.nz * 0.12
    const r = Math.atan2(front.nx, front.nz) // local +z points out of the building, local x along the wall
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    // local (lx, ly, lz) in the front's frame -> world
    const at = (list: Box[], lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, colour: string, rx = 0) =>
      list.push({ x: ox + lx * cos + lz * sin, y: ly, z: oz - lx * sin + lz * cos, ry: r, rx, sx, sy, sz, colour })
    const signAt = (name: string, bg: string, fg: string, lx: number, y: number, lz: number, w: number) => {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(ox + lx * cos + lz * sin, y, oz - lx * sin + lz * cos),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r),
        new THREE.Vector3(1, 1, 1),
      )
      sign = { name, bg, fg, matrix, w, h: w / (SIGN_W / SIGN_H) }
    }

    if (shop) {
      // A shopfront (v41): low wall, glowing window (or a roller shutter), glazed door, a fascia with the
      // name, and an awning on places that sell food
      const W = shop.width
      const doorX = -W / 2 + 0.85
      at(doors, 0, 0.3, 0.02, W, 0.6, 0.14, '#262220') // stall riser
      at(doors, doorX, 1.15, 0, 1.35, 2.3, 0.18, '#2A2522') // door frame
      at(doors, doorX, 1.1, 0.11, 1.05, 2.1, 0.06, '#3A4A4E') // door
      at(doors, doorX + 0.38, 1.1, 0.17, 0.09, 0.09, 0.09, '#C5A46A') // handle
      const g0 = -W / 2 + 1.65
      const g1 = W / 2 - 0.15
      if (shop.shutter) at(doors, (g0 + g1) / 2, 1.55, 0.06, g1 - g0, 1.9, 0.08, '#5F6266')
      else {
        at(glow, (g0 + g1) / 2, 1.55, 0.04, g1 - g0, 1.9, 0.06, shop.light)
        // frame bars across a wide window, like real shop glazing
        const panes = Math.max(1, Math.round((g1 - g0) / 2.8))
        for (let k = 1; k < panes; k++) at(doors, g0 + ((g1 - g0) * k) / panes, 1.55, 0.08, 0.12, 1.9, 0.08, '#2A2522')
        at(doors, (g0 + g1) / 2, 2.52, 0.08, g1 - g0, 0.1, 0.08, '#2A2522') // head of the window
      }
      at(doors, 0, 2.95, 0.1, W, 0.8, 0.22, shop.bg) // fascia
      if (shop.awning) at(doors, 0, 2.42, 0.62, W - 0.3, 0.05, 1.15, shop.awning, 0.3)
      if (shop.name) signAt(shop.name, shop.bg, shop.fg, 0, 2.95, 0.215, Math.min(W * 0.92, 0.72 * (SIGN_W / SIGN_H)))
    } else {
      const fw = Math.min(front.width - 0.8, 10)
      if (fw > 1.5) {
        at(doors, 0, 1.15, 0, 1.35, 2.3, 0.18, '#332B28') // frame
        at(doors, 0, 1.1, 0.11, 1.05, 2.1, 0.06, isCommercial ? '#34464A' : '#49362D') // door
        at(doors, 0.38, 1.1, 0.17, 0.09, 0.09, 0.09, '#C5A46A') // handle
        if (isCommercial && fw > 3) for (const side of [-1, 1]) at(doors, side * Math.min(fw * 0.25, 1.8), 1.25, 0.09, 1.3, 1.8, 0.07, '#78969A') // glass
        if (tags.name && fw > 2.5) signAt(tags.name, style.sign.bg[Math.floor(hashOf(key + 's') * style.sign.bg.length)], style.sign.fg, 0, style.sign.y, 0.15, Math.min(fw * 0.85, 6))
      }
    }
  }

  return { body, brick: style.brick, windows, lit: style.window.emissive !== '#000000', doors, glow, sign: sign as SignPart | null }
}

// ---- Streets the buildings face (v41) ----
type Seg = { ax: number; az: number; bx: number; bz: number; name: string; half: number }
export type RoadIndex = Map<string, Seg[]>
const RCELL = 40
const STREETS = new Set([...CARRIAGEWAYS, 'pedestrian', 'living_street'])

/** Every street centreline, in a grid, so a building can find the street outside it. */
export function roadIndex(features: Feature[]): RoadIndex {
  const grid: RoadIndex = new Map()
  for (const f of features) {
    const p = f.properties
    if (f.geometry.type !== 'LineString' || !STREETS.has(p.highway) || p.tunnel) continue
    const half = (CARRIAGEWAYS.has(p.highway) ? roadWidth(p) : 4) / 2
    const pts = (f.geometry.coordinates as number[][]).map(([lon, lat]) => toWorld(lon, lat))
    for (let i = 0; i < pts.length - 1; i++) {
      const s: Seg = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], name: p.name ?? '', half }
      const x0 = Math.floor(Math.min(s.ax, s.bx) / RCELL)
      const x1 = Math.floor(Math.max(s.ax, s.bx) / RCELL)
      const z0 = Math.floor(Math.min(s.az, s.bz) / RCELL)
      const z1 = Math.floor(Math.max(s.az, s.bz) / RCELL)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const k = `${x},${z}`
          if (!grid.has(k)) grid.set(k, [])
          grid.get(k)!.push(s)
        }
    }
  }
  return grid
}

type Front = { x: number; z: number; width: number; nx: number; nz: number; street: string }

function frontOf(pts: [number, number][], roads: RoadIndex): Front | null {
  const count = pts.length - 1
  let cx = 0
  let cz = 0
  for (let i = 0; i < count; i++) {
    cx += pts[i][0]
    cz += pts[i][1]
  }
  cx /= count
  cz /= count
  let longest: Front | null = null
  let best: Front | null = null
  let bestGap = Infinity
  for (let i = 0; i < count; i++) {
    const [x1, z1] = pts[i]
    const [x2, z2] = pts[i + 1]
    const dx = x2 - x1
    const dz = z2 - z1
    const length = Math.hypot(dx, dz)
    if (length < 0.5) continue
    const mx = (x1 + x2) / 2
    const mz = (z1 + z2) / 2
    let nx = -dz / length
    let nz = dx / length
    if (nx * (mx - cx) + nz * (mz - cz) < 0) {
      nx = -nx
      nz = -nz
    }
    const wall: Front = { x: mx, z: mz, width: length, nx, nz, street: '' }
    if (length > (longest?.width ?? 0)) longest = wall
    if (length < 3) continue
    // The street in front: roughly parallel to the wall, its kerb within ~9 m of it, on the outside
    for (const s of roads.get(`${Math.floor(mx / RCELL)},${Math.floor(mz / RCELL)}`) ?? []) {
      const sx = s.bx - s.ax
      const sz = s.bz - s.az
      const sl = Math.hypot(sx, sz) || 1
      if (Math.abs((sx * dx + sz * dz) / (sl * length)) < 0.75) continue
      const t = Math.max(0, Math.min(1, ((mx - s.ax) * sx + (mz - s.az) * sz) / (sl * sl)))
      const px = s.ax + sx * t - mx
      const pz = s.az + sz * t - mz
      if (px * nx + pz * nz <= 0) continue // behind the wall
      const gap = Math.hypot(px, pz) - s.half
      if (gap < 9 && gap < bestGap) {
        bestGap = gap
        best = { ...wall, street: s.name }
      }
    }
  }
  return best ?? longest
}

// ---- Shopfronts (v41) ----
export const HIGH_STREETS = new Set(['Digbeth', 'High Street Deritend', 'Hurst Street', 'Pershore Street', 'Corporation Street', 'New Street', 'High Street', 'Bull Street', 'Smallbrook Queensway', 'Ladywell Walk', 'Bromsgrove Street'])
const SHOP_AMENITIES = new Set(['pub', 'bar', 'cafe', 'restaurant', 'fast_food', 'nightclub', 'pharmacy', 'bank', 'ice_cream', 'bureau_de_change', 'money_transfer'])
const FOOD = new Set(['cafe', 'restaurant', 'fast_food', 'ice_cream', 'bakery', 'deli', 'butcher', 'greengrocer'])
// Made-up names for the unnamed shops on the high streets (all invented: no real businesses)
const INVENTED = [
  'Digbeth Food & Wine', 'Express Mini Market', 'Deritend Convenience', 'Late Shop', 'Midland Food Centre',
  'Perfect Fried Chicken', 'Kebab Express', 'Peri Peri Grill', 'Pizza & Chicken', 'Golden Fry',
  'Phone Repairs & Unlocking', 'Fresh Cuts Barbers', 'Money Transfer', 'Ink & Iron Tattoo', 'Bubbles Launderette',
  'Cloud Nine Vapes', 'Print & Copy Centre', 'Halal Butchers', 'Yard Jerk Spot', 'Second Spin Records',
]
const FASCIA = [
  { bg: '#1E2F4A', fg: '#F3E6C4' }, { bg: '#3A1F28', fg: '#F3E6C4' }, { bg: '#1F3B2E', fg: '#F3E6C4' }, { bg: '#C9A227', fg: '#1C1A17' },
  { bg: '#B5442E', fg: '#FFFFFF' }, { bg: '#23262B', fg: '#FFD27A' }, { bg: '#ECE6D8', fg: '#2A2522' }, { bg: '#2D5B7A', fg: '#FFFFFF' },
]
const LIGHTS = ['#E9B77A', '#E2C08E', '#D8C3A0', '#E8A964', '#C9C2AE']
const AWNINGS = ['#7A2E2E', '#2E5A3A', '#2B3F66', '#6B4A1E', '#3A3A3A']

function shopfrontOf(tags: Record<string, string>, styleId: string, key: string, front: Front | null) {
  if (!front || front.width < 4.5 || styleId === 'parking' || styleId === 'civic') return null
  const kind = tags.shop ?? tags.amenity ?? ''
  const tagged = Boolean(tags.shop) || SHOP_AMENITIES.has(tags.amenity) || tags.building === 'retail'
  const onHighStreet = HIGH_STREETS.has(front.street) && styleId !== 'industrial' && styleId !== 'office'
  if (!tagged && !onHighStreet) return null
  const pick = <T,>(list: T[], salt: string) => list[Math.floor(hashOf(key + salt) * list.length)]
  const vacant = tags.shop === 'vacant' || tags.disused === 'yes'
  const name = vacant ? null : tags.name ?? (tagged && !onHighStreet ? null : pick(INVENTED, 'n'))
  const fascia = pick(FASCIA, 'f')
  return {
    width: Math.min(front.width - 1, 14),
    name,
    bg: fascia.bg,
    fg: fascia.fg,
    light: pick(LIGHTS, 'l'),
    shutter: vacant || (!tags.name && hashOf(key + 'sh') < 0.2), // some shops are closed up for the night
    awning: FOOD.has(kind) ? pick(AWNINGS, 'a') : null,
  }
}

// ---- Roads ----
function strip(points: THREE.Vector2[], width: number, offset: number, y: number, side = 1) {
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const direction = points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)])
    if (direction.lengthSq() === 0) continue
    direction.normalize()
    const nx = -direction.y * side
    const nz = direction.x * side
    const cx = current.x + nx * offset
    const cz = current.y + nz * offset
    positions.push(cx + (nx * width) / 2, y, cz + (nz * width) / 2, cx - (nx * width) / 2, y, cz - (nz * width) / 2)
  }
  for (let i = 0; i < positions.length / 3 - 2; i += 2) indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Dashed paint (2 m line, 3 m gap) along the road, `offset` metres from its centre. */
function dashes(points: THREE.Vector2[], offset: number, dash = 2, gap = 3, width = 0.14, y = 0.036) {
  const positions: number[] = []
  const indices: number[] = []
  const period = dash + gap
  let travelled = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const length = a.distanceTo(b)
    if (length === 0) continue
    const dx = (b.x - a.x) / length
    const dz = (b.y - a.y) / length
    const nx = -dz * (width / 2)
    const nz = dx * (width / 2)
    const ox = -dz * offset
    const oz = dx * offset
    let s = 0
    while (s < length) {
      const phase = (travelled + s) % period
      if (phase < dash) {
        const end = Math.min(length, s + (dash - phase))
        const x0 = a.x + dx * s + ox
        const z0 = a.y + dz * s + oz
        const x1 = a.x + dx * end + ox
        const z1 = a.y + dz * end + oz
        const base = positions.length / 3
        positions.push(x0 + nx, y, z0 + nz, x0 - nx, y, z0 - nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz)
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
        s = end
      } else s += period - phase
    }
    travelled += length
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function roadParts(feature: Feature) {
  const p = feature.properties
  const highway = p.highway
  const isRoadway = CARRIAGEWAYS.has(highway)
  const width = isRoadway ? roadWidth(p) : highway === 'pedestrian' ? 4 : highway === 'footway' ? 1.8 : 3
  const points = (feature.geometry.coordinates as number[][]).map(([lon, lat]) => {
    const [x, z] = toWorld(lon, lat)
    return new THREE.Vector2(x, z)
  })
  const lanes = laneCount(p)
  const lineOffsets: number[] = []
  if (isRoadway && !['service', 'living_street', 'residential'].includes(highway) && width >= 5) {
    if (isOneway(p)) for (let k = 1; k < lanes; k++) lineOffsets.push((k - lanes / 2) * (width / lanes))
    else lineOffsets.push(0)
  }
  const hasSidewalks = !['footway', 'pedestrian', 'steps', 'cycleway'].includes(highway)
  return {
    surface: paint(strip(points, width, 0, 0.02), ROAD_COLOUR[highway] ?? '#66676A'),
    isRoadway,
    markings: lineOffsets.map((o) => dashes(points, o)),
    sidewalks: hasSidewalks ? [-1, 1].map((side) => paint(strip(points, 2, width / 2 + 1, 0.045, side), '#B9B5AB')) : [],
    kerbs: hasSidewalks ? [-1, 1].map((side) => strip(points, 0.18, width / 2 + 0.09, 0.075, side)) : [],
  }
}

// ---- One block ----
function instanced(boxes: Box[], material: THREE.Material) {
  if (!boxes.length) return null
  const mesh = new THREE.InstancedMesh(UNIT_BOX, material, boxes.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  boxes.forEach((b, i) => {
    if (b.rx) q.setFromEuler(euler.set(b.rx, b.ry, 0))
    else q.setFromAxisAngle(up, b.ry)
    m.compose(pos.set(b.x, b.y, b.z), q, scale.set(b.sx, b.sy, b.sz))
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, tmpColour.set(b.colour))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

/** All of a block's signs painted onto one sheet, and their planes merged into one mesh. */
function signSheet(signs: SignPart[]) {
  if (!signs.length) return null
  const COLS = 4
  const list = signs.slice(0, COLS * 40)
  const rows = Math.ceil(list.length / COLS)
  const canvas = document.createElement('canvas')
  canvas.width = SIGN_W * COLS
  canvas.height = SIGN_H * rows
  const ctx = canvas.getContext('2d')!
  const planes = list.map((s, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    paintSign(ctx, col * SIGN_W, row * SIGN_H, s.name, s.bg, s.fg)
    const plane = new THREE.PlaneGeometry(s.w, s.h)
    const uv = plane.getAttribute('uv') as THREE.BufferAttribute
    const u0 = col / COLS
    const u1 = (col + 1) / COLS
    const vTop = 1 - row / rows
    const vBottom = 1 - (row + 1) / rows
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), vBottom + uv.getY(k) * (vTop - vBottom))
    plane.applyMatrix4(s.matrix)
    return plane
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const geo = merged(planes)
  if (!geo) return null
  // lit signs: a touch over-bright so they glow at night (v41)
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.2, 1.2, 1.2), toneMapped: false }))
}

function buildBlock(features: { feature: Feature; index: number }[], roads: RoadIndex) {
  const group = new THREE.Group()
  const brick: THREE.BufferGeometry[] = []
  const plain: THREE.BufferGeometry[] = []
  const lit: Box[] = []
  const dark: Box[] = []
  const doors: Box[] = []
  const glow: Box[] = []
  const signs: SignPart[] = []
  const asphalt: THREE.BufferGeometry[] = []
  const paving: THREE.BufferGeometry[] = []
  const kerbs: THREE.BufferGeometry[] = []
  const markings: THREE.BufferGeometry[] = []

  for (const { feature, index } of features) {
    if (feature.geometry.type === 'Polygon') {
      const b = buildingParts(feature, index, roads)
      ;(b.brick ? brick : plain).push(b.body)
      ;(b.lit ? lit : dark).push(...b.windows)
      doors.push(...b.doors)
      glow.push(...b.glow)
      if (b.sign) signs.push(b.sign)
    } else {
      const r = roadParts(feature)
      ;(r.isRoadway ? asphalt : paving).push(r.surface)
      paving.push(...r.sidewalks)
      kerbs.push(...r.kerbs)
      markings.push(...r.markings)
    }
  }

  const add = (geo: THREE.BufferGeometry | null, material: THREE.Material, shadows = false) => {
    if (!geo) return
    const mesh = new THREE.Mesh(geo, material)
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
    group.add(mesh)
  }
  add(merged(brick), MAT.brick, true)
  add(merged(plain), MAT.plain, true)
  add(merged(asphalt), MAT.asphalt)
  add(merged(paving), MAT.paving)
  add(merged(kerbs), MAT.kerb)
  add(merged(markings), MAT.marking)
  for (const mesh of [instanced(lit, MAT.windowLit), instanced(dark, MAT.windowDark), instanced(doors, MAT.door), instanced(glow, MAT.shopGlow), signSheet(signs)]) if (mesh) group.add(mesh)

  // Nothing in a block ever moves
  group.traverse((o) => {
    o.updateMatrix()
    o.matrixAutoUpdate = false
  })
  return group
}

function Block({ features, roads }: { features: { feature: Feature; index: number }[]; roads: RoadIndex }) {
  const group = useMemo(() => buildBlock(features, roads), [features, roads])
  useEffect(
    () => () => {
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose()
        else if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const m = o.material as THREE.MeshBasicMaterial
          if (m.map) {
            m.map.dispose()
            m.dispose()
          }
        }
      })
    },
    [group],
  )
  return <primitive object={group} />
}

/** Every building and street in the map files, grouped into blocks; only blocks near the player are built. */
export function CityBlocks({ features }: { features: Feature[] }) {
  const blocks = useMemo(() => {
    const cells = new Map<string, { feature: Feature; index: number }[]>()
    const bounds = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>()
    features.forEach((feature, index) => {
      const isBuilding = feature.geometry.type === 'Polygon' && feature.properties.building
      const isRoad = feature.geometry.type === 'LineString' && feature.properties.highway
      if (!isBuilding && !isRoad) return
      if (isBuilding && LANDMARK_IDS.has(featureId(feature as never))) return // drawn by <Landmarks />
      const coords: number[][] = isBuilding ? feature.geometry.coordinates[0] : feature.geometry.coordinates
      const s: Spot = spotOf(coords.map(([lon, lat]) => toWorld(lon, lat)))
      const key = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`
      if (!cells.has(key)) {
        cells.set(key, [])
        bounds.set(key, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
      }
      cells.get(key)!.push({ feature, index })
      const b = bounds.get(key)!
      b.minX = Math.min(b.minX, s.x - s.r)
      b.maxX = Math.max(b.maxX, s.x + s.r)
      b.minZ = Math.min(b.minZ, s.z - s.r)
      b.maxZ = Math.max(b.maxZ, s.z + s.r)
    })
    const keys = [...cells.keys()]
    return {
      keys,
      members: keys.map((k) => cells.get(k)!),
      spots: keys.map((k) => {
        const b = bounds.get(k)!
        return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, r: Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 }
      }),
    }
  }, [features])

  const roads = useMemo(() => roadIndex(features), [features])
  const near = useNearby(blocks.spots)
  return (
    <group>
      {blocks.keys.map((key, i) => (near.has(i) ? <Block key={key} features={blocks.members[i]} roads={roads} /> : null))}
    </group>
  )
}

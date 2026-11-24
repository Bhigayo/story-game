
import { loadDistricts } from './districts'
import { roadWidth } from './roadWidth'
import { useEffect, useMemo, useState } from 'react'
import { useNearby } from './nearby'
import * as THREE from 'three'
import { glowTexture } from './glow'
import { onDayNight, onDayNightColour } from './daylight'
import { CARRIAGEWAYS } from './roadWidth'
import { hashOf } from './buildingStyle'
import { HIGH_STREETS } from './CityChunks'

type RoadFeature = {
  properties: Record<string, string>
  geometry: {
    type: string
    coordinates: number[][]
  }
}

type GeoJSONData = {
  features: RoadFeature[]
}

const CENTRE_LON = -1.8850989
const CENTRE_LAT = 52.4759448

function toWorld(lon: number, lat: number): [number, number] {
  const x =
    (lon - CENTRE_LON) *
    111320 *
    Math.cos(CENTRE_LAT * Math.PI / 180)

  const z = -(lat - CENTRE_LAT) * 110540

  return [x, z]
}

const LAMP_HOT = new THREE.Color('#FFD08A').multiplyScalar(3)
const LEAVES = ['#4F7A3C', '#5E8A3E', '#7A8F36', '#B8742E', '#3F6B3F']

// ---- The kit (v39) ----
// Each kind of street furniture is a list of parts. Every part is drawn for all the nearby items of
// that kind in ONE instanced draw call (all lamp poles together, all tree canopies together...), where
// before each lamp, tree, bollard and shelter was 2 to 7 separate meshes with their own materials.
type Kind = 'lamp' | 'bollard' | 'tree' | 'shelter' | 'bin'
const STOP_EVERY = 250 // metres between bus stops on a main road
const BIN_EVERY = 45 // metres between bins on a high street
type Item = { kind: Kind; p: [number, number, number]; rot?: number }
type Part = {
  geo: THREE.BufferGeometry
  mat: THREE.Material
  cast?: boolean
  /** position (and optional scale, flat = lie on the ground) of this part in the item's own space */
  at: (it: Item) => { pos: [number, number, number]; scale?: [number, number, number]; flat?: boolean; spin?: number }
  colour?: (it: Item) => string
}

const seedOf = (it: Item) => Math.floor(Math.abs(it.p[0] * 7 + it.p[2] * 13))
const treeH = (it: Item) => 4.2 + (seedOf(it) % 7) * 0.35
const dark = new THREE.MeshStandardMaterial({ color: '#30343A', metalness: 0.6, roughness: 0.4 })
const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true })
const pool = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#FFA94D', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
const lampHot = new THREE.MeshBasicMaterial({ color: LAMP_HOT.clone(), toneMapped: false })
// Street lamps are off by day, on at dusk (v46)
onDayNight(pool, 'opacity', 0, 0.5)
onDayNightColour(lampHot.color, 0.12, 1)

const BIN_BODY = new THREE.CylinderGeometry(0.27, 0.24, 0.9, 12)
const BIN_LID = new THREE.CylinderGeometry(0.29, 0.29, 0.07, 12)
const BIN_MAT = new THREE.MeshStandardMaterial({ color: '#1F3A2C', roughness: 0.7 })

const PARTS: Record<Kind, Part[]> = {
  lamp: [
    { geo: new THREE.CylinderGeometry(0.07, 0.11, 6, 10), mat: dark, cast: true, at: () => ({ pos: [0, 3, 0] }) },
    { geo: new THREE.BoxGeometry(0.85, 0.09, 0.09), mat: dark, at: () => ({ pos: [0.38, 5.85, 0] }) },
    { geo: new THREE.BoxGeometry(0.4, 0.16, 0.25), mat: new THREE.MeshStandardMaterial({ color: '#34383C' }), at: () => ({ pos: [0.78, 5.75, 0] }) },
    // the light itself: over-bright so the bloom picks it up
    { geo: new THREE.BoxGeometry(0.28, 0.025, 0.16), mat: lampHot, at: () => ({ pos: [0.78, 5.65, 0] }) },
    // pool of light on the pavement
    { geo: new THREE.PlaneGeometry(11, 11), mat: pool, at: () => ({ pos: [0.78, 0.07, 0], flat: true }) },
    { geo: new THREE.CylinderGeometry(0.2, 0.23, 0.36, 10), mat: new THREE.MeshStandardMaterial({ color: '#41464B' }), at: () => ({ pos: [0, 0.18, 0] }) },
  ],
  tree: [
    // unit-height trunk, stretched to each tree's height
    { geo: new THREE.CylinderGeometry(0.13, 0.2, 1, 7), mat: new THREE.MeshStandardMaterial({ color: '#4A3626', roughness: 1 }), cast: true, at: (it) => ({ pos: [0, treeH(it) * 0.3, 0], scale: [1, treeH(it) * 0.6, 1], spin: seedOf(it) }) },
    { geo: new THREE.IcosahedronGeometry(1.7, 1), mat: leafMat, cast: true, colour: (it) => LEAVES[seedOf(it) % LEAVES.length], at: (it) => ({ pos: [0, treeH(it) * 0.72, 0], spin: seedOf(it) }) },
    { geo: new THREE.IcosahedronGeometry(1.1, 1), mat: leafMat, cast: true, colour: (it) => LEAVES[seedOf(it) % LEAVES.length], at: (it) => ({ pos: [0.9, treeH(it) * 0.6, 0.3], spin: seedOf(it) }) },
    { geo: new THREE.IcosahedronGeometry(1.0, 1), mat: leafMat, cast: true, colour: (it) => LEAVES[seedOf(it) % LEAVES.length], at: (it) => ({ pos: [-0.7, treeH(it) * 0.85, -0.5], spin: seedOf(it) }) },
  ],
  bollard: [
    { geo: new THREE.CylinderGeometry(0.12, 0.15, 0.9, 12), mat: new THREE.MeshStandardMaterial({ color: '#30343A', metalness: 0.5, roughness: 0.5 }), cast: true, at: () => ({ pos: [0, 0.48, 0] }) },
    { geo: new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), mat: new THREE.MeshStandardMaterial({ color: '#C5A46A', metalness: 0.5 }), at: () => ({ pos: [0, 0.92, 0] }) },
  ],
  // a glass bus shelter: the open side faces the road (local -z), the back panel is local +z
  shelter: [
    { geo: new THREE.BoxGeometry(3.2, 0.1, 1.6), mat: new THREE.MeshStandardMaterial({ color: '#30343A' }), cast: true, at: () => ({ pos: [0, 2.5, 0] }) },
    { geo: new THREE.BoxGeometry(0.07, 2.5, 0.07), mat: dark, at: () => ({ pos: [-1.5, 1.25, 0.7] }) },
    { geo: new THREE.BoxGeometry(0.07, 2.5, 0.07), mat: dark, at: () => ({ pos: [1.5, 1.25, 0.7] }) },
    { geo: new THREE.BoxGeometry(3.0, 2.2, 0.04), mat: new THREE.MeshStandardMaterial({ color: '#A9C7D1', transparent: true, opacity: 0.35, roughness: 0.1 }), at: () => ({ pos: [0, 1.25, 0.72] }) },
    { geo: new THREE.BoxGeometry(2.2, 0.07, 0.4), mat: new THREE.MeshStandardMaterial({ color: '#8A6B4A' }), at: () => ({ pos: [0, 0.5, 0.45] }) },
    { geo: new THREE.BoxGeometry(0.5, 0.5, 0.05), mat: new THREE.MeshStandardMaterial({ color: '#C8312B', emissive: '#5A1210', emissiveIntensity: 0.5 }), at: () => ({ pos: [-1.1, 2.0, 0.72] }) },
    // the bus stop flag on its pole, at the kerb end of the shelter (v41)
    { geo: new THREE.CylinderGeometry(0.045, 0.045, 3, 8), mat: dark, at: () => ({ pos: [2.3, 1.5, -0.35] }) },
    { geo: new THREE.BoxGeometry(0.06, 0.42, 0.55), mat: new THREE.MeshStandardMaterial({ color: '#C8312B', emissive: '#7A1A14', emissiveIntensity: 0.6 }), at: () => ({ pos: [2.3, 2.75, -0.35] }) },
    // and a bin beside it
    { geo: BIN_BODY, mat: BIN_MAT, cast: true, at: () => ({ pos: [-2.25, 0.45, 0.2] }) },
    { geo: BIN_LID, mat: dark, at: () => ({ pos: [-2.25, 0.93, 0.2] }) },
  ],
  bin: [
    { geo: BIN_BODY, mat: BIN_MAT, cast: true, at: () => ({ pos: [0, 0.45, 0] }) },
    { geo: BIN_LID, mat: dark, at: () => ({ pos: [0, 0.93, 0] }) },
  ],
}

// The glow round each lamp: one cloud of points for every lamp in view (sprites can't be batched)
const glowMat = new THREE.PointsMaterial({ map: glowTexture(), color: '#FFB45A', size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
onDayNight(glowMat, 'opacity', 0, 0.62)

/** Builds the instanced meshes for a set of items. */
function buildKit(items: Item[]) {
  const group = new THREE.Group()
  const m = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()
  const c = new THREE.Color()
  for (const kind of Object.keys(PARTS) as Kind[]) {
    const mine = items.filter((it) => it.kind === kind)
    if (!mine.length) continue
    for (const part of PARTS[kind]) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, mine.length)
      mesh.castShadow = Boolean(part.cast)
      mine.forEach((it, i) => {
        const a = part.at(it)
        // the item's place and turn, then the part's place within the item
        m.compose(v.set(it.p[0], it.p[1], it.p[2]), q.setFromAxisAngle(up, (it.rot ?? 0) + (a.spin ?? 0)), s.set(1, 1, 1))
        local.compose(v.set(...a.pos), a.flat ? flatQ : q.identity(), s.set(...(a.scale ?? [1, 1, 1])))
        mesh.setMatrixAt(i, m.multiply(local))
        if (part.colour) mesh.setColorAt(i, c.set(part.colour(it)))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
  }
  const lamps = items.filter((it) => it.kind === 'lamp')
  if (lamps.length) {
    const pts = new Float32Array(lamps.length * 3)
    lamps.forEach((it, i) => pts.set([it.p[0] + 0.78, 5.5, it.p[2]], i * 3))
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    group.add(new THREE.Points(geo, glowMat))
  }
  return group
}

export default function StreetFurniture() {
  const [data, setData] = useState<GeoJSONData | null>(null)

  useEffect(() => {
    loadDistricts()
      .then(setData)
      .catch(console.error)
  }, [])

  if (!data) return null

  return <Items data={data} />
}

function Items({ data }: { data: GeoJSONData }) {
  const { lamps, bollards, shelters, trees, bins } = useMemo(() => {
  const trees: [number, number, number][] = []
  // Footprints, so a tree is never planted inside a building
  const footprints = data.features
    .filter((f) => f.geometry.type === 'Polygon' && f.properties.building)
    .map((f) => {
      const ring = (f.geometry.coordinates as unknown as number[][][])[0].map(([lo, la]) => toWorld(lo, la))
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
      return { ring, x0, x1, z0, z1 }
    })
  const inBuilding = (x: number, z: number) => {
    for (const f of footprints) {
      if (x < f.x0 - 2 || x > f.x1 + 2 || z < f.z0 - 2 || z > f.z1 + 2) continue
      let inside = false
      for (let a = 0, b = f.ring.length - 1; a < f.ring.length; b = a++) {
        const [xa, za] = f.ring[a], [xb, zb] = f.ring[b]
        if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside
      }
      // Also keep a metre clear of the walls
      if (inside) return true
      for (let a = 0, b = f.ring.length - 1; a < f.ring.length; b = a++) {
        const [xa, za] = f.ring[a], [xb, zb] = f.ring[b]
        const dx = xb - xa, dz = zb - za, l2 = dx * dx + dz * dz || 1
        const t = Math.max(0, Math.min(1, ((x - xa) * dx + (z - za) * dz) / l2))
        if (Math.hypot(x - (xa + t * dx), z - (za + t * dz)) < 2.2) return true
      }
    }
    return false
  }
  const lamps: [number, number, number][] = []
  const bollards: [number, number, number][] = []
  const shelters: [number, number, number, number][] = []
  const bins: [number, number, number][] = []
  const seen = new Set<unknown>()
  let stopCount = 0

  data.features.forEach((feature) => {
    const highway = feature.properties.highway
    const id = (feature as { id?: unknown }).id
    if (id !== undefined) {
      if (seen.has(id)) return // roads on a district edge are in both map files
      seen.add(id)
    }
    const furnished = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified'].includes(highway)
    const highStreet = HIGH_STREETS.has(feature.properties.name ?? '')
    if (feature.geometry.type !== 'LineString' || (!furnished && !highStreet)) return

    const coordinates = feature.geometry.coordinates
    let travelled = 0 // metres along this road so far
    let nextStop = 90 + hashOf(String(id ?? coordinates[0])) * 160 // first bus stop somewhere in the first 90-250 m

    for (let i = 0; i < coordinates.length - 1; i++) {
      const [x1, z1] = toWorld(coordinates[i][0], coordinates[i][1])
      const [x2, z2] = toWorld(coordinates[i + 1][0], coordinates[i + 1][1])

      const dx = x2 - x1
      const dz = z2 - z1
      const length = Math.hypot(dx, dz)
      if (length < 0.01) continue
      const nx = -dz / length
      const nz = dx / length

      if (furnished && length >= 12) {
      // Street lamps approximately every 30 metres.
      if (i % 2 === 0 && length > 25) {
        lamps.push([
          (x1 + x2) / 2 + nx * (roadWidth(feature.properties) / 2 + 2),
          0,
          (z1 + z2) / 2 + nz * (roadWidth(feature.properties) / 2 + 2),
        ])
      }

      // Bus stops on the main roads about every 250 m, alternating sides, facing the carriageway (v41).
      // Each stop is a shelter with a flag and a bin (the kit draws all three).
      if (['primary', 'secondary', 'tertiary'].includes(highway) && length > 14 && !feature.properties.tunnel) {
        const width = roadWidth(feature.properties)
        for (let s = nextStop - travelled; s < length - 6; s += STOP_EVERY) {
          if (s < 6) continue
          nextStop = travelled + s + STOP_EVERY
          const side = stopCount++ % 2 === 0 ? 1 : -1
          const off = side * (width / 2 + 1.6)
          const t = s / length
          const sx = x1 + dx * t + nx * off
          const sz = z1 + dz * t + nz * off
          if (!inBuilding(sx, sz)) shelters.push([sx, 0, sz, Math.atan2(nx * side, nz * side)])
        }
      }
      // Litter bins along the high streets (v41)
      if (HIGH_STREETS.has(feature.properties.name ?? '') && length > 10) {
        const width = CARRIAGEWAYS.has(highway) ? roadWidth(feature.properties) : 4
        for (let s = 22 - ((travelled + 22) % BIN_EVERY) + BIN_EVERY / 2; s < length; s += BIN_EVERY) {
          if (s < 0) continue
          const side = Math.floor((travelled + s) / BIN_EVERY) % 2 === 0 ? 1 : -1
          const off = side * (width / 2 + (CARRIAGEWAYS.has(highway) ? 0.9 : -0.6))
          const t = s / length
          const bx = x1 + dx * t + nx * off
          const bz = z1 + dz * t + nz * off
          if (!inBuilding(bx, bz)) bins.push([bx, 0, bz])
        }
      }
      travelled += length
      while (nextStop < travelled) nextStop += STOP_EVERY

      // Street trees on the far pavement, in gaps between lamps
      if ((highway === 'residential' || highway === 'tertiary' || highway === 'unclassified') && i % 3 === 1 && length > 16) {
        const tx = (x1 + x2) / 2 - nx * 6.2
        const tz = (z1 + z2) / 2 - nz * 6.2
        if (!inBuilding(tx, tz)) trees.push([tx, 0, tz])
      }

      // Bollards at selected roadside locations.
      if (i === 0 && length > 15) {
        bollards.push([
          x1 + nx * 6,
          0,
          z1 + nz * 6,
        ])
      }
      }

    }
  })

    return { lamps, bollards, shelters, trees, bins }
  }, [data])

  const items = useMemo<Item[]>(
    () => [
      ...lamps.map((p) => ({ kind: 'lamp' as const, p })),
      ...bollards.map((p) => ({ kind: 'bollard' as const, p })),
      ...trees.map((p) => ({ kind: 'tree' as const, p })),
      ...shelters.map((p) => ({ kind: 'shelter' as const, p: [p[0], p[1], p[2]] as [number, number, number], rot: p[3] })),
      ...bins.map((p) => ({ kind: 'bin' as const, p })),
    ],
    [lamps, bollards, shelters, trees, bins],
  )
  const spots = useMemo(() => items.map(({ p }) => ({ x: p[0], z: p[2], r: 0 })), [items])
  const near = useNearby(spots)
  const group = useMemo(() => buildKit(items.filter((_, i) => near.has(i))), [items, near])
  useEffect(
    () => () => {
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose()
        else if (o instanceof THREE.Points) o.geometry.dispose()
      })
    },
    [group],
  )
  return <primitive object={group} />
}

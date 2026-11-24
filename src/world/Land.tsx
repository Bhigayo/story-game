import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toWorld } from './geo'
import { focus } from './focus'

// The ground of the city: water, railways, parks and land use, drawn from the map file.
// Everything here is flat and sits just above the ground plane (roads sit at 0.02, buildings on top).

type Feature = { properties: Record<string, string>; geometry: { type: string; coordinates: any } }

const LAND_COLOURS: Record<string, string> = {
  industrial: '#5C5A5E',
  retail: '#69666B',
  commercial: '#66646A',
  residential: '#615F5C',
  railway: '#4A4743',
  construction: '#7A6A58',
  brownfield: '#6E6552',
  grass: '#55704A',
  flowerbed: '#587A4A',
  recreation_ground: '#55704A',
  village_green: '#55704A',
  cemetery: '#52694A',
}
const LEISURE_COLOURS: Record<string, string> = { park: '#4F7A47', garden: '#587A4A', pitch: '#4C7A55', playground: '#7A6F8A' }

/** What kind of ground feature is this? Null if we don't draw it. */
export function landKind(f: Feature): 'area' | 'water' | 'waterway' | 'rail' | 'tram' | null {
  const p = f.properties
  if (f.geometry.type === 'Polygon') {
    if (p.building) return null
    if (p.natural === 'water' || p.water) return 'water'
    if (p.landuse || p.leisure || p.railway === 'platform') return 'area'
    return null
  }
  if (f.geometry.type === 'LineString') {
    if (p.tunnel === 'yes' || p.tunnel === 'building_passage') return null
    if (['canal', 'river', 'stream', 'drain'].includes(p.waterway)) return 'waterway'
    if (p.railway === 'rail') return 'rail'
    if (p.railway === 'tram' || p.railway === 'light_rail') return 'tram'
  }
  return null
}

const isRaised = (p: Record<string, string>) => ['yes', 'viaduct'].includes(p.bridge) || Number(p.layer) >= 1

/** A flat strip along a line, `width` wide, `offset` to the side, lying at height y. */
function ribbon(points: THREE.Vector2[], width: number, y: number, offset = 0) {
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dz = b.y - a.y
    const len = Math.hypot(dx, dz)
    if (len < 0.01) continue
    const nx = -dz / len
    const nz = dx / len
    const o0 = offset - width / 2
    const o1 = offset + width / 2
    const base = pos.length / 3
    pos.push(a.x + nx * o0, y, a.y + nz * o0, a.x + nx * o1, y, a.y + nz * o1, b.x + nx * o0, y, b.y + nz * o0, b.x + nx * o1, y, b.y + nz * o1)
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const toPoints = (coords: number[][]) => coords.map(([lon, lat]) => {
  const [x, z] = toWorld(lon, lat)
  return new THREE.Vector2(x, z)
})

function Area({ f }: { f: Feature }) {
  const p = f.properties
  const geometry = useMemo(() => {
    const rings: THREE.Vector2[][] = f.geometry.coordinates.map((r: number[][]) => toPoints(r).map((v) => new THREE.Vector2(v.x, -v.y)))
    const shape = new THREE.Shape(rings[0])
    for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(hole))
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(-Math.PI / 2)
    return g
  }, [f])
  const water = p.natural === 'water' || p.water
  const colour = water ? '#1F3F4F' : LEISURE_COLOURS[p.leisure] ?? LAND_COLOURS[p.landuse] ?? (p.railway === 'platform' ? '#9A968E' : '#6F6C72')
  const layer = water ? 3 : p.leisure ? 2 : 1
  const y = p.railway === 'platform' ? 0.14 : 0.004 * layer
  return (
    <mesh geometry={geometry} position={[0, y, 0]} receiveShadow>
      <meshStandardMaterial
        color={colour}
        roughness={water ? 0.25 : 1}
        metalness={water ? 0.3 : 0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function Waterway({ f }: { f: Feature }) {
  const width = f.properties.waterway === 'river' ? 14 : f.properties.waterway === 'canal' ? 7 : 3
  const geometry = useMemo(() => ribbon(toPoints(f.geometry.coordinates), width, 0.006), [f, width])
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#1F3F4F" roughness={0.25} metalness={0.3} side={THREE.DoubleSide} />
    </mesh>
  )
}

const brick = new THREE.MeshStandardMaterial({ color: '#6B4A40', roughness: 0.9 })
const ballast = new THREE.MeshStandardMaterial({ color: '#3C3935', roughness: 1, side: THREE.DoubleSide })
const steel = new THREE.MeshStandardMaterial({ color: '#9A9DA3', roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide })
const pierGeo = new THREE.BoxGeometry(1.8, 1, 3.4)

/** Distance from a point to a polyline. */
function distToLine(pts: THREE.Vector2[], x: number, z: number) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dz = b.y - a.y
    const l2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / l2))
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.y + dz * t)))
  }
  return best
}

function Railway({ f }: { f: Feature }) {
  const tram = f.properties.railway !== 'rail'
  const raised = !tram && isRaised(f.properties)
  const y = raised ? 6.4 : 0.012
  // A viaduct fades out while you are underneath or beside it, so it never blocks the camera
  const mats = useMemo(
    () => (raised ? { bed: ballast.clone(), brick: brick.clone(), fade: 1 } : null),
    [raised],
  )
  const linePts = useMemo(() => (raised ? toPoints(f.geometry.coordinates) : null), [f, raised])
  const { bed, rails, piers } = useMemo(() => {
    const pts = toPoints(f.geometry.coordinates)
    const piers: { x: number; z: number; ry: number }[] = []
    if (raised) {
      let carry = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x
        const dz = pts[i + 1].y - pts[i].y
        const len = Math.hypot(dx, dz)
        for (let t = 7 - carry; t < len; t += 14) {
          piers.push({ x: pts[i].x + (dx / len) * t, z: pts[i].y + (dz / len) * t, ry: Math.atan2(dx, dz) })
          carry = (len - t) % 14
        }
      }
    }
    // both rails in one mesh (v39)
    const rails = mergeGeometries([ribbon(pts, 0.1, y + 0.05, -0.72), ribbon(pts, 0.1, y + 0.05, 0.72)])
    return {
      bed: tram ? null : ribbon(pts, raised ? 4.6 : 3.4, y),
      rails,
      piers,
    }
  }, [f, tram, raised, y])
  // All of this viaduct's piers in one draw call (v39); they share its fading brick material
  const pierMesh = useMemo(() => {
    if (!piers.length) return null
    const mesh = new THREE.InstancedMesh(pierGeo, mats?.brick ?? brick, piers.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    piers.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, 3.15, p.z), q.setFromAxisAngle(up, p.ry), new THREE.Vector3(1, 6.3, 1))))
    mesh.castShadow = true
    mesh.computeBoundingSphere()
    return mesh
  }, [piers, mats])
  useEffect(() => () => pierMesh?.dispose(), [pierMesh])
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!mats || !linePts) return
    const near = distToLine(linePts, focus.x, focus.z) < 16
    mats.fade += ((near ? 0.12 : 1) - mats.fade) * Math.min(1, delta * 6)
    for (const m of [mats.bed, mats.brick]) {
      m.transparent = mats.fade < 0.99
      m.opacity = mats.fade
      m.depthWrite = mats.fade > 0.5
    }
    if (group.current) group.current.visible = true
  })
  return (
    <group ref={group}>
      {bed ? <mesh geometry={bed} material={mats?.bed ?? ballast} receiveShadow /> : null}
      <mesh geometry={rails} material={steel} />
      {pierMesh ? <primitive object={pierMesh} /> : null}
    </group>
  )
}

export function LandFeature({ feature }: { feature: Feature }) {
  switch (landKind(feature)) {
    case 'area':
    case 'water':
      return <Area f={feature} />
    case 'waterway':
      return <Waterway f={feature} />
    case 'rail':
    case 'tram':
      return <Railway f={feature} />
    default:
      return null
  }
}

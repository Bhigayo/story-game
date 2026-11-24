import { useEffect, useMemo, useRef, useState } from 'react'
import { roadWidth } from './roadWidth'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { loadDistricts } from './districts'
import { toWorld } from './geo'
import { focus } from './focus'
import { hashOf } from './buildingStyle'

// Parked cars, litter bins and benches. Placed along the real roads, and only the ones near
// the player are drawn, so a big district stays fast.

type Item = { x: number; z: number; a: number; c: number }

const CAR_COLOURS = ['#B23A32', '#2F4F7A', '#D8D8D4', '#3A3F4A', '#7D838A', '#3F6B4B', '#C9A227', '#5B3A6B', '#A9AEB3', '#8C4A2F']

function part(geometry: THREE.BufferGeometry, colour: [number, number, number], at: [number, number, number], rotate?: [number, number, number]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  g.deleteAttribute('uv')
  if (rotate) g.rotateX(rotate[0]), g.rotateY(rotate[1]), g.rotateZ(rotate[2])
  g.translate(...at)
  const count = g.getAttribute('position').count
  const colours = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colours.set(colour, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  return g
}

function makeCar() {
  const glass: [number, number, number] = [0.1, 0.13, 0.16]
  const tyre: [number, number, number] = [0.06, 0.06, 0.07]
  const parts = [
    part(new THREE.BoxGeometry(4.2, 0.62, 1.8), [1, 1, 1], [0, 0.58, 0]),
    part(new THREE.BoxGeometry(2.2, 0.55, 1.62), [0.92, 0.92, 0.92], [-0.2, 1.15, 0]),
    part(new THREE.BoxGeometry(2.0, 0.38, 1.66), glass, [-0.2, 1.17, 0]),
    ...[[-1.35, -0.8], [-1.35, 0.8], [1.3, -0.8], [1.3, 0.8]].map(([x, z]) =>
      part(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), tyre, [x, 0.34, z], [Math.PI / 2, 0, 0])),
  ]
  return mergeGeometries(parts)!
}

function makeBin() {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.28, 0.24, 0.9, 8), [0.2, 0.28, 0.24], [0, 0.45, 0]),
    part(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 8), [0.1, 0.12, 0.12], [0, 0.92, 0]),
  ])!
}

function makeBench() {
  const wood: [number, number, number] = [0.5, 0.34, 0.2]
  const metal: [number, number, number] = [0.14, 0.15, 0.17]
  return mergeGeometries([
    part(new THREE.BoxGeometry(1.7, 0.07, 0.5), wood, [0, 0.45, 0]),
    part(new THREE.BoxGeometry(1.7, 0.5, 0.06), wood, [0, 0.75, -0.24]),
    part(new THREE.BoxGeometry(0.08, 0.45, 0.5), metal, [-0.75, 0.22, 0]),
    part(new THREE.BoxGeometry(0.08, 0.45, 0.5), metal, [0.75, 0.22, 0]),
  ])!
}

/** Draws only the items near the player, as one instanced mesh. */
function Field({
  items, geometry, colours, radius, max, shadows = true, roughness = 0.6, metalness = 0.2,
}: {
  items: Item[]
  geometry: THREE.BufferGeometry
  colours: string[]
  radius: number
  max: number
  shadows?: boolean
  roughness?: number
  metalness?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const last = useRef({ x: Infinity, z: Infinity, items: null as Item[] | null })
  const palette = useMemo(() => colours.map((c) => new THREE.Color(c)), [colours])

  useFrame(() => {
    const mesh = ref.current
    const l = last.current
    if (!mesh) return
    if (l.items === items && Math.hypot(focus.x - l.x, focus.z - l.z) < 25) return
    l.x = focus.x
    l.z = focus.z
    l.items = items

    const near = items
      .map((it) => ({ it, d: Math.hypot(it.x - focus.x, it.z - focus.z) }))
      .filter((o) => o.d <= radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, max)

    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const one = new THREE.Vector3(1, 1, 1)
    near.forEach(({ it }, i) => {
      quaternion.setFromAxisAngle(up, it.a)
      matrix.compose(new THREE.Vector3(it.x, 0, it.z), quaternion, one)
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, palette[it.c % palette.length])
    })
    mesh.count = near.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  })

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, max]} castShadow={shadows} receiveShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness} />
    </instancedMesh>
  )
}

const CAR_ROADS = new Set(['tertiary', 'unclassified', 'residential', 'service'])
const BIN_ROADS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential'])

export default function StreetLife() {
  const [data, setData] = useState<{ features: any[] } | null>(null)
  useEffect(() => {
    loadDistricts().then(setData).catch(console.error)
  }, [])

  const placed = useMemo(() => {
    const cars: Item[] = []
    const bins: Item[] = []
    const benches: Item[] = []
    if (!data) return { cars, bins, benches }

    for (const f of data.features) {
      if (f.geometry?.type !== 'LineString' || !f.properties?.highway) continue
      const hw: string = f.properties.highway
      const pts: [number, number][] = f.geometry.coordinates.map(([lon, lat]: number[]) => toWorld(lon, lat))
      const seed = String(f.id ?? f.properties['@id'] ?? pts[0].join(','))

      // Walk the road in steps so spacing is even
      let travelled = 0
      let nextCar = 7
      let nextBin = 20
      let nextBench = 14
      const total = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0)

      for (let i = 1; i < pts.length; i++) {
        const [x1, z1] = pts[i - 1]
        const [x2, z2] = pts[i]
        const len = Math.hypot(x2 - x1, z2 - z1)
        if (len < 0.5) continue
        const dx = (x2 - x1) / len
        const dz = (z2 - z1) / len
        const nx = -dz
        const nz = dx
        const angle = Math.atan2(-dz, dx)

        while (nextCar < travelled + len || nextBin < travelled + len || nextBench < travelled + len) {
          const along = Math.min(nextCar, nextBin, nextBench) - travelled
          const x = x1 + dx * along
          const z = z1 + dz * along
          const here = travelled + along
          const key = `${seed}:${Math.round(here)}`
          const edgeOk = here > 8 && here < total - 8

          if (nextCar - travelled <= along + 1e-6 && nextCar <= Math.min(nextBin, nextBench) + 1e-6) {
            const width = CAR_ROADS.has(hw) ? roadWidth(f.properties) : 0
            if (width && edgeOk && hashOf(key + 'p') < 0.42) {
              const side = hashOf(key + 's') < 0.5 ? -1 : 1
              const off = side * (width / 2 - 1.15)
              cars.push({ x: x + nx * off, z: z + nz * off, a: angle + (hashOf(key + 'r') - 0.5) * 0.08, c: Math.floor(hashOf(key + 'c') * CAR_COLOURS.length) })
            }
            nextCar += 6.5
          } else if (nextBin <= nextBench + 1e-6) {
            const width = BIN_ROADS.has(hw) ? roadWidth(f.properties) : 0
            if (width && edgeOk && hashOf(key + 'b') < 0.55) {
              const side = hashOf(key + 'q') < 0.5 ? -1 : 1
              const off = side * (width / 2 + 0.9)
              bins.push({ x: x + nx * off, z: z + nz * off, a: 0, c: 0 })
            }
            nextBin += 38
          } else {
            const isPed = hw === 'pedestrian'
            const width = isPed ? 4 : BIN_ROADS.has(hw) ? roadWidth(f.properties) : 0
            if (width && edgeOk && hashOf(key + 'n') < 0.5) {
              const side = hashOf(key + 'm') < 0.5 ? -1 : 1
              const off = side * (isPed ? width / 2 - 0.5 : width / 2 + 1.2)
              // The back of the bench faces away from the road
              benches.push({ x: x + nx * off, z: z + nz * off, a: angle + (side > 0 ? 0 : Math.PI), c: 0 })
            }
            nextBench += 45
          }
        }
        travelled += len
      }
    }
    return { cars, bins, benches }
  }, [data])

  const car = useMemo(makeCar, [])
  const bin = useMemo(makeBin, [])
  const bench = useMemo(makeBench, [])
  const white = useMemo(() => ['#FFFFFF'], [])

  if (!data) return null
  return (
    <>
      <Field items={placed.cars} geometry={car} colours={CAR_COLOURS} radius={330} max={450} metalness={0.45} roughness={0.4} />
      <Field items={placed.bins} geometry={bin} colours={white} radius={260} max={250} />
      <Field items={placed.benches} geometry={bench} colours={white} radius={260} max={200} shadows={false} />
    </>
  )
}

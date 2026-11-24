import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NetClient } from './net/NetClient'
import { stepCar, type CarSim } from './carPhysics'
import { onDayNight } from './world/daylight'

const WHEEL_R = 0.34

// Shared geometry: every car uses the same few boxes and cylinders
const geo = {
  wheel: new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 14),
  light: new THREE.BoxGeometry(0.34, 0.16, 0.06),
  stripe: new THREE.BoxGeometry(1.84, 0.16, 4.12),
  bar: new THREE.BoxGeometry(0.5, 0.12, 0.3),
}
const mat = {
  // tinted, not black: you can see who's driving (v43)
  glass: new THREE.MeshStandardMaterial({ color: '#1B2230', roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.68, depthWrite: false }),
  tyre: new THREE.MeshStandardMaterial({ color: '#17181A', roughness: 0.9 }),
  head: new THREE.MeshStandardMaterial({ color: '#FFF1C4', emissive: '#FFD98A', emissiveIntensity: 1.6 }),
  tail: new THREE.MeshStandardMaterial({ color: '#7A1010', emissive: '#FF2A2A', emissiveIntensity: 1.1 }),
  bumper: new THREE.MeshStandardMaterial({ color: '#25262A', roughness: 0.8 }),
  stripe: new THREE.MeshStandardMaterial({ color: '#1F4FB8', roughness: 0.5 }),
  sign: new THREE.MeshStandardMaterial({ color: '#FFD23A', emissive: '#FFC21A', emissiveIntensity: 1.4 }),
  person: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
}

// Headlights and tail lights: dipped by day, bright at night (v46)
onDayNight(mat.head, 'emissiveIntensity', 0.35, 2.0)
onDayNight(mat.tail, 'emissiveIntensity', 0.45, 1.3)

// ---- The vehicles (v43: cars, vans and black cabs) ----
// Local space: +z is the front, +x the car's left (UK drivers sit on the right, at -x).
type Kind = 'car' | 'van' | 'taxi'
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
const lights = (x: number, y: number, z: number) => mergeGeometries([geo.light.clone().translate(x, y, z), geo.light.clone().translate(-x, y, z)])
const CAR_SHAPE = {
  // body, roof, and the four window pillars that hold the roof up
  shell: mergeGeometries([
    box(1.8, 0.55, 4.1, 0, 0.62, 0),
    box(1.62, 0.07, 1.86, 0, 1.4, -0.25),
    ...[-1, 1].flatMap((sx) => [box(0.09, 0.5, 0.12, sx * 0.77, 1.13, 0.6), box(0.09, 0.5, 0.16, sx * 0.77, 1.13, -1.1)]),
  ]),
  glass: box(1.6, 0.5, 1.84, 0, 1.13, -0.25),
  bumpers: mergeGeometries([box(1.84, 0.2, 0.12, 0, 0.42, 2.0), box(1.84, 0.2, 0.12, 0, 0.42, -2.0)]),
  heads: lights(0.6, 0.72, 2.07),
  tails: lights(0.6, 0.72, -2.07),
  wheelX: 0.92,
  wheelZ: 1.3,
  seat: { x: -0.38, y: 0.98, z: -0.15, head: 1.22 },
}
const SHAPES: Record<Kind, typeof CAR_SHAPE> = {
  car: CAR_SHAPE,
  taxi: CAR_SHAPE,
  van: {
    // low body, a tall cargo box behind, and a glazed cab in front
    shell: mergeGeometries([
      box(1.95, 0.95, 4.9, 0, 0.8, 0),
      box(1.95, 1.0, 3.2, 0, 1.77, -0.85),
      box(1.95, 0.08, 1.66, 0, 2.23, 1.62),
      box(0.1, 0.92, 0.12, 0.93, 1.73, 2.4),
      box(0.1, 0.92, 0.12, -0.93, 1.73, 2.4),
    ]),
    glass: box(1.9, 0.92, 1.62, 0, 1.73, 1.62),
    bumpers: mergeGeometries([box(1.99, 0.22, 0.12, 0, 0.42, 2.45), box(1.99, 0.22, 0.12, 0, 0.42, -2.45)]),
    heads: lights(0.65, 0.95, 2.46),
    tails: lights(0.7, 1.0, -2.46),
    wheelX: 0.97,
    wheelZ: 1.65,
    seat: { x: -0.45, y: 1.5, z: 1.45, head: 1.86 },
  },
}
const kindOf = (k: unknown): Kind => (k === 'van' || k === 'taxi' ? k : 'car')
const TAXI_SIGN = box(0.6, 0.16, 0.24, 0, 1.52, -0.3)
const WHEEL = geo.wheel.clone().rotateZ(Math.PI / 2)
const TORSO = new THREE.BoxGeometry(0.44, 0.44, 0.3)
const HEAD = new THREE.SphereGeometry(0.12, 10, 8)
const SKINS = ['#A96F4D', '#E0B18C', '#70452F', '#C68B68', '#8B5A40', '#F0C9A8']
const TOPS = ['#2B2E33', '#315B78', '#56704F', '#6B557D', '#8B493B', '#45545C']

// ---- All vehicles drawn together (v39, v43) ----
// Each <Car> only moves invisible markers; <Fleet /> draws every vehicle's body, glass, bumpers, lights,
// wheels and driver in a few instanced calls per kind. Police stripes and light bars are still ordinary
// meshes (they flash per car, and there are only ever a few).
type FleetMember = {
  root: THREE.Object3D | null
  wheels: (THREE.Object3D | null)[]
  colour: string
  kind: Kind
  driver: () => boolean
  hp: () => number
  look: number
  placed: { current: boolean }
}
const FLEET = new Set<FleetMember>()
const SCORCH = new THREE.Color('#2A2522') // what a battered car's paint fades toward
const CHARRED = new THREE.Color('#171514') // a wreck
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)
const CAPACITY = 96

function Fleet() {
  const meshes = useMemo(() => {
    const make = (g: THREE.BufferGeometry, m: THREE.Material, n: number, shadow: boolean) => {
      const mesh = new THREE.InstancedMesh(g, m, n)
      mesh.castShadow = shadow
      mesh.frustumCulled = false // vehicles move every frame; a few meshes, not worth bounding
      mesh.count = 0
      return mesh
    }
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.35 })
    const setFor = (k: 'car' | 'van') => ({
      shell: make(SHAPES[k].shell, bodyMat, CAPACITY, true),
      glass: make(SHAPES[k].glass, mat.glass, CAPACITY, false),
      bumpers: make(SHAPES[k].bumpers, mat.bumper, CAPACITY, false),
      heads: make(SHAPES[k].heads, mat.head, CAPACITY, false),
      tails: make(SHAPES[k].tails, mat.tail, CAPACITY, false),
    })
    const perKind = { car: setFor('car'), van: setFor('van') }
    return {
      perKind,
      sign: make(TAXI_SIGN, mat.sign, CAPACITY, false),
      wheels: make(WHEEL, mat.tyre, CAPACITY * 4, true),
      torso: make(TORSO, mat.person, CAPACITY, false),
      head: make(HEAD, mat.person, CAPACITY, false),
    }
  }, [])
  const all = useMemo(() => [...Object.values(meshes.perKind).flatMap((m) => Object.values(m)), meshes.sign, meshes.wheels, meshes.torso, meshes.head], [meshes])
  useEffect(() => () => all.forEach((m) => m.dispose()), [all])
  const tmp = useMemo(() => ({ colour: new THREE.Color(), m: new THREE.Matrix4(), off: new THREE.Matrix4() }), [])

  useFrame(() => {
    const count: Record<string, number> = { car: 0, van: 0 }
    let wheels = 0
    let signs = 0
    let drivers = 0
    for (const car of FLEET) {
      if (!car.placed.current || !car.root || car.wheels.some((w) => !w)) continue // not on the street yet
      const shape = car.kind === 'van' ? 'van' : 'car' // a taxi is a car with a sign
      const n = count[shape]
      if (n >= CAPACITY) continue
      car.root.updateWorldMatrix(true, true)
      const m = car.root.matrixWorld
      const set = meshes.perKind[shape]
      for (const mesh of Object.values(set)) mesh.setMatrixAt(n, m)
      // Damage (v43, C7): the paint dulls as the car takes knocks; a wreck is charred, its lights dead
      const hp = car.hp()
      if (hp <= 0) {
        set.shell.setColorAt(n, CHARRED)
        set.heads.setMatrixAt(n, HIDDEN)
        set.tails.setMatrixAt(n, HIDDEN)
      } else set.shell.setColorAt(n, tmp.colour.set(car.colour).lerp(SCORCH, ((100 - hp) / 100) * 0.55))
      count[shape] = n + 1
      if (wheels + 4 <= CAPACITY * 4) car.wheels.forEach((w) => meshes.wheels.setMatrixAt(wheels++, w!.matrixWorld))
      if (car.kind === 'taxi' && signs < CAPACITY) meshes.sign.setMatrixAt(signs++, m)
      if (car.driver() && drivers < CAPACITY) {
        const seat = SHAPES[car.kind].seat
        meshes.torso.setMatrixAt(drivers, tmp.m.multiplyMatrices(m, tmp.off.makeTranslation(seat.x, seat.y, seat.z)))
        meshes.torso.setColorAt(drivers, tmp.colour.set(TOPS[car.look % TOPS.length]))
        meshes.head.setMatrixAt(drivers, tmp.m.multiplyMatrices(m, tmp.off.makeTranslation(seat.x, seat.head, seat.z)))
        meshes.head.setColorAt(drivers, tmp.colour.set(SKINS[car.look % SKINS.length]))
        drivers++
      }
    }
    for (const shape of ['car', 'van'] as const) for (const mesh of Object.values(meshes.perKind[shape])) mesh.count = count[shape]
    meshes.wheels.count = wheels
    meshes.sign.count = signs
    meshes.torso.count = drivers
    meshes.head.count = drivers
    for (const mesh of all) {
      mesh.visible = mesh.count > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })
  return (
    <>
      {all.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

/** One car. It glides toward the server's latest position, so 15 updates a second look smooth. */
function Car({ id, client }: { id: string; client: NetClient }) {
  const group = useRef<THREE.Group>(null)
  const placed = useRef(false)
  const sim = useRef<CarSim | null>(null) // your own car, run locally so it answers the keys at once
  const spin = useRef(0)
  const frontLeft = useRef<THREE.Group>(null)
  const frontRight = useRef<THREE.Group>(null)
  const wheels = useRef<(THREE.Group | null)[]>([])
  const police = Boolean(client.vehicles.get(id)?.p)
  const colour = client.vehicles.get(id)?.c ?? '#8F2D2D'
  const kind = kindOf(client.vehicles.get(id)?.k)
  const shape = SHAPES[kind]
  const redBar = useRef<THREE.MeshStandardMaterial>(null)
  const blueBar = useRef<THREE.MeshStandardMaterial>(null)
  // Join the fleet: <Fleet /> draws this car's body and wheels where these markers are
  useEffect(() => {
    // someone's at the wheel: a player, a traffic driver or the police
    const driver = () => {
      const s = client.vehicles.get(id)
      return Boolean(s && (s.d || s.t || s.p))
    }
    let look = 0
    for (let i = 0; i < id.length; i++) look = (look * 31 + id.charCodeAt(i)) >>> 0
    const hp = () => client.vehicles.get(id)?.hp ?? 100
    const member: FleetMember = { root: group.current, wheels: wheels.current, colour, kind, driver, hp, look, placed }
    FLEET.add(member)
    return () => {
      FLEET.delete(member)
    }
  }, [colour, kind, id, client])

  useFrame((_, delta) => {
    const s = client.vehicles.get(id)
    const g = group.current
    if (!s || !g) return

    // Dead reckoning: carry on at the last known speed until the next snapshot arrives
    const age = Math.min(0.15, (performance.now() - s.at) / 1000)
    let tx = s.x + Math.sin(s.h) * s.v * age
    let tz = s.z + Math.cos(s.h) * s.v * age
    let th = s.h
    let steerShown = s.s

    if (client.myVehicle === id) {
      // Your car: predict locally, then ease toward where the server says it should be.
      // The server's picture is about 80 ms old by the time we see it, so look that far ahead.
      const ahead = age + 0.08
      const sx = s.x + Math.sin(s.h) * s.v * ahead
      const sz = s.z + Math.cos(s.h) * s.v * ahead
      let c = sim.current
      if (!c) c = sim.current = { x: sx, z: sz, h: s.h, speed: s.v, steer: s.s }
      stepCar(c, Math.min(delta, 0.05), client.lastDrive)
      const err = Math.hypot(sx - c.x, sz - c.z)
      if (err > 6) {
        c.x = sx
        c.z = sz
        c.h = s.h
        c.speed = s.v // a crash or a teleport: trust the server
      } else {
        const pull = 1 - Math.exp(-4 * delta)
        c.x += (sx - c.x) * pull
        c.z += (sz - c.z) * pull
        c.h += Math.atan2(Math.sin(s.h - c.h), Math.cos(s.h - c.h)) * pull
        if (Math.abs(s.v - c.speed) > 2) c.speed += (s.v - c.speed) * pull // only a big disagreement (a wall)
      }
      tx = c.x
      tz = c.z
      th = c.h
      steerShown = c.steer
    } else {
      sim.current = null
    }

    if (!placed.current) {
      g.position.set(tx, 0, tz)
      g.rotation.y = s.h
      placed.current = true
    }
    const k = client.myVehicle === id ? 1 : 1 - Math.exp(-16 * delta) // your own car is not smoothed
    g.position.x += (tx - g.position.x) * k
    g.position.z += (tz - g.position.z) * k
    let turn = th - g.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    g.rotation.y += turn * k

    client.vehiclePose.set(id, { x: g.position.x, z: g.position.z, h: g.rotation.y })

    // Police light bar: red and blue take turns, but only in a chase (a patrol in traffic runs dark; v44)
    if (police && redBar.current && blueBar.current) {
      const chasing = !s.t
      const phase = Math.floor(performance.now() / 160) % 2 === 0
      redBar.current.emissiveIntensity = chasing ? (phase ? 3 : 0.1) : 0.05
      blueBar.current.emissiveIntensity = chasing ? (phase ? 0.1 : 3) : 0.05
    }

    // Wheels roll with the speed, front wheels turn with the steering (right = clockwise = negative)
    spin.current += (s.v * delta) / WHEEL_R
    for (const w of wheels.current) if (w) w.rotation.x = spin.current
    if (frontLeft.current) frontLeft.current.rotation.y = -steerShown * 0.45
    if (frontRight.current) frontRight.current.rotation.y = -steerShown * 0.45
  })

  const wheel = (x: number, z: number, i: number, steer?: React.RefObject<THREE.Group | null>) => (
    <group key={i} position={[x, WHEEL_R, z]} ref={steer}>
      <group ref={(el) => void (wheels.current[i] = el)} />
    </group>
  )

  return (
    <group ref={group}>
      {police ? (
        <>
          <mesh geometry={geo.stripe} material={mat.stripe} position={[0, 0.7, 0]} />
          <mesh geometry={geo.bar} position={[0.28, 1.5, -0.25]}>
            <meshStandardMaterial ref={redBar} color="#FF2A2A" emissive="#FF2A2A" emissiveIntensity={3} />
          </mesh>
          <mesh geometry={geo.bar} position={[-0.28, 1.5, -0.25]}>
            <meshStandardMaterial ref={blueBar} color="#2A5CFF" emissive="#2A5CFF" emissiveIntensity={0.1} />
          </mesh>
        </>
      ) : null}
      {wheel(shape.wheelX, shape.wheelZ, 0, frontRight)}
      {wheel(-shape.wheelX, shape.wheelZ, 1, frontLeft)}
      {wheel(shape.wheelX, -shape.wheelZ, 2)}
      {wheel(-shape.wheelX, -shape.wheelZ, 3)}
    </group>
  )
}

/** Every car in the city, as the server says they are. */
export function Vehicles({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  return (
    <>
      <Fleet />
      {[...client.vehicles.keys()].map((id) => (
        <Car key={id} id={id} client={client} />
      ))}
    </>
  )
}

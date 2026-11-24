// People on the pavements (v42). The server walks them (server/pedestrians.mjs) so every player sees the
// same people, cars stop for them and hitting one matters; this draws them. Each person is a set of
// invisible markers that swing with the walk, and <Crowd /> draws everyone's body parts in one instanced
// call per part (v39).
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NetClient } from '../net/NetClient'

const CROWD = 60 // most people drawn at once

const APPEARANCES = [
  { skin: '#A96F4D', shirt: '#315B78', hair: '#211A17' },
  { skin: '#E0B18C', shirt: '#8B493B', hair: '#4A3024' },
  { skin: '#70452F', shirt: '#56704F', hair: '#171514' },
  { skin: '#C68B68', shirt: '#6B557D', hair: '#30221C' },
  { skin: '#8B5A40', shirt: '#B28A48', hair: '#171514' },
  { skin: '#F0C9A8', shirt: '#45545C', hair: '#76543A' },
]

/** One person, following the server: walks, waits at the kerb, hurries across, jumps clear, or lies hurt. */
function Person({ id, client }: { id: string; client: NetClient }) {
  const person = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const pose = useRef({ x: 0, z: 0, h: 0, placed: false, phase: Math.random() * 6, fall: 0 })
  const look = client.peds.get(id)?.look ?? 0
  // look 100 = a police officer (v44): hi-vis yellow jacket, black trousers, dark cap
  const police = look >= 100
  let seed = 0
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0
  const appearance = police ? { skin: APPEARANCES[seed % APPEARANCES.length].skin, shirt: '#D4DF1F', hair: '#15171B' } : APPEARANCES[look % APPEARANCES.length]
  const legs = police ? '#15171B' : '#30343A'

  useFrame((_, delta) => {
    const s = client.peds.get(id)
    const g = person.current
    if (!s || !g) return
    const p = pose.current
    if (!p.placed) {
      p.x = s.x
      p.z = s.z
      p.h = s.h
      p.placed = true
    }
    // Glide toward the server's position (it updates ~15 times a second)
    const k = Math.min(1, delta * 10)
    const px = p.x
    const pz = p.z
    p.x += (s.x - p.x) * k
    p.z += (s.z - p.z) * k
    p.h += Math.atan2(Math.sin(s.h - p.h), Math.cos(s.h - p.h)) * Math.min(1, delta * 8)
    const moved = Math.hypot(p.x - px, p.z - pz)

    // Knocked down: topple over and lie there; otherwise get back up
    const down = s.s === 4
    p.fall += ((down ? 1 : 0) - p.fall) * Math.min(1, delta * (down ? 9 : 3))
    g.position.set(p.x, p.fall * 0.22, p.z)
    g.rotation.set(-p.fall * (Math.PI / 2), p.h, 0, 'YXZ')

    // Arms and legs swing with the distance covered: a stroll, a hurry across the road, a sprint clear
    const swing = down ? 0 : s.s === 3 ? 0.95 : s.s === 2 ? 0.7 : 0.55
    p.phase += moved * (s.s === 3 ? 2.2 : 2.8)
    const still = moved < 0.002
    const leg = still ? 0 : Math.sin(p.phase) * swing
    const arm = still ? 0 : Math.sin(p.phase) * swing * 0.75
    if (leftLeg.current) leftLeg.current.rotation.x = leg
    if (rightLeg.current) rightLeg.current.rotation.x = -leg
    if (leftArm.current) leftArm.current.rotation.x = -arm
    if (rightArm.current) rightArm.current.rotation.x = arm
    if (body.current) body.current.position.y = still ? 0 : Math.abs(Math.sin(p.phase * 2)) * 0.035
  })

  const markers = useRef<(THREE.Object3D | null)[]>([])
  const mark = (k: number) => (o: THREE.Object3D | null) => {
    markers.current[k] = o
  }
  useEffect(() => {
    // Colours: shirt, skin, hair, skin, skin, trousers, trousers
    const entry = { markers: markers.current, placed: pose.current, colours: [appearance.shirt, appearance.skin, appearance.hair, appearance.skin, appearance.skin, legs, legs] }
    CROWD_MEMBERS.add(entry)
    return () => {
      CROWD_MEMBERS.delete(entry)
    }
  }, [appearance, legs])

  return (
    <group ref={person}>
      <group ref={body}>
        <object3D ref={mark(0)} position={[0, 0.95, 0]} />
        <object3D ref={mark(1)} position={[0, 1.65, 0]} />
        <object3D ref={mark(2)} position={[0, 1.79, 0]} />
        <group ref={leftArm} position={[-0.3, 1.35, 0]}>
          <object3D ref={mark(3)} position={[0, -0.53, 0]} />
        </group>
        <group ref={rightArm} position={[0.3, 1.35, 0]}>
          <object3D ref={mark(4)} position={[0, -0.53, 0]} />
        </group>
        <group ref={leftLeg} position={[-0.12, 0.55, 0]}>
          <object3D ref={mark(5)} position={[0, -0.25, 0]} />
        </group>
        <group ref={rightLeg} position={[0.12, 0.55, 0]}>
          <object3D ref={mark(6)} position={[0, -0.25, 0]} />
        </group>
      </group>
    </group>
  )
}

// ---- The crowd, drawn together (v39) ----
type Member = { markers: (THREE.Object3D | null)[]; placed: { placed: boolean }; colours: string[] }
const CROWD_MEMBERS = new Set<Member>()
const BODY_PARTS = [
  new THREE.CapsuleGeometry(0.25, 0.65, 4, 8), // torso
  new THREE.SphereGeometry(0.2, 16, 16), // head
  new THREE.SphereGeometry(0.205, 16, 12), // hair
  new THREE.SphereGeometry(0.075, 10, 10), // left hand
  new THREE.SphereGeometry(0.075, 10, 10), // right hand
  new THREE.BoxGeometry(0.13, 0.5, 0.16), // left leg
  new THREE.BoxGeometry(0.13, 0.5, 0.16), // right leg
]

function Crowd() {
  const meshes = useMemo(
    () =>
      BODY_PARTS.map((geo) => {
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff' }), CROWD + 4)
        mesh.castShadow = true
        mesh.frustumCulled = false // people move every frame; seven meshes, not worth bounding
        mesh.count = 0
        return mesh
      }),
    [],
  )
  useEffect(
    () => () =>
      meshes.forEach((m) => {
        m.dispose()
        ;(m.material as THREE.Material).dispose()
      }),
    [meshes],
  )
  const colour = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    let n = 0
    for (const member of CROWD_MEMBERS) {
      if (n >= CROWD + 4) break
      if (!member.placed.placed || member.markers.some((m) => !m)) continue // not on the street yet
      member.markers.forEach((marker, k) => {
        marker!.updateWorldMatrix(true, false)
        meshes[k].setMatrixAt(n, marker!.matrixWorld)
        meshes[k].setColorAt(n, colour.set(member.colours[k]))
      })
      n++
    }
    for (const m of meshes) {
      m.count = n
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}

/** Everyone on the pavements near you. */
export default function Pedestrians({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const ids = [...client.peds.keys()].slice(0, CROWD) // re-read whenever someone appears or leaves (bumpGame)
  return (
    <group>
      <Crowd />
      {ids.map((id) => (
        <Person key={id} id={id} client={client} />
      ))}
    </group>
  )
}

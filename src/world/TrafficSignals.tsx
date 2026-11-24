// Traffic lights (v34). The server sends the list of lit junctions once; the colours are worked out
// here from the server clock, so they match what the traffic cars obey without any extra messages.
//
// Each approach gets a pole on the driver's left kerb (we drive on the left), a black signal head
// facing the driver, and three lamps. Everything is instanced: three draws for the whole city.
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NetClient, SignalCycle, SignalJunction } from '../net/NetClient'

const KERB = 5 // metres to the left of the road's centre line
const BACK = 1 // metres before the junction's edge

const ON = {
  red: new THREE.Color('#ff2a1f').multiplyScalar(4),
  amber: new THREE.Color('#ffa315').multiplyScalar(4),
  green: new THREE.Color('#2bff7a').multiplyScalar(4),
}
const OFF = {
  red: new THREE.Color('#2a0806'),
  amber: new THREE.Color('#2a1a04'),
  green: new THREE.Color('#04200d'),
}
const LAMPS = ['red', 'amber', 'green'] as const

type Colour = 'red' | 'amber' | 'green'

/** Same maths as server/signals.mjs lightFor(). */
function lightFor(cycle: SignalCycle, offset: number, phase: 'A' | 'B', now: number): Colour {
  const total = cycle.greenA + cycle.amber + cycle.allRed + cycle.greenB + cycle.amber + cycle.allRed
  const t = (((now + offset) % total) + total) % total
  const aEnd = cycle.greenA
  const aAmb = aEnd + cycle.amber
  const red1 = aAmb + cycle.allRed
  const bEnd = red1 + cycle.greenB
  const bAmb = bEnd + cycle.amber
  if (phase === 'A') return t < aEnd ? 'green' : t < aAmb ? 'amber' : 'red'
  return t >= red1 && t < bEnd ? 'green' : t >= bEnd && t < bAmb ? 'amber' : 'red'
}

type Head = { x: number; z: number; ry: number; j: SignalJunction; ph: 'A' | 'B' }

function headsFor(list: SignalJunction[]): Head[] {
  const out: Head[] = []
  for (const j of list) {
    for (const a of j.arms) {
      const fx = Math.sin(a.b)
      const fz = Math.cos(a.b)
      // Stop line, then step across to the left kerb: the left of travel is (fz, -fx)
      const d = j.r + BACK
      out.push({ x: j.x - fx * d + fz * KERB, z: j.z - fz * d - fx * KERB, ry: a.b + Math.PI, j, ph: a.ph })
    }
  }
  return out
}

const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8)
const headGeo = new THREE.BoxGeometry(0.36, 1.05, 0.28)
const lampGeo = new THREE.SphereGeometry(0.11, 12, 8)
const poleMat = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.6, roughness: 0.45 })
const headMat = new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.7 })
const lampMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
// Stop line: a white bar across the left-hand lane, where the traffic cars actually stop
// (server/signals.mjs stops them 3 m before the junction's edge)
const STOP = 2.4
const LANE = 3.4
const stopGeo = new THREE.PlaneGeometry(LANE, 0.32).rotateX(-Math.PI / 2)
const stopMat = new THREE.MeshStandardMaterial({ color: '#E9E6DE', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 })

export function TrafficSignals({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const heads = useMemo(() => headsFor(client.signals), [client.signals])
  const poles = useRef<THREE.InstancedMesh>(null)
  const boxes = useRef<THREE.InstancedMesh>(null)
  const lamps = useRef<THREE.InstancedMesh>(null)
  const lines = useRef<THREE.InstancedMesh>(null)
  const last = useRef('')

  // Place the poles and heads once
  useEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    heads.forEach((h, i) => {
      q.setFromAxisAngle(up, h.ry)
      poles.current?.setMatrixAt(i, m.compose(new THREE.Vector3(h.x, 1.8, h.z), q, s))
      boxes.current?.setMatrixAt(i, m.compose(new THREE.Vector3(h.x, 3.05, h.z), q, s))
      // stop line: across the lane, centred half a lane to the left of the centre line
      const fx = Math.sin(h.ry - Math.PI)
      const fz = Math.cos(h.ry - Math.PI)
      const d = h.j.r + STOP
      lines.current?.setMatrixAt(i, m.compose(new THREE.Vector3(h.j.x - fx * d + fz * (LANE / 2 + 0.1), 0.045, h.j.z - fz * d - fx * (LANE / 2 + 0.1)), new THREE.Quaternion().setFromAxisAngle(up, h.ry - Math.PI), s))
      LAMPS.forEach((_, k) => {
        // lamps sit on the face of the head that looks at the driver (local +z)
        const local = new THREE.Vector3(0, 3.38 - k * 0.33, 0.15).applyQuaternion(q)
        lamps.current?.setMatrixAt(i * 3 + k, m.compose(new THREE.Vector3(h.x + local.x, local.y, h.z + local.z), q, s))
        lamps.current?.setColorAt(i * 3 + k, OFF[LAMPS[k]])
      })
    })
    for (const r of [poles, boxes, lamps, lines]) if (r.current) r.current.instanceMatrix.needsUpdate = true
    if (lamps.current?.instanceColor) lamps.current.instanceColor.needsUpdate = true
    last.current = ''
  }, [heads])

  // Light the right lamp on each head (only touches the GPU when something changes)
  useFrame(() => {
    const cycle = client.signalCycle
    const mesh = lamps.current
    if (!cycle || !mesh || heads.length === 0) return
    const now = Date.now() + client.serverClockOffset
    let key = ''
    const colours: Colour[] = heads.map((h) => lightFor(cycle, h.j.o, h.ph, now))
    for (const c of colours) key += c[0]
    if (key === last.current) return
    last.current = key
    colours.forEach((c, i) => LAMPS.forEach((lamp, k) => mesh.setColorAt(i * 3 + k, lamp === c ? ON[lamp] : OFF[lamp])))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (heads.length === 0) return null
  return (
    <group>
      <instancedMesh key={`p${heads.length}`} ref={poles} args={[poleGeo, poleMat, heads.length]} castShadow frustumCulled={false} />
      <instancedMesh key={`b${heads.length}`} ref={boxes} args={[headGeo, headMat, heads.length]} castShadow frustumCulled={false} />
      <instancedMesh key={`l${heads.length}`} ref={lamps} args={[lampGeo, lampMat, heads.length * 3]} frustumCulled={false} />
      <instancedMesh key={`s${heads.length}`} ref={lines} args={[stopGeo, stopMat, heads.length]} receiveShadow frustumCulled={false} />
    </group>
  )
}

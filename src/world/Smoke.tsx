// Smoke from damaged cars (v43, C7): grey wisps from the bonnet below 60 health, thick and dark below 30,
// black and heavy from a wreck. One cloud of points for every car in view: a single draw call.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NetClient } from '../net/NetClient'

const MAX = 500

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aShade;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vAlpha = aAlpha;
    vShade = aShade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const fragment = /* glsl */ `
  varying float vAlpha;
  varying float vShade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float soft = pow(1.0 - d, 1.6);
    gl_FragColor = vec4(vec3(vShade), vAlpha * soft);
  }
`

type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; shade: number; alpha: number }

export function Smoke({ client }: { client: NetClient }) {
  const { points, puffs, attrs } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const attrs = {
      position: new THREE.BufferAttribute(new Float32Array(MAX * 3), 3),
      aSize: new THREE.BufferAttribute(new Float32Array(MAX), 1),
      aAlpha: new THREE.BufferAttribute(new Float32Array(MAX), 1),
      aShade: new THREE.BufferAttribute(new Float32Array(MAX), 1),
    }
    for (const [name, a] of Object.entries(attrs)) {
      a.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute(name, a)
    }
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    return { points, puffs: [] as Puff[], attrs }
  }, [])
  const carry = useMemo(() => new Map<string, number>(), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    // New puffs from every damaged car near you
    for (const [id, s] of client.vehicles) {
      const hp = s.hp ?? 100
      if (hp >= 60 || Math.abs(s.x - client.me.x) > 160 || Math.abs(s.z - client.me.z) > 160) continue
      const pose = client.vehiclePose.get(id) ?? s
      const rate = hp <= 0 ? 26 : hp < 30 ? 16 : 6 // puffs a second
      const due = (carry.get(id) ?? 0) + rate * dt
      let n = Math.floor(due)
      carry.set(id, due - n)
      // from the bonnet: 1.5 m ahead of the middle (vans: further forward and higher)
      const ahead = s.k === 'van' ? 2.0 : 1.5
      const bx = pose.x + Math.sin(pose.h) * ahead
      const bz = pose.z + Math.cos(pose.h) * ahead
      while (n-- > 0 && puffs.length < MAX) {
        const dark = hp <= 0 ? 0.08 : hp < 30 ? 0.18 : 0.55
        puffs.push({
          x: bx + (Math.random() - 0.5) * 0.6,
          y: (s.k === 'van' ? 1.4 : 1.0) + Math.random() * 0.2,
          z: bz + (Math.random() - 0.5) * 0.6,
          vx: (Math.random() - 0.5) * 0.4 - Math.sin(pose.h) * s.v * 0.3,
          vy: 1.1 + Math.random() * 0.8,
          vz: (Math.random() - 0.5) * 0.4 - Math.cos(pose.h) * s.v * 0.3,
          age: 0,
          life: hp <= 0 ? 3.2 : 2.2,
          size: hp <= 0 ? 1.6 : 1.1,
          shade: dark + Math.random() * 0.08,
          alpha: hp <= 0 ? 0.55 : hp < 30 ? 0.45 : 0.3,
        })
      }
    }
    // Rise, spread, fade
    let k = 0
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i]
      p.age += dt
      if (p.age >= p.life) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.vy *= 1 - 0.35 * dt
      puffs[k++] = p
    }
    puffs.length = k
    puffs.forEach((p, i) => {
      const t = p.age / p.life
      attrs.position.setXYZ(i, p.x, p.y, p.z)
      attrs.aSize.setX(i, p.size * (0.6 + t * 2.4))
      attrs.aAlpha.setX(i, p.alpha * Math.min(1, t * 6) * (1 - t))
      attrs.aShade.setX(i, p.shade)
    })
    points.geometry.setDrawRange(0, puffs.length)
    for (const a of Object.values(attrs)) a.needsUpdate = true
  })

  return <primitive object={points} />
}

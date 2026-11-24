// The gold marker over wherever you're heading (v37): your waypoint, or your current mission's place
// or person. Replaces the job rings that used to mark every life-sim venue.
import { useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { currentTarget } from './MapUI'
import type { NetClient } from './net/NetClient'

const GOLD = '#ffe14d'

/** A bright gold disc with a dark star: easy to spot over the rooftops. */
function starTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const fill = g.createRadialGradient(64, 56, 6, 64, 64, 60)
  fill.addColorStop(0, '#fff1a0')
  fill.addColorStop(1, '#f0b81f')
  g.beginPath()
  g.arc(64, 64, 58, 0, Math.PI * 2)
  g.fillStyle = fill
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = '#7a4d05'
  g.stroke()
  // five-pointed star
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 36 : 15
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r)
  }
  g.closePath()
  g.fillStyle = '#3a2604'
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function ObjectiveMarker({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const badge = useRef<THREE.Sprite>(null)
  const map = useMemo(() => starTexture(), [])

  useFrame(({ clock }) => {
    const target = currentTarget(client)
    const g = group.current
    if (!g) return
    g.visible = Boolean(target)
    if (!target) return
    g.position.set(target.x, 0, target.z)
    const t = clock.elapsedTime
    // fade it out as you arrive, so it doesn't sit on top of the person you're meeting
    const d = Math.hypot(client.me.x - target.x, client.me.z - target.z)
    const near = Math.min(1, Math.max(0, (d - 6) / 16)) // gone within 6 m, full from 22 m (v50: it filled the screen up close)
    if (ring.current) {
      const pulse = 1 + Math.sin(t * 3) * 0.08
      ring.current.scale.set(pulse, pulse, 1)
    }
    if (badge.current) {
      badge.current.position.y = 7 + Math.sin(t * 2) * 0.3
      ;(badge.current.material as THREE.SpriteMaterial).opacity = near
      badge.current.visible = near > 0.02
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[2.1, 2.5, 48]} />
        <meshBasicMaterial color={new THREE.Color(GOLD).multiplyScalar(1.6)} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
      </mesh>
      <sprite ref={badge} position={[0, 7, 0]} scale={[1.6, 1.6, 1]}>
        <spriteMaterial map={map} transparent depthWrite={false} toneMapped={false} fog={false} />
      </sprite>
    </group>
  )
}

/** A soft yellow column, brightest at the bottom, fading upwards: where a mission starts (v50). */
function columnTexture() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 64
  const g = c.getContext('2d')!
  const fade = g.createLinearGradient(0, 0, 0, 64)
  fade.addColorStop(0, 'rgba(255,225,77,0)')
  fade.addColorStop(1, 'rgba(255,225,77,0.85)')
  g.fillStyle = fade
  g.fillRect(0, 0, 4, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * The yellow markers where your character's missions start (GTA-style): walk into one to begin. Hidden
 * while you're playing a mission. The server decides when you're in one; this only draws them.
 */
export function MissionMarkers({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const tex = useMemo(() => columnTexture(), [])
  const columns = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = columns.current
    if (!g) return
    const s = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.06
    for (const child of g.children) child.scale.set(s, 1, s)
  })
  const starts = client.run ? [] : (client.missions?.active ?? []).filter((m) => m.start).map((m) => ({ id: m.id, ...m.start! }))
  return (
    <group ref={columns}>
      {starts.map((s) => (
        <group key={s.id} position={[s.x, 0, s.z]}>
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[1.25, 1.25, 3.2, 32, 1, true]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <ringGeometry args={[1.05, 1.3, 40]} />
            <meshBasicMaterial color={new THREE.Color(GOLD).multiplyScalar(1.4)} transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

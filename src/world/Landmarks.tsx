// Landmarks (v35): the places that make Digbeth look like Digbeth. Each one replaces the generic
// box for its OpenStreetMap building (same footprint, so the server's collisions still match) and is
// always drawn, not only when you are near: the Rotunda has to be on the skyline from Digbeth.
//
//   The Rotunda        way/72875377   81 m listed tower at the Bull Ring (glass drum, lit crown)
//   Custard Factory    way/242333839  red-brick works on Gibb Street, painted sign, chimney, murals
//   Coach Station      way/46249308   Birmingham Coach Station in National Express West Midlands House
//   The Old Crown      way/73424176   timber-framed pub on High Street Deritend (said to date from 1368)
//   Warwick Bar        canal          the stop lock by Fazeley Street, where the Warwick & Birmingham
//                                     Canal met the Digbeth Branch
//
// Footprints and positions come from the district files; nothing here is guessed per frame.
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { loadDistricts } from './districts'
import { toWorld } from './geo'
import { brickPatch } from './surfaces'

type Feature = { id?: string; properties: Record<string, string>; geometry: { type: string; coordinates: any } }
type Pt = [number, number]

const IDS = {
  rotunda: 'way/72875377',
  custard: 'way/242333839',
  coach: 'way/46249308',
  oldCrown: 'way/73424176',
}
/** Buildings the generic map must skip (a landmark draws them instead). */
export const LANDMARK_IDS = new Set(Object.values(IDS))
export const featureId = (f: { id?: string; properties?: Record<string, string> }) => String(f.id ?? f.properties?.['@id'] ?? '')

// Warwick Bar: the stop lock on the Digbeth Branch, just before the arm into the basin
const WARWICK = { x: 265.8, z: -291.6, dir: 0.819, half: 3.5 }

// ---------- geometry helpers ----------
function ringOf(f: Feature): Pt[] {
  const ring: Pt[] = f.geometry.coordinates[0].map(([lon, lat]: number[]) => toWorld(lon, lat))
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop()
  return ring
}

function centreOf(ring: Pt[]): Pt {
  let x = 0
  let z = 0
  for (const [px, pz] of ring) { x += px; z += pz }
  return [x / ring.length, z / ring.length]
}

function extrude(ring: Pt[], height: number, base = 0): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  ring.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  if (base) g.translate(0, base, 0)
  g.computeVertexNormals()
  return g
}

type Edge = { x: number; z: number; len: number; nx: number; nz: number; ry: number; ax: number; az: number }

/** Every wall, with its outward normal. `ry` turns a +z-facing plane to face out of that wall. */
function edgesOf(ring: Pt[]): Edge[] {
  const [cx, cz] = centreOf(ring)
  return ring.map(([x1, z1], i) => {
    const [x2, z2] = ring[(i + 1) % ring.length]
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz) || 1
    let nx = -dz / len
    let nz = dx / len
    const mx = (x1 + x2) / 2
    const mz = (z1 + z2) / 2
    if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz }
    return { x: mx, z: mz, len, nx, nz, ry: Math.atan2(nx, nz), ax: dx / len, az: dz / len }
  })
}

/** The longest wall, preferring walls that face towards `toward`. */
function frontOf(ring: Pt[], toward?: Pt): Edge {
  const edges = edgesOf(ring)
  let best = edges[0]
  let score = -Infinity
  for (const e of edges) {
    let s = e.len
    if (toward) {
      const dx = toward[0] - e.x
      const dz = toward[1] - e.z
      const d = Math.hypot(dx, dz) || 1
      s *= Math.max(0.05, (e.nx * dx + e.nz * dz) / d)
    }
    if (s > score) { score = s; best = e }
  }
  return best
}

// ---------- textures ----------
const cache = new Map<string, THREE.CanvasTexture>()
function canvasTexture(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  let t = cache.get(key)
  if (t) return t
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  cache.set(key, t)
  return t
}

function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function lettering(text: string, w: number, h: number, bg: string, fg: string, sub?: string, font = 'Big Shoulders Display Variable, Impact, system-ui, sans-serif') {
  return canvasTexture(`sign|${text}|${sub}|${bg}|${fg}`, w, h, (c) => {
    c.fillStyle = bg
    c.fillRect(0, 0, w, h)
    c.strokeStyle = fg
    c.globalAlpha = 0.6
    c.lineWidth = Math.max(3, h * 0.035)
    c.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12)
    c.globalAlpha = 1
    c.fillStyle = fg
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    let size = h * (sub ? 0.5 : 0.66)
    c.font = `800 ${size}px ${font}`
    while (c.measureText(text).width > w * 0.9 && size > 10) { size -= 2; c.font = `800 ${size}px ${font}` }
    c.fillText(text, w / 2, sub ? h * 0.4 : h * 0.53)
    if (sub) {
      c.font = `600 ${h * 0.2}px system-ui, sans-serif`
      c.fillText(sub, w / 2, h * 0.76)
    }
  })
}

const rotundaFacade = () =>
  canvasTexture('rotunda', 1024, 512, (c) => {
    const cols = 56
    const floors = 24
    const rnd = seeded(81)
    c.fillStyle = '#2E2A36'
    c.fillRect(0, 0, 1024, 512)
    const cw = 1024 / cols
    const fh = 512 / floors
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < cols; k++) {
        const lit = rnd() < 0.42
        c.fillStyle = lit ? (rnd() < 0.7 ? '#FFB257' : '#FFE2A8') : '#1B2230'
        c.fillRect(k * cw + 2, f * fh + 3, cw - 4, fh - 7)
      }
    }
  })

/** Emissive version: only the lit panes glow. */
const rotundaGlow = () =>
  canvasTexture('rotunda-glow', 1024, 512, (c) => {
    const img = (rotundaFacade().image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1024, 512)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const warm = d[i] > 200 && d[i + 1] > 150
      if (!warm) { d[i] = d[i + 1] = d[i + 2] = 0 }
    }
    c.putImageData(img, 0, 0)
  })

const mural = (seed: number) =>
  canvasTexture(`mural${seed}`, 512, 256, (c) => {
    const rnd = seeded(seed * 7919 + 13)
    const pal = ['#FF5DA2', '#2EC4B6', '#FFD23F', '#7B2FF7', '#FF7A2F', '#00A6FB', '#F8F7F2', '#111111']
    c.fillStyle = pal[Math.floor(rnd() * 6)]
    c.fillRect(0, 0, 512, 256)
    for (let i = 0; i < 26; i++) {
      c.fillStyle = pal[Math.floor(rnd() * pal.length)]
      const x = rnd() * 512
      const y = rnd() * 256
      const r = 12 + rnd() * 70
      const kind = rnd()
      c.beginPath()
      if (kind < 0.4) c.arc(x, y, r, 0, Math.PI * 2)
      else if (kind < 0.7) { c.moveTo(x, y); c.lineTo(x + r, y - r * 1.4); c.lineTo(x + r * 2, y) }
      else c.rect(x, y, r * 2.4, r * 0.5)
      c.fill()
    }
    c.lineWidth = 9
    c.strokeStyle = '#111111'
    c.beginPath()
    for (let x = 0; x <= 512; x += 32) c.lineTo(x, 200 + (x / 32 % 2 ? -18 : 18))
    c.stroke()
  })

const timberFrame = () =>
  canvasTexture(
    'timber',
    256,
    256,
    (c) => {
      c.fillStyle = '#EDE6D4'
      c.fillRect(0, 0, 256, 256)
      c.fillStyle = '#211A16'
      for (let x = 0; x <= 256; x += 64) c.fillRect(x - 6, 0, 12, 256)
      for (const y of [0, 124, 250]) c.fillRect(0, y - 4, 256, 12)
      c.lineWidth = 10
      c.strokeStyle = '#211A16'
      for (let x = 0; x < 256; x += 128) {
        c.beginPath(); c.moveTo(x, 124); c.lineTo(x + 64, 6); c.stroke()
        c.beginPath(); c.moveTo(x + 128, 124); c.lineTo(x + 64, 6); c.stroke()
      }
    },
    [0.25, 0.143], // one tile = 4 m wide, 7 m tall (two storeys)
  )

// ---------- landmarks ----------
/** Seen from far away (the Rotunda is ~750 m from Digbeth), so it must not dissolve into the fog. */
const fogFree = <T extends THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>(m: T): T => { m.fog = false; return m }

function Rotunda({ f }: { f: Feature }) {
  const ring = useMemo(() => ringOf(f), [f])
  const [cx, cz] = centreOf(ring)
  const r = ring.reduce((s, [x, z]) => s + Math.hypot(x - cx, z - cz), 0) / ring.length
  const H = 81
  const mats = useMemo(() => {
    const map = rotundaFacade()
    const glow = rotundaGlow()
    return {
      body: fogFree(new THREE.MeshStandardMaterial({ map, emissive: '#ffffff', emissiveMap: glow, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.3 })),
      crown: fogFree(new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFE0A6').multiplyScalar(2.6), toneMapped: false })),
      cap: fogFree(new THREE.MeshStandardMaterial({ color: '#2A2731', roughness: 0.8 })),
      base: fogFree(new THREE.MeshStandardMaterial({ color: '#3B3640', roughness: 0.7 })),
    }
  }, [])
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 3, 0]} material={mats.base} castShadow receiveShadow>
        <cylinderGeometry args={[r + 0.6, r + 0.6, 6, 48]} />
      </mesh>
      <mesh position={[0, 6 + (H - 10) / 2, 0]} material={mats.body} castShadow>
        <cylinderGeometry args={[r, r, H - 10, 64, 1, true]} />
      </mesh>
      {/* the lit crown that reads from all over the city at dusk */}
      <mesh position={[0, H - 3.2, 0]} material={mats.crown}>
        <cylinderGeometry args={[r + 0.35, r + 0.35, 1.6, 64, 1, true]} />
      </mesh>
      <mesh position={[0, H - 1.2, 0]} material={mats.cap} castShadow>
        <cylinderGeometry args={[r + 0.5, r + 0.5, 2.4, 64]} />
      </mesh>
      <mesh position={[0, H + 1.4, 0]} material={mats.cap}>
        <boxGeometry args={[r * 0.8, 2.8, r * 0.8]} />
      </mesh>
    </group>
  )
}

function CustardFactory({ f }: { f: Feature }) {
  const ring = useMemo(() => ringOf(f), [f])
  const H = 14
  const geo = useMemo(() => extrude(ring, H), [ring])
  const [cx, cz] = centreOf(ring)
  // the sign faces Gibb Street (nearest point on it, from the map data)
  const front = useMemo(() => frontOf(ring, [75.3, 97]), [ring])
  const walls = useMemo(() => edgesOf(ring).filter((e) => e !== front && e.len > 8).sort((a, b) => b.len - a.len).slice(0, 3), [ring, front])
  const signW = Math.min(front.len * 0.9, 24)
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color="#9A5A3C" roughness={0.9} onBeforeCompile={brickPatch} customProgramCacheKey={() => 'britlife-brick'} />
      </mesh>
      {/* painted lettering along the top of the main wall */}
      <mesh position={[front.x + front.nx * 0.08, H - 2.4, front.z + front.nz * 0.08]} rotation={[0, front.ry, 0]}>
        <planeGeometry args={[signW, signW / 6.4]} />
        <meshStandardMaterial map={lettering('CUSTARD FACTORY', 1024, 160, '#F2C230', '#3B1F12')} roughness={0.8} />
      </mesh>
      {/* street art on the other walls */}
      {walls.map((e, i) => {
        const w = Math.min(e.len * 0.8, 14)
        return (
          <mesh key={i} position={[e.x + e.nx * 0.07, 4.2, e.z + e.nz * 0.07]} rotation={[0, e.ry, 0]}>
            <planeGeometry args={[w, w / 2]} />
            <meshStandardMaterial map={mural(i + 1)} roughness={0.85} />
          </mesh>
        )
      })}
      {/* the old works chimney */}
      <group position={[cx, 0, cz]}>
        <mesh position={[0, 17, 0]} castShadow>
          <cylinderGeometry args={[0.95, 1.3, 34, 16]} />
          <meshStandardMaterial color="#7E4630" roughness={0.9} onBeforeCompile={brickPatch} customProgramCacheKey={() => 'britlife-brick'} />
        </mesh>
        <mesh position={[0, 34.3, 0]}>
          <cylinderGeometry args={[1.25, 1.1, 0.9, 16]} />
          <meshStandardMaterial color="#3A2A24" roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

function CoachStation({ f }: { f: Feature }) {
  const ring = useMemo(() => ringOf(f), [f])
  const base = useMemo(() => extrude(ring, 4.4), [ring])
  const glass = useMemo(() => extrude(ring, 8, 4.4), [ring])
  // the entrance faces Digbeth (nearest point on the street, from the map data)
  const front = useMemo(() => frontOf(ring, [-223, 27.5]), [ring])
  const canopyW = Math.min(front.len * 0.85, 40)
  const out = 2.6
  return (
    <group>
      <mesh geometry={base} castShadow receiveShadow>
        <meshStandardMaterial color="#E4E0D8" roughness={0.6} />
      </mesh>
      <mesh geometry={glass} castShadow>
        <meshStandardMaterial color="#4F7489" emissive="#21384A" emissiveIntensity={0.9} metalness={0.55} roughness={0.14} />
      </mesh>
      {/* the long canopy over the entrance, on posts */}
      <group position={[front.x + front.nx * out, 0, front.z + front.nz * out]} rotation={[0, front.ry, 0]}>
        <mesh position={[0, 4.7, 0]} castShadow receiveShadow>
          <boxGeometry args={[canopyW, 0.35, out * 2 + 1]} />
          <meshStandardMaterial color="#F3F1EC" roughness={0.5} />
        </mesh>
        <mesh position={[0, 4.45, out + 0.45]}>
          <boxGeometry args={[canopyW, 0.12, 0.12]} />
          <meshBasicMaterial color={new THREE.Color('#E8F4FF').multiplyScalar(2.2)} toneMapped={false} />
        </mesh>
        {[-0.45, -0.15, 0.15, 0.45].map((t) => (
          <mesh key={t} position={[t * canopyW, 2.3, out]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 4.6, 10]} />
            <meshStandardMaterial color="#C9CDD2" metalness={0.6} roughness={0.35} />
          </mesh>
        ))}
      </group>
      <mesh position={[front.x + front.nx * 0.1, 9.4, front.z + front.nz * 0.1]} rotation={[0, front.ry, 0]}>
        <planeGeometry args={[Math.min(front.len * 0.7, 22), Math.min(front.len * 0.7, 22) / 6.4]} />
        <meshBasicMaterial map={lettering('BIRMINGHAM COACH STATION', 1024, 160, '#16243A', '#F4F7FB', 'DIGBETH')} toneMapped={false} />
      </mesh>
    </group>
  )
}

function OldCrown({ f }: { f: Feature }) {
  const ring = useMemo(() => ringOf(f), [f])
  const WALL = 7
  const walls = useMemo(() => extrude(ring, WALL), [ring])
  const front = useMemo(() => frontOf(ring, [108.3, 146.6]), [ring]) // nearest point on High Street Deritend
  const roof = useMemo(() => {
    // gable roof over the footprint's bounding box, ridge along the front wall
    const [cx, cz] = centreOf(ring)
    const ux = front.ax
    const uz = front.az
    // The footprint is L-shaped: roof only the main range along the street (corners within 11 m of
    // the front wall), so the roof doesn't hang over the empty corner of the L.
    const depth = (x: number, z: number) => (front.x - x) * front.nx + (front.z - z) * front.nz
    const main = ring.filter(([x, z]) => depth(x, z) < 11)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const [x, z] of main.length >= 3 ? main : ring) {
      const u = (x - cx) * ux + (z - cz) * uz
      const v = -(x - cx) * uz + (z - cz) * ux
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
    }
    const w = v1 - v0 + 0.8
    const shape = new THREE.Shape()
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(0, Math.min(4.2, w * 0.45))
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: u1 - u0 + 0.8, bevelEnabled: false })
    g.translate(0, 0, -(u1 - u0 + 0.8) / 2)
    g.computeVertexNormals()
    const vMid = (v0 + v1) / 2
    const uMid = (u0 + u1) / 2
    return { g, x: cx + ux * uMid - uz * vMid, z: cz + uz * uMid + ux * vMid, ry: Math.atan2(ux, uz) }
  }, [ring, front])
  const bracket = { x: front.x + front.nx * 0.2, z: front.z + front.nz * 0.2 }
  return (
    <group>
      <mesh geometry={walls} castShadow receiveShadow>
        <meshStandardMaterial map={timberFrame()} roughness={0.85} />
      </mesh>
      <mesh geometry={roof.g} position={[roof.x, WALL, roof.z]} rotation={[0, roof.ry, 0]} castShadow>
        <meshStandardMaterial color="#3E3A3D" roughness={0.9} />
      </mesh>
      {/* the hanging pub sign on an iron bracket */}
      <group position={[bracket.x, 0, bracket.z]} rotation={[0, front.ry, 0]}>
        <mesh position={[0, 4.6, 0.75]}>
          <boxGeometry args={[0.08, 0.08, 1.5]} />
          <meshStandardMaterial color="#1B1B1B" metalness={0.6} />
        </mesh>
        <mesh position={[0, 3.85, 1.35]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[1.3, 1.2, 0.07]} />
          <meshStandardMaterial map={lettering('THE OLD CROWN', 512, 470, '#1F3B2E', '#F1D27A', 'EST. 1368', 'Georgia, serif')} roughness={0.7} />
        </mesh>
        <mesh position={[-1.4, 2.6, 0.25]}>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshBasicMaterial color={new THREE.Color('#FFC777').multiplyScalar(3)} toneMapped={false} />
        </mesh>
        <mesh position={[1.4, 2.6, 0.25]}>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshBasicMaterial color={new THREE.Color('#FFC777').multiplyScalar(3)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function WarwickBar() {
  const { x, z, dir, half } = WARWICK
  const fx = Math.sin(dir)
  const fz = Math.cos(dir)
  const lx = fz // left of the canal's direction: (fz, -fx)
  const lz = -fx
  const timber = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1C1A19', roughness: 0.8 }), [])
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#EDEBE6', roughness: 0.6 }), [])
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8E8577', roughness: 0.95 }), [])
  const gate = (along: number, key: string) => (
    <group key={key} position={[x + fx * along, 0, z + fz * along]} rotation={[0, dir, 0]}>
      {/* two leaves meeting in a shallow V, pointing upstream */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * half * 0.5, 0, 0.25]} rotation={[0, s * 0.18, 0]}>
          <mesh position={[0, 0.35, 0]} material={timber} castShadow>
            <boxGeometry args={[half + 0.1, 1.5, 0.3]} />
          </mesh>
          {/* balance beam out over the bank, black with a white tip */}
          <mesh position={[s * (half * 0.5 + 2.1), 1.05, -0.9]} rotation={[0, s * 0.35, 0]} material={timber} castShadow>
            <boxGeometry args={[4.4, 0.3, 0.3]} />
          </mesh>
          <mesh position={[s * (half * 0.5 + 4.05), 1.05, -1.6]} rotation={[0, s * 0.35, 0]} material={white}>
            <boxGeometry args={[0.6, 0.32, 0.32]} />
          </mesh>
        </group>
      ))}
    </group>
  )
  return (
    <group>
      {gate(-6, 'down')}
      {gate(6, 'up')}
      {/* stone copings along the lock chamber */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x + lx * s * (half + 0.35), 0.12, z + lz * s * (half + 0.35)]} rotation={[0, dir, 0]} material={stone} receiveShadow>
          <boxGeometry args={[0.7, 0.24, 14]} />
        </mesh>
      ))}
      {/* heritage sign on the towpath */}
      <group position={[x + lx * (half + 3.2), 0, z + lz * (half + 3.2)]} rotation={[0, dir + Math.PI / 2, 0]}>
        {[-0.7, 0.7].map((o) => (
          <mesh key={o} position={[o, 0.9, 0]}>
            <boxGeometry args={[0.1, 1.8, 0.1]} />
            <meshStandardMaterial color="#1F1F1F" />
          </mesh>
        ))}
        <mesh position={[0, 1.75, 0.06]}>
          <planeGeometry args={[1.8, 0.75]} />
          <meshStandardMaterial map={lettering('WARWICK BAR', 512, 214, '#14324A', '#F2EBDD', 'Stop lock · Digbeth Branch Canal')} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

export function Landmarks() {
  const [features, setFeatures] = useState<Feature[] | null>(null)
  useEffect(() => {
    let live = true
    loadDistricts()
      .then((d) => { if (live) setFeatures(d.features.filter((f: Feature) => LANDMARK_IDS.has(featureId(f)) && f.geometry.type === 'Polygon')) })
      .catch(() => setFeatures([]))
    return () => { live = false }
  }, [])
  if (!features) return null
  const by = (id: string) => features.find((f) => featureId(f) === id)
  const rotunda = by(IDS.rotunda)
  const custard = by(IDS.custard)
  const coach = by(IDS.coach)
  const crown = by(IDS.oldCrown)
  return (
    <group>
      {rotunda && <Rotunda f={rotunda} />}
      {custard && <CustardFactory f={custard} />}
      {coach && <CoachStation f={coach} />}
      {crown && <OldCrown f={crown} />}
      <WarwickBar />
    </group>
  )
}

// Cut-scenes (v51, roadmap 16b). Each scene is a short script played in the game engine: the real city and
// cast, a camera that moves between set positions, the protagonist walking and turning, subtitles, captions and
// fades. The server starts them (a mission's `intro` or `outro`) and waits for the browser to say it's done.
//
// Times are milliseconds from the start of the scene. Positions are world metres (x, z; y is up).

export type Vec3 = [number, number, number]

export type Shot = {
  at: number
  ms: number // how long the camera takes to move from `from` to `to` (it then holds)
  from: Vec3
  to?: Vec3
  /** what it looks at: a point, or the protagonist (`'actor'`, at head height) */
  look: Vec3 | 'actor'
  lookTo?: Vec3
}

export type Move = { at: number; ms: number; to: [number, number] }
export type Pose = { at: number; clip?: 'talk'; face?: number }
/** A subtitle. `voice`: a recorded line in public/audio/voice/ (see docs/voice-script.md); silent if missing. */
export type Line = { at: number; ms: number; who?: string; text: string; phone?: boolean; voice?: string }
export type Caption = { at: number; ms: number; title: string; sub?: string }
export type Fade = { at: number; ms: number; to: 0 | 1 } // 1 = black

export type Scene = {
  id: string
  ms: number
  /** the protagonist: where they stand at the start (ry: facing, radians; 0 faces +z) */
  actor: { x: number; z: number; ry: number }
  moves: Move[]
  poses: Pose[]
  shots: Shot[]
  lines: Line[]
  captions: Caption[]
  fades: Fade[]
}

// ---- Helpers for laying a scene out along a street ----
const along = (p: [number, number], dir: [number, number], s: number): [number, number] => [p[0] + dir[0] * s, p[1] + dir[1] * s]
const v3 = (p: [number, number], y: number): Vec3 => [p[0], y, p[1]]
const angle = (dir: [number, number]) => Math.atan2(dir[0], dir[1])

// ---- Act 1, mission 1: Jordan gets off the coach in Digbeth ----
// Digbeth high street runs north-east here (d); n points from the pavement out to the road.
const d: [number, number] = [0.83, 0.56]
const n: [number, number] = [-0.56, 0.83]
const A0: [number, number] = [-112.5, 83.4] // the coach station doors
const A1 = along(A0, d, 9) // where he stops and reads Leon's text
const off = (p: [number, number], s: number, t: number) => along(along(p, d, s), n, t)

const arrival: Scene = {
  id: 'arrival',
  ms: 21000,
  actor: { x: A0[0], z: A0[1], ry: angle(d) },
  moves: [{ at: 2500, ms: 6400, to: A1 }],
  poses: [{ at: 9300, face: angle(n) }],
  shots: [
    // Wide and high down the high street, sinking towards the station
    { at: 0, ms: 5500, from: v3(off(A0, -30, 14), 22), to: v3(off(A0, -18, 10), 9), look: v3(along(A0, d, 4), 1), lookTo: v3(along(A0, d, 3), 1.2) },
    // Low, in front: he walks towards us
    { at: 5500, ms: 4500, from: v3(off(A0, 14, 2.5), 1.1), to: v3(off(A0, 13, 2.6), 1.15), look: 'actor' },
    // Side on, close: reading the text, looking out at the road
    { at: 10000, ms: 11000, from: v3(off(A1, -2.2, 4.6), 1.75), to: v3(off(A1, -1.4, 3.3), 1.65), look: 'actor' },
  ],
  lines: [
    { at: 10600, ms: 3600, who: 'Leon', phone: true, text: 'You back then? Get some food in you first. Corner shop, Gibb Street.', voice: 'arrival-1-leon.mp3' },
    { at: 14400, ms: 3200, who: 'Leon', phone: true, text: "Then come find me at the yard. Sofa's yours. Don't get comfy.", voice: 'arrival-2-leon.mp3' },
    { at: 17800, ms: 2600, who: 'Jordan', text: 'Back in Brum. With nothing.', voice: 'arrival-3-jordan.mp3' },
  ],
  captions: [{ at: 1000, ms: 4200, title: 'Digbeth Coach Station', sub: 'Birmingham' }],
  fades: [
    { at: 0, ms: 1400, to: 0 },
    { at: 20000, ms: 1000, to: 1 },
  ],
}

export const SCENES: Record<string, Scene> = { arrival }

// ---- Playing a scene: where everything is at time t ----
const ease = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** The protagonist at time t: where, facing which way, and whether walking. */
export function actorAt(scene: Scene, t: number) {
  let x = scene.actor.x
  let z = scene.actor.z
  let ry = scene.actor.ry
  let moving = false
  let speed = 0
  for (const m of scene.moves) {
    if (t < m.at) break
    const k = clamp01((t - m.at) / m.ms)
    const fx = x
    const fz = z
    x = lerp(fx, m.to[0], k)
    z = lerp(fz, m.to[1], k)
    if (k < 1) {
      moving = true
      speed = Math.hypot(m.to[0] - fx, m.to[1] - fz) / (m.ms / 1000)
      ry = Math.atan2(m.to[0] - fx, m.to[1] - fz)
    }
  }
  let pose: 'talk' | undefined
  for (const p of scene.poses) {
    if (t < p.at) break
    if (p.face !== undefined && !moving) ry = p.face
    pose = p.clip
  }
  return { x, z, ry, moving, speed, pose }
}

/** The camera at time t: its position, and the point it looks at. */
export function cameraAt(scene: Scene, t: number, actor: { x: number; z: number }) {
  let shot = scene.shots[0]
  for (const s of scene.shots) if (t >= s.at) shot = s
  const k = ease(clamp01((t - shot.at) / shot.ms))
  const pos = shot.to ? lerp3(shot.from, shot.to, k) : shot.from
  const head: Vec3 = [actor.x, 1.55, actor.z]
  const look = shot.look === 'actor' ? head : shot.lookTo ? lerp3(shot.look, shot.lookTo, k) : shot.look
  return { pos, look }
}

/** How black the screen is at time t (0 to 1). A scene that opens with a fade-in starts black. */
export function fadeAt(scene: Scene, t: number) {
  let level = scene.fades[0]?.at === 0 && scene.fades[0].to === 0 ? 1 : 0
  for (const f of scene.fades) {
    if (t < f.at) break
    level = lerp(level, f.to, clamp01((t - f.at) / f.ms))
  }
  return level
}

// ` (backtick, under Esc) or F3: a small performance read-out (v38). Add ?perf to the address to start
// with it open, for tuning the city. PerfProbe sits inside the Canvas and
// measures; PerfHud is the panel over the game. Nothing is measured into React state, so the panel
// itself costs almost nothing.
import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector2 } from 'three'

const size = new Vector2()
const stats = { fps: 0, ms: 0, worst: 0, calls: 0, tris: 0, geos: 0, texs: 0, w: 0, h: 0, dpr: 1, shadows: false }

/** Inside the Canvas: counts frames and what each one asked the GPU to draw. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  // Development only: lets a test script look at the scene and the camera
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __scene: scene, __camera: camera })
  }, [scene, camera])
  const acc = useRef({ frames: 0, since: performance.now(), last: performance.now(), worst: 0 })

  useEffect(() => {
    // Count every render pass in a frame (the bloom and colour grade render the scene more than once)
    const before = gl.info.autoReset
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = before
    }
  }, [gl])

  // Runs first in every frame: note what the previous frame drew, then start counting afresh
  useFrame(() => {
    const now = performance.now()
    const a = acc.current
    a.worst = Math.max(a.worst, now - a.last)
    a.last = now
    a.frames++
    stats.calls = gl.info.render.calls
    stats.tris = gl.info.render.triangles
    gl.info.reset()
    if (now - a.since >= 500) {
      stats.fps = (a.frames * 1000) / (now - a.since)
      stats.ms = (now - a.since) / a.frames
      stats.worst = a.worst
      stats.geos = gl.info.memory.geometries
      stats.texs = gl.info.memory.textures
      gl.getDrawingBufferSize(size)
      stats.w = size.x
      stats.h = size.y
      stats.dpr = gl.getPixelRatio()
      stats.shadows = gl.shadowMap.enabled
      a.frames = 0
      a.since = now
      a.worst = 0
    }
  }, -1000)
  return null
}

/**
 * Automatic resolution (v40): if the game runs under ~50 fps for a couple of seconds it renders at a
 * slightly smaller size (scaled up to fill the screen), down to 60%; when there's headroom again it
 * creeps back up. ?res=0.75 in the address fixes the scale instead, for testing.
 */
export function AutoResolution() {
  const setDpr = useThree((s) => s.setDpr)
  const top = Math.min(window.devicePixelRatio || 1, 1.25) // no point rendering finer than this for a game
  const fixed = Number(new URLSearchParams(location.search).get('res'))
  const state = useRef({ scale: 1, frames: 0, since: performance.now(), calmUntil: 0, ceiling: 1 })

  useEffect(() => {
    if (fixed > 0.2 && fixed <= 2) setDpr(fixed)
    else setDpr(top)
  }, [fixed, setDpr, top])

  useFrame(() => {
    if (fixed > 0.2) return
    const s = state.current
    const now = performance.now()
    s.frames++
    if (now - s.since < 2000) return
    const fps = (s.frames * 1000) / (now - s.since)
    s.frames = 0
    s.since = now
    if (now < s.calmUntil || document.hidden) return // let the last change settle first
    let next = s.scale
    if (fps < 50 && s.scale > 0.6) {
      next = Math.max(0.6, s.scale - 0.1)
      s.ceiling = s.scale - 0.05 // don't climb straight back to where it was too slow
    } else if (fps > 58 && s.scale < Math.min(1, s.ceiling + 0.05)) {
      next = Math.min(1, s.scale + 0.05)
    }
    if (next !== s.scale) {
      s.scale = next
      s.calmUntil = now + 2500
      setDpr(top * next)
    }
  })
  return null
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`)

/** Over the game: hidden until you press ` or F3 (or the address has ?perf). */
export function PerfHud() {
  const [on, setOn] = useState(() => new URLSearchParams(location.search).has('perf'))
  const [, tick] = useState(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.key === 'F3' || e.code === 'Backquote') {
        e.preventDefault()
        setOn((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(timer)
  }, [on])
  if (!on) return null
  const colour = stats.fps >= 50 ? '#7dffa0' : stats.fps >= 30 ? '#ffe14d' : '#ff7a6b'
  return (
    <div className="perf-hud">
      <b style={{ color: colour }}>{stats.fps.toFixed(0)} fps</b> · {stats.ms.toFixed(1)} ms (worst {stats.worst.toFixed(0)})
      <br />
      {fmt(stats.calls)} draw calls · {fmt(stats.tris)} triangles
      <br />
      {stats.w}×{stats.h} px ({Math.round((stats.w / window.innerWidth) * 100)}% size) · shadows {stats.shadows ? 'on' : 'off'}
      <br />
      {stats.geos} meshes · {stats.texs} textures in memory · ` to hide
    </div>
  )
}

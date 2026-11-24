// Plays a cut-scene (v51): the camera and the protagonist inside the 3D scene (CutsceneDirector), and the
// black bars, subtitles, captions and fades on top (CutsceneOverlay). Space (or Enter) skips.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { NetClient } from '../net/NetClient'
import { SCENES, actorAt, cameraAt, fadeAt } from './scenes'

/** Inside the Canvas, after the Player: takes the camera, and tells the Player where to stand. */
export function CutsceneDirector({ client }: { client: NetClient }) {
  const { camera } = useThree()
  // Recorded voices: each line's file plays once as its subtitle appears; a missing file is just silent
  const voice = useRef<{ at: number; played: Set<number>; clip: HTMLAudioElement | null }>({ at: 0, played: new Set(), clip: null })
  useFrame(() => {
    const playing = client.scene
    const scene = playing ? SCENES[playing.id] : null
    const v = voice.current
    if (!playing || !scene) {
      client.sceneActor = null
      if (v.clip) {
        v.clip.pause() // skipped or over: stop talking
        v.clip = null
      }
      return
    }
    const t = performance.now() - playing.at
    if (v.at !== playing.at) voice.current = { at: playing.at, played: new Set(), clip: null }
    for (const l of scene.lines) {
      const cur = voice.current
      if (!l.voice || cur.played.has(l.at) || t < l.at || t > l.at + l.ms) continue
      cur.played.add(l.at)
      cur.clip?.pause()
      cur.clip = new Audio(`/audio/voice/${l.voice}`)
      cur.clip.volume = 0.9
      cur.clip.play().catch(() => {})
    }
    if (t >= scene.ms) {
      client.endScene()
      return
    }
    const actor = actorAt(scene, t)
    client.sceneActor = actor
    const { pos, look } = cameraAt(scene, t, actor)
    camera.position.set(pos[0], pos[1], pos[2])
    camera.lookAt(look[0], look[1], look[2])
  })
  return null
}

/** Re-renders every frame while a scene plays. */
function useFrameTick(on: boolean) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!on) return
    let id = 0
    const loop = () => {
      tick((n) => n + 1)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [on])
}

/** Bars, subtitles, the place caption, the fade, and the skip hint. */
export function CutsceneOverlay({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const playing = client.scene
  const scene = playing ? SCENES[playing.id] : null
  useFrameTick(Boolean(scene))

  // The HUD steps aside while a scene plays (see .in-scene in hud.css)
  useEffect(() => {
    document.body.classList.toggle('in-scene', Boolean(scene))
    return () => document.body.classList.remove('in-scene')
  }, [scene])

  useEffect(() => {
    if (!scene) return
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        client.endScene()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [scene, client])

  if (!playing || !scene) return null
  const t = performance.now() - playing.at
  const line = scene.lines.find((l) => t >= l.at && t < l.at + l.ms)
  const caption = scene.captions.find((c) => t >= c.at && t < c.at + c.ms)
  return (
    <div className="cutscene">
      <div className="cs-bar cs-top" />
      <div className="cs-bar cs-bottom" />
      {caption ? (
        <div className="cs-caption" key={caption.at}>
          <b>{caption.title}</b>
          {caption.sub ? <span>{caption.sub}</span> : null}
        </div>
      ) : null}
      {line ? (
        <div className={`cs-line ${line.phone ? 'cs-phone' : ''}`} key={line.at}>
          {line.who ? <b>{line.phone ? `${line.who} (text)` : line.who}</b> : null}
          <span>{line.text}</span>
        </div>
      ) : null}
      <div className="cs-fade" style={{ opacity: fadeAt(scene, t) }} />
      <div className="cs-skip">
        <kbd>Space</kbd> skip
      </div>
    </div>
  )
}

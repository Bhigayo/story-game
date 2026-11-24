import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * The cast's gaits (v48): clip name and the ground it covers, in m/s, on the animation library's own
 * mannequin (measured from the root-motion version of each clip). A longer-legged body covers more.
 */
const GAITS = [
  { clip: 'walk', speed: 0.975 },
  { clip: 'jog', speed: 5.36 },
  { clip: 'sprint', speed: 8.25 },
] as const

/** Which gait a ground speed (m/s) is: walking below 2.5, sprinting above 6.6, jogging between. */
/** Clips that can replace the idle stance when standing still. The one-shots play once and hold their last frame. */
const POSES = ['talk', 'death', 'hit'] as const
const ONE_SHOT = new Set<string>(['death', 'hit'])
export type Pose = (typeof POSES)[number]

const gaitFor = (speed: number) => (speed < 2.5 ? 0 : speed < 6.6 ? 1 : 2)

/**
 * Walk cycle for one character, using our OWN AnimationMixer bound straight to the character model.
 * (We used to rely on drei's useAnimations, whose lazily created actions could be left stale after a
 * remount, so the character slid along without moving its legs.)
 *
 * Every clip always runs; only the weights ease up and down, so there is no start/stop state to get
 * stuck. Characters with the full gait set (the cast) blend idle, walk, jog and sprint and play each at
 * the rate that matches how fast they're actually going, so the feet don't skate. Older models have a
 * single walk clip. Call `update` once per frame with whether, and how fast (m/s), the character moves,
 * and optionally a standing pose ('talk').
 */
export function useWalk(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const rig = useMemo(() => {
    const mixer = new THREE.AnimationMixer(model)
    const named = (name: string) => clips.find((c) => c.name === name)
    if (GAITS.every((g) => named(g.clip)) && named('idle')) {
      const idle = mixer.clipAction(named('idle')!)
      const gaits = GAITS.map((g) => {
        const action = mixer.clipAction(named(g.clip)!)
        action.setEffectiveWeight(0)
        return action
      })
      // Standing poses that can take the place of idle (talking, for now; v48)
      const poses = new Map(
        POSES.filter((n) => named(n)).map((n) => {
          const action = mixer.clipAction(named(n)!)
          action.setEffectiveWeight(0)
          if (ONE_SHOT.has(n)) {
            action.setLoop(THREE.LoopOnce, 1)
            action.clampWhenFinished = true
          }
          return [n, action] as const
        }),
      )
      return { mixer, idle, gaits, poses, action: null, last: { pose: undefined as Pose | undefined } }
    }
    const clip = clips.find((c) => /walk/i.test(c.name)) ?? clips[0]
    const action = clip ? mixer.clipAction(clip) : null
    action?.setEffectiveWeight(0)
    // Models that rest in a T-pose ship an Idle clip that fills in whatever the walk weight leaves
    const idleClip = clips.find((c) => /idle/i.test(c.name))
    const idle = idleClip ? mixer.clipAction(idleClip) : null
    return { mixer, action, idle, gaits: null, poses: null, last: { pose: undefined as Pose | undefined } }
  }, [model, clips])

  // Start in an effect (and stop on cleanup) so React StrictMode's mount/unmount/mount cycle is safe
  useEffect(() => {
    const all = [rig.action, rig.idle, ...(rig.gaits ?? []), ...(rig.poses?.values() ?? [])]
    for (const a of all) a?.play()
    return () => {
      for (const a of all) a?.stop()
    }
  }, [rig])

  return useMemo(
    () => ({
      update(delta: number, moving: boolean, speed = 5, pose?: Pose) {
        const { mixer, action, idle, gaits, poses, last } = rig
        // A one-shot (falling down) starts from its first frame each time it's asked for
        if (pose !== last.pose) {
          const a = pose && ONE_SHOT.has(pose) ? poses?.get(pose) : undefined
          if (a) {
            a.reset().play()
            a.setEffectiveWeight(1) // no easing in: you go down at once
          }
          last.pose = pose
        }
        const ease = Math.min(1, delta * 10)
        if (gaits) {
          const legs = (model.userData.stride as number | undefined) ?? 1
          const want = moving ? gaitFor(speed) : -1
          let total = 0
          gaits.forEach((a, i) => {
            if (!a.isRunning()) a.play()
            const w = a.getEffectiveWeight()
            const next = w + ((i === want ? 1 : 0) - w) * ease
            a.setEffectiveWeight(next < 0.01 ? 0 : next)
            a.setEffectiveTimeScale(Math.max(0.6, Math.min(1.6, speed / (GAITS[i].speed * legs))))
            total += next < 0.01 ? 0 : next
          })
          // What's left over goes to standing: idle, or a pose (talking) eased in over it
          let posed = 0
          poses?.forEach((a, name) => {
            if (!a.isRunning()) a.play()
            const w = a.getEffectiveWeight()
            const next = w + ((name === pose && !moving ? 1 : 0) - w) * ease
            const used = (next < 0.01 ? 0 : next) * Math.max(0, 1 - total)
            a.setEffectiveWeight(used)
            posed += used
          })
          idle?.setEffectiveWeight(Math.max(0, 1 - total - posed))
        } else if (action) {
          if (!action.isRunning()) action.play()
          const w = action.getEffectiveWeight()
          const next = w + ((moving ? 1 : 0) - w) * Math.min(1, delta * 14)
          action.setEffectiveWeight(next < 0.01 ? 0 : next)
          action.setEffectiveTimeScale(1)
          idle?.setEffectiveWeight(1 - (next < 0.01 ? 0 : next))
        }
        mixer.update(delta)
      },
    }),
    [rig, model],
  )
}

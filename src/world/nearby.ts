import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { focus } from './focus'

/** A thing in the world with a rough centre and size, so we can tell how far it is from the player. */
export type Spot = { x: number; z: number; r: number }

const MOUNT = 340 // build things this close to the player
const DROP = 400 // and only remove them once they are this far (stops flicker at the edge)
const RECHECK = 20 // metres the player must move before we look again

/**
 * Which of `spots` are near the player right now. Big districts have thousands of buildings and
 * drawing all of them at once is what makes the game slow, so only nearby ones are built.
 * Must be used inside the Canvas.
 */
export function useNearby(spots: Spot[]): Set<number> {
  const [near, setNear] = useState<Set<number>>(() => new Set())
  const last = useRef({ x: Infinity, z: Infinity, spots: null as Spot[] | null })

  useFrame(() => {
    const l = last.current
    if (l.spots === spots && Math.hypot(focus.x - l.x, focus.z - l.z) < RECHECK) return
    l.x = focus.x
    l.z = focus.z
    l.spots = spots

    const next = new Set<number>()
    let changed = false
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]
      const d = Math.hypot(s.x - focus.x, s.z - focus.z) - s.r
      if (d <= MOUNT || (d <= DROP && near.has(i))) next.add(i)
    }
    if (next.size !== near.size) changed = true
    else for (const i of next) if (!near.has(i)) { changed = true; break }
    if (changed) setNear(next)
  })

  return near
}

/** Centre and radius of a list of [x, z] points. */
export function spotOf(points: [number, number][]): Spot {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, r: Math.hypot(maxX - minX, maxZ - minZ) / 2 }
}

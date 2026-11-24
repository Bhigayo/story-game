// "DIGBETH", "BULLRING", "CHINATOWN": the name of the area you've just walked or driven into (v41).
// Each area is the part of the map nearest its centre (real coordinates, from the street plan); the
// banner shows for a few seconds whenever that changes, and once when you arrive in the game.
import { useEffect, useState } from 'react'
import type { NetClient } from './net/NetClient'

const AREAS: { name: string; x: number; z: number }[] = [
  { name: 'Digbeth', x: -48, z: -28 },
  { name: 'Deritend', x: 312, z: 193 },
  { name: 'Bullring', x: -583, z: -161 },
  { name: 'Chinatown', x: -773, z: 138 },
  { name: 'Southside', x: -705, z: 348 },
  { name: 'New Street', x: -943, z: -249 },
  { name: 'Colmore Business District', x: -1044, z: -614 },
  { name: 'Eastside', x: -129, z: -736 },
  { name: 'Bordesley', x: 1024, z: 348 },
  { name: 'Highgate', x: -129, z: 735 },
  { name: 'Moor Street', x: -434, z: -338 },
  { name: 'Gun Quarter', x: -739, z: -1112 },
]
const SHOW_MS = 4200

export function areaAt(x: number, z: number): string {
  let best = AREAS[0]
  let bd = Infinity
  for (const a of AREAS) {
    const d = Math.hypot(a.x - x, a.z - z)
    if (d < bd) {
      bd = d
      best = a
    }
  }
  return best.name
}

export function DistrictBanner({ client }: { client: NetClient }) {
  const [shown, setShown] = useState<{ name: string; at: number } | null>(null)

  useEffect(() => {
    let current = ''
    let pending = ''
    let pendingSince = 0
    const timer = setInterval(() => {
      if (!client.profile) return
      const name = areaAt(client.me.x, client.me.z)
      const now = Date.now()
      if (name === current) {
        pending = ''
        return
      }
      // Must stay in the new area for a moment, so walking along a boundary doesn't flicker
      if (name !== pending) {
        pending = name
        pendingSince = now
        if (current) return
      }
      if (current && now - pendingSince < 1200) return
      current = name
      pending = ''
      setShown({ name, at: now })
    }, 300)
    return () => clearInterval(timer)
  }, [client])

  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(timer)
  }, [shown])

  if (!shown) return null
  return (
    <div className="district-banner" key={shown.at}>
      <div className="district-name">{shown.name}</div>
      <div className="district-city">Birmingham</div>
    </div>
  )
}

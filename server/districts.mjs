// Which parts of Birmingham exist today. Digbeth is always there. The City Centre switches on by
// itself when public/data/centre.geojson is present, and its size is measured from that file.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Same projection the client uses (src/world/geo.ts)
const CENTRE_LON = -1.8850989
const CENTRE_LAT = 52.4759448
export const toWorld = (lon, lat) => [
  (lon - CENTRE_LON) * 111320 * Math.cos((CENTRE_LAT * Math.PI) / 180),
  -(lat - CENTRE_LAT) * 110540,
]

const fileOf = (name) => fileURLToPath(new URL(`../public/data/${name}`, import.meta.url))

function boundsOfFile(name, margin = 25, only = () => true) {
  const path = fileOf(name)
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    const visit = (c) => {
      if (typeof c[0] === 'number') {
        const [x, z] = toWorld(c[0], c[1])
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (z < z0) z0 = z
        if (z > z1) z1 = z
      } else c.forEach(visit)
    }
    for (const f of data.features ?? []) if (f.geometry?.coordinates && only(f)) visit(f.geometry.coordinates)
    if (!Number.isFinite(x0)) return null
    return { x: [x0 - margin, x1 + margin], z: [z0 - margin, z1 + margin] }
  } catch {
    return null
  }
}

const centre = boundsOfFile('centre.geojson')
// Digbeth is the area its buildings cover (the file also holds long rail lines and rivers running off the edge)
const digbeth = boundsOfFile('digbeth.geojson', 40, (f) => Boolean(f.properties?.building)) ?? { x: [-345, 345], z: [-215, 215] }

export const DISTRICTS = [
  { id: 'digbeth', name: 'Digbeth', built: true, ...digbeth },
  { id: 'centre', name: 'City Centre', built: Boolean(centre), ...(centre ?? { x: [0, 0], z: [0, 0] }) },
]

export const districtBuilt = (id) => DISTRICTS.some((d) => d.id === id && d.built)

/** Is this spot inside a part of the city that exists today? */
export const inBounds = (p) => DISTRICTS.some((d) => d.built && p.x >= d.x[0] && p.x <= d.x[1] && p.z >= d.z[0] && p.z <= d.z[1])

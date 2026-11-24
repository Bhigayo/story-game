import { loadDistricts } from './districts'
import { useEffect, useState } from 'react'

// One place that knows how to turn the geojson into game coordinates and map shapes.
// World x/z are metres from this centre point (north is -z), the same as the 3D map.
const CENTRE_LON = -1.8850989
const CENTRE_LAT = 52.4759448

export function toWorld(lon: number, lat: number): [number, number] {
  return [(lon - CENTRE_LON) * 111320 * Math.cos((CENTRE_LAT * Math.PI) / 180), -(lat - CENTRE_LAT) * 110540]
}

// ---- Destination categories ----
// Every named building is a destination. This table says what each kind of building will be for.
// `teaser` is shown on the map until the activity is built; then flip `open` to true and wire it up.
export type VenueCategory =
  | 'hub' | 'club' | 'pub' | 'food' | 'market' | 'college' | 'money'
  | 'garage' | 'tattoo' | 'industry' | 'landmark' | 'other'

export const CATEGORIES: Record<VenueCategory, { label: string; icon: string; colour: string; teaser: string }> = {
  hub: { label: 'Hustle hub', icon: '💡', colour: '#7dd3ff', teaser: 'Hustle for money, pitch to investors and level up your coding.' },
  club: { label: 'Club', icon: '🎧', colour: '#c9a7ff', teaser: 'Party, spray money and meet players after dark.' },
  pub: { label: 'Pub & bar', icon: '🍺', colour: '#ffb86b', teaser: 'Meet people, catch up with friends, spend your wages.' },
  food: { label: 'Food', icon: '🍗', colour: '#ff9a8a', teaser: 'A bite to eat, and shifts behind the counter.' },
  market: { label: 'Market', icon: '🧺', colour: '#a6e36e', teaser: 'Buy, sell and haggle for a deal.' },
  college: { label: 'College', icon: '🎓', colour: '#7da7ff', teaser: 'Study to level up your skills.' },
  money: { label: 'Money & cash', icon: '💷', colour: '#7dffa0', teaser: 'Cash services. High risk, high reward, and the police are never far.' },
  garage: { label: 'Garage', icon: '🔧', colour: '#b0b8c4', teaser: 'Repairs, motors and mechanic work.' },
  tattoo: { label: 'Tattoo studio', icon: '🖋️', colour: '#d9a0d9', teaser: 'Change up your look.' },
  industry: { label: 'Workshop', icon: '🏭', colour: '#d9c28a', teaser: 'Factory and workshop jobs.' },
  landmark: { label: 'Landmark', icon: '⛪', colour: '#e8e0d0', teaser: 'A piece of Birmingham history.' },
  other: { label: 'Local business', icon: '🏪', colour: '#9aa3ad', teaser: 'Something is going on in here. Check back soon.' },
}

export function categoryOf(tags: Record<string, string>): VenueCategory | null {
  const name = tags.name ?? ''
  if (tags.amenity === 'nightclub') return 'club'
  if (tags.amenity === 'pub' || tags.amenity === 'bar') return 'pub'
  if (['fast_food', 'restaurant', 'cafe'].includes(tags.amenity)) return 'food'
  if (tags.amenity === 'marketplace') return 'market'
  if (['money_transfer', 'bank', 'atm'].includes(tags.amenity) || /\bbank\b/i.test(name)) return 'money'
  if (tags.building === 'college') return 'college'
  if (tags.shop === 'car_repair') return 'garage'
  if (tags.shop === 'tattoo') return 'tattoo'
  if (/studio/i.test(name) || (tags.building === 'commercial' && name && Number(tags['building:levels']) >= 4)) return 'hub'
  if (tags.building === 'industrial' && name) return 'industry'
  if (/engineering|fabricat|blacksmith|craft/i.test(name)) return 'industry'
  if (/church|chapel/i.test(name)) return 'landmark'
  return name ? 'other' : null
}

// ---- Shapes for the map ----
export type MapRoad = { d: string; kind: 'major' | 'minor' | 'path' }
export type MapBuilding = { d: string; category: VenueCategory | null }
export type Venue = { id: string; name: string; category: VenueCategory; x: number; z: number }
export type GeoMap = {
  roads: MapRoad[]
  buildings: MapBuilding[]
  venues: Venue[]
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

const MAJOR = ['primary', 'secondary', 'tertiary']
const MINOR = ['unclassified', 'residential', 'service']

const pathOf = (points: [number, number][], close = false) =>
  points.map(([x, z], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${z.toFixed(1)}`).join('') + (close ? 'Z' : '')

function build(data: any): GeoMap {
  const roads: MapRoad[] = []
  const buildings: MapBuilding[] = []
  const venues: Venue[] = []
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  const grow = (x: number, z: number) => {
    b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x)
    b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z)
  }

  for (const f of data.features ?? []) {
    const tags = f.properties ?? {}
    if (f.geometry?.type === 'LineString' && tags.highway) {
      const points = f.geometry.coordinates.map(([lon, lat]: number[]) => toWorld(lon, lat)) as [number, number][]
      points.forEach(([x, z]) => grow(x, z))
      roads.push({ d: pathOf(points), kind: MAJOR.includes(tags.highway) ? 'major' : MINOR.includes(tags.highway) ? 'minor' : 'path' })
    } else if (f.geometry?.type === 'Polygon' && tags.building) {
      const ring = f.geometry.coordinates[0].map(([lon, lat]: number[]) => toWorld(lon, lat)) as [number, number][]
      ring.forEach(([x, z]) => grow(x, z))
      const category = categoryOf(tags)
      buildings.push({ d: pathOf(ring, true), category })
      if (category) {
        const x = ring.reduce((s, p) => s + p[0], 0) / ring.length
        const z = ring.reduce((s, p) => s + p[1], 0) / ring.length
        venues.push({ id: `v${venues.length}`, name: tags.name || CATEGORIES[category].label, category, x, z })
      }
    }
  }
  return { roads, buildings, venues, bounds: b }
}


let cache: Promise<GeoMap> | null = null
export function loadGeo(): Promise<GeoMap> {
  cache ??= loadDistricts()
    .then((data) => build({ features: data.features }))
    .catch((error) => {
      cache = null // try again next time
      throw error
    })
  return cache
}

/** The processed map, or null while it loads. */
export function useGeo(): GeoMap | null {
  const [geo, setGeo] = useState<GeoMap | null>(null)
  useEffect(() => {
    let live = true
    loadGeo().then((g) => live && setGeo(g)).catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return geo
}

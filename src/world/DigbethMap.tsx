// The map from real OpenStreetMap data. Buildings and streets are drawn in merged blocks by
// <CityBlocks /> (v39); land (water, parks, rail) one feature at a time.
import { loadDistricts } from './districts'
import { useEffect, useMemo, useState } from 'react'
import { toWorld } from './geo'
import { spotOf, useNearby } from './nearby'
import { LandFeature, landKind } from './Land'
import { CityBlocks } from './CityChunks'

type Feature = {
  type: string
  properties: Record<string, string>
  geometry: {
    type: string
    coordinates: any
  }
}

type GeoJSONData = {
  type: string
  features: Feature[]
}

export default function DigbethMap() {
  const [data, setData] = useState<GeoJSONData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDistricts()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    console.error(error)
    return null
  }

  if (!data) return null

  return <Features data={data} />
}

/** Buildings and streets come in merged blocks; land (water, parks, rail) is still one feature at a time. */
function Features({ data }: { data: GeoJSONData }) {
  const spots = useMemo(
    () =>
      data.features.map((feature) => {
        const isBuilding = feature.geometry.type === 'Polygon' && feature.properties.building
        const isRoad = feature.geometry.type === 'LineString' && feature.properties.highway
        if (isBuilding || isRoad || landKind(feature) === null) return { x: 1e9, z: 1e9, r: 0 }
        const coords: [number, number][] = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates
        return spotOf(coords.map(([lon, lat]) => toWorld(lon, lat)))
      }),
    [data],
  )
  const near = useNearby(spots)

  return (
    <group>
      <CityBlocks features={data.features} />
      {data.features.map((feature, index) => (near.has(index) ? <LandFeature key={index} feature={feature} /> : null))}
    </group>
  )
}

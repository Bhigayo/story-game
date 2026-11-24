// Every district file lives here. Add a file to this list and the 3D map, pedestrians, street
// furniture, collision and the full map all pick it up. All files must share the SAME centre point
// (see geo.ts) so the districts line up. A file that is missing is skipped, so the game still runs.
export const DISTRICT_FILES = ['/data/digbeth.geojson', '/data/centre.geojson']

type FeatureData = { type: string; features: any[] }

let cache: Promise<FeatureData> | null = null

export function loadDistricts(): Promise<FeatureData> {
  cache ??= Promise.all(
    DISTRICT_FILES.map((file) =>
      fetch(file)
        .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : { features: [] }))
        .catch(() => ({ features: [] })),
    ),
  ).then((files) => {
    // Districts overlap at the edges: keep each OpenStreetMap feature once
    const seen = new Set<string>()
    const features = files
      .flatMap((f: any) => f.features ?? [])
      .filter((f: any) => {
        const id = f.id ?? f.properties?.['@id']
        if (!id) return true
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
    return { type: 'FeatureCollection', features }
  })
  return cache
}

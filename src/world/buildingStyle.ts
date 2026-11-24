import * as THREE from 'three'

// What kind of building is this? Decides colours, window shapes, height and signs.
export type StyleId = 'retail' | 'office' | 'residential' | 'industrial' | 'hotel' | 'civic' | 'parking' | 'mixed'

export type Style = {
  colours: string[]
  brick: boolean // draw the brick pattern
  floorH: number // metres per floor
  levels: [number, number] // typical floors when the map doesn't say
  window: { w: number; h: number; spacing: number; colour: string; emissive: string; first: number }
  sign: { y: number; bg: string[]; fg: string }
}

export const STYLES: Record<StyleId, Style> = {
  retail: {
    colours: ['#B9937A', '#C8A98A', '#A8826A', '#CDB79C', '#9C7B66'],
    brick: true, floorH: 3.2, levels: [2, 4],
    window: { w: 1.0, h: 1.3, spacing: 2.8, colour: '#6C8C98', emissive: '#1B2B33', first: 1 },
    sign: { y: 3.25, bg: ['#23262B', '#1F3B2E', '#3A1F28', '#1E2F4A', '#4A3A1E', '#2B2B2B'], fg: '#F3E6C4' },
  },
  office: {
    colours: ['#7C8794', '#6E7B8A', '#8B949E', '#5F6B78', '#9AA3AD'],
    brick: false, floorH: 3.6, levels: [4, 9],
    window: { w: 2.1, h: 1.6, spacing: 3.0, colour: '#4F7288', emissive: '#16232B', first: 0 },
    sign: { y: 3.0, bg: ['#2C333B', '#243447', '#33373D'], fg: '#E8EEF4' },
  },
  residential: {
    colours: ['#A96F52', '#B78360', '#8D6854', '#9B5F4A', '#A37A62'],
    brick: true, floorH: 3, levels: [3, 6],
    window: { w: 0.9, h: 1.3, spacing: 2.6, colour: '#6C8C98', emissive: '#1B2B33', first: 0 },
    sign: { y: 3, bg: ['#2B2B2B'], fg: '#F3E6C4' },
  },
  industrial: {
    colours: ['#6F7A82', '#7E8A8F', '#8A8478', '#5D686F'],
    brick: false, floorH: 4.5, levels: [1, 2],
    window: { w: 1.4, h: 0.7, spacing: 7, colour: '#55707B', emissive: '#14222A', first: 0 },
    sign: { y: 3.6, bg: ['#C9A227', '#B5442E', '#2D5B7A'], fg: '#FFFFFF' },
  },
  hotel: {
    colours: ['#CDBFA8', '#BDB09A', '#D5C8B2', '#B8A98F'],
    brick: false, floorH: 3.2, levels: [5, 10],
    window: { w: 1.1, h: 1.4, spacing: 2.7, colour: '#6C8C98', emissive: '#1B2B33', first: 1 },
    sign: { y: 3.1, bg: ['#232B3A', '#3A2A23'], fg: '#F5E6B8' },
  },
  civic: {
    colours: ['#B8A88B', '#A89877', '#C4B59A', '#9E9078'],
    brick: false, floorH: 4.2, levels: [2, 4],
    window: { w: 0.95, h: 2.0, spacing: 3.4, colour: '#5E7B87', emissive: '#16232B', first: 0 },
    sign: { y: 3.3, bg: ['#2F2A22', '#26323A'], fg: '#F0E6CF' },
  },
  parking: {
    colours: ['#8A8A86', '#7B7B78', '#9A9993'],
    brick: false, floorH: 3, levels: [3, 5],
    window: { w: 2.8, h: 0.55, spacing: 3.4, colour: '#2B2F33', emissive: '#000000', first: 0 },
    sign: { y: 3, bg: ['#1F4E8C'], fg: '#FFFFFF' },
  },
  mixed: {
    colours: ['#A96F52', '#B78360', '#8D6854', '#9B8270', '#77716A'],
    brick: true, floorH: 3, levels: [2, 4],
    window: { w: 0.85, h: 1.15, spacing: 2.5, colour: '#6C8C98', emissive: '#1B2B33', first: 1 },
    sign: { y: 2.9, bg: ['#382C27'], fg: '#F3E6C4' },
  },
}

export function styleOf(tags: Record<string, string>): StyleId {
  const b = tags.building
  const a = tags.amenity
  if (a === 'parking' || b === 'parking') return 'parking'
  if (tags.tourism === 'hotel' || b === 'hotel') return 'hotel'
  if (['industrial', 'warehouse', 'service', 'garage', 'garages'].includes(b) || tags.shop === 'car_repair') return 'industrial'
  if (['church', 'cathedral', 'chapel', 'public', 'government', 'civic', 'heritage', 'museum', 'university', 'college', 'school', 'hospital'].includes(b)
    || ['place_of_worship', 'townhall', 'courthouse', 'university', 'college', 'school', 'hospital', 'police'].includes(a)) return 'civic'
  if (['apartments', 'residential', 'house', 'terrace', 'dormitory', 'detached'].includes(b)) return 'residential'
  if (tags.shop || ['retail', 'shopping_mall', 'kiosk'].includes(b)
    || ['cafe', 'restaurant', 'fast_food', 'pub', 'bar', 'marketplace', 'cinema', 'theatre', 'nightclub', 'bank', 'pharmacy'].includes(a)) return 'retail'
  if (tags.office || ['office', 'commercial'].includes(b)) return 'office'
  return 'mixed'
}

/** The same number every time for the same building, so heights don't change between visits. */
export function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/** Real height if the map has one, otherwise a believable one for this kind of building. */
export function heightOf(tags: Record<string, string>, style: Style, key: string): number {
  const metres = Number(tags.height)
  if (Number.isFinite(metres) && metres > 2) return metres
  const levels = Number(tags['building:levels'])
  if (Number.isFinite(levels) && levels > 0) return levels * style.floorH
  const [lo, hi] = style.levels
  return Math.round(lo + hashOf(key) * (hi - lo)) * style.floorH
}

const windowMaterials = new Map<StyleId, THREE.MeshStandardMaterial>()
const windowGeometries = new Map<StyleId, THREE.BoxGeometry>()

export function windowAssets(id: StyleId) {
  let material = windowMaterials.get(id)
  if (!material) {
    const w = STYLES[id].window
    material = new THREE.MeshStandardMaterial({ color: w.colour, roughness: 0.22, metalness: 0.05, emissive: w.emissive === '#000000' ? w.emissive : '#FFB257', emissiveIntensity: w.emissive === '#000000' ? 0 : 0.9 })
    windowMaterials.set(id, material)
  }
  let geometry = windowGeometries.get(id)
  if (!geometry) {
    const w = STYLES[id].window
    geometry = new THREE.BoxGeometry(w.w, w.h, 0.08)
    windowGeometries.set(id, geometry)
  }
  return { material, geometry }
}

const signTextures = new Map<string, THREE.CanvasTexture>()

/** One sign is painted into a 512 × 96 slot; the city draws many of them from one shared sheet. */
export const SIGN_W = 512
export const SIGN_H = 96

/** Paints a shop sign with the building's name at (x, y) on a canvas. */
export function paintSign(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, bg: string, fg: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIGN_W, SIGN_H)
  ctx.strokeStyle = fg
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 3
  ctx.strokeRect(5, 5, SIGN_W - 10, SIGN_H - 10)
  ctx.globalAlpha = 1
  const text = name.length > 34 ? name.slice(0, 33) + '…' : name
  let size = 52
  ctx.font = `700 ${size}px system-ui, sans-serif`
  while (ctx.measureText(text).width > SIGN_W - 42 && size > 18) {
    size -= 2
    ctx.font = `700 ${size}px system-ui, sans-serif`
  }
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, SIGN_W / 2, 50)
  ctx.restore()
}

/** A painted shop sign with the building's name, made once per name. */
export function signTexture(name: string, bg: string, fg: string): THREE.CanvasTexture {
  const key = `${name}|${bg}|${fg}`
  let tex = signTextures.get(key)
  if (tex) return tex
  const canvas = document.createElement('canvas')
  canvas.width = SIGN_W
  canvas.height = SIGN_H
  paintSign(canvas.getContext('2d')!, 0, 0, name, bg, fg)
  tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  signTextures.set(key, tex)
  return tex
}

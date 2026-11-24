import * as THREE from 'three'

let glow: THREE.CanvasTexture | null = null

/** Soft round glow, white in the middle fading to nothing. Shared by lamp halos and light pools. */
export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  glow = new THREE.CanvasTexture(c)
  glow.colorSpace = THREE.SRGBColorSpace
  return glow
}

const iconCache = new Map<string, THREE.CanvasTexture>()

/** A round glass badge with an emoji in it, for the floating icons above venues. */
export function badgeTexture(emoji: string, ring: string): THREE.CanvasTexture {
  const key = emoji + ring
  const hit = iconCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const fill = g.createRadialGradient(128, 110, 10, 128, 128, 120)
  fill.addColorStop(0, 'rgba(60,40,100,0.95)')
  fill.addColorStop(1, 'rgba(20,12,44,0.95)')
  g.beginPath()
  g.arc(128, 128, 112, 0, Math.PI * 2)
  g.fillStyle = fill
  g.fill()
  g.lineWidth = 10
  g.strokeStyle = ring
  g.stroke()
  g.font = '120px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(emoji, 128, 136)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  iconCache.set(key, t)
  return t
}

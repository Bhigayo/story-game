import * as THREE from 'three'

/**
 * Clothes cut from the body itself. We copy the triangles that cover the chest and arms,
 * the legs and the feet into new meshes that share the same skeleton, nudged out by a few
 * millimetres. They bend exactly like the body, so there is nothing to deform badly.
 */

type Piece = 'top' | 'bottom' | 'shoes'

const OFFSET: Record<Piece, number> = { top: 0.007, bottom: 0.009, shoes: 0.012 }
const ROUGHNESS: Record<Piece, number> = { top: 0.9, bottom: 0.8, shoes: 0.5 }

export type Outfit = { top: string; bottom: string; shoes: string }

/** Trousers and trainers picked to go with a top colour, so one swatch gives a full outfit. */
export function outfitFor(top: string): Outfit {
  const dark = top.toLowerCase() === '#30343a'
  return { top, bottom: dark ? '#5B616B' : '#252B3A', shoes: '#ECE8E0' }
}

function classify(nx: number, ny: number): Piece | null {
  const ax = Math.abs(nx)
  if (ny < 0.065) return 'shoes'
  if (ny < 0.53) return ax < 0.2 ? 'bottom' : null
  // Chest, from the waist up to just under the neck, and sleeves out to mid upper arm
  if (ny >= 0.53 && ny < 0.855 && ax < 0.115) return 'top'
  if (ny >= 0.66 && ny < 0.885 && ax >= 0.115 && ax < 0.215) return 'top'
  return null
}

export function dress(root: THREE.Object3D, bodyMaterial: string, outfit: Outfit) {
  let body: THREE.SkinnedMesh | null = null
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && !Array.isArray(o.material) && o.material.name === bodyMaterial) body = o
  })
  const mesh = body as THREE.SkinnedMesh | null
  if (!mesh || !mesh.parent) return

  const src = mesh.geometry
  const pos = src.getAttribute('position')
  const nor = src.getAttribute('normal')
  const index = src.getIndex()
  if (!index) return

  src.computeBoundingBox()
  const bb = src.boundingBox!
  const cx = (bb.min.x + bb.max.x) / 2
  const cz = (bb.min.z + bb.max.z) / 2
  void cz
  const H = bb.max.y - bb.min.y

  const kinds: (Piece | null)[] = new Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    kinds[i] = classify((pos.getX(i) - cx) / H, (pos.getY(i) - bb.min.y) / H)
  }

  for (const piece of ['top', 'bottom', 'shoes'] as Piece[]) {
    const keep: number[] = []
    for (let t = 0; t < index.count; t += 3) {
      const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2)
      if (kinds[a] === piece && kinds[b] === piece && kinds[c] === piece) keep.push(a, b, c)
    }
    if (!keep.length) continue

    const remap = new Map<number, number>()
    const used: number[] = []
    const newIndex = keep.map((v) => {
      let n = remap.get(v)
      if (n === undefined) {
        n = used.length
        remap.set(v, n)
        used.push(v)
      }
      return n
    })

    const geo = new THREE.BufferGeometry()
    const take = (name: string, size: number, Type: any) => {
      const a = src.getAttribute(name)
      if (!a) return
      const arr = new Type(used.length * size)
      for (let i = 0; i < used.length; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a.array[used[i] * size + k]
      geo.setAttribute(name, new THREE.BufferAttribute(arr, size, a.normalized))
    }
    const p = new Float32Array(used.length * 3)
    for (let i = 0; i < used.length; i++) {
      const v = used[i]
      p[i * 3] = pos.getX(v) + nor.getX(v) * OFFSET[piece]
      p[i * 3 + 1] = pos.getY(v) + nor.getY(v) * OFFSET[piece]
      p[i * 3 + 2] = pos.getZ(v) + nor.getZ(v) * OFFSET[piece]
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    take('normal', 3, Float32Array)
    take('uv', 2, Float32Array)
    const ji = src.getAttribute('skinIndex')
    const jw = src.getAttribute('skinWeight')
    take('skinIndex', 4, ji.array.constructor)
    take('skinWeight', 4, jw.array.constructor)
    geo.setIndex(newIndex)

    const mat = new THREE.MeshStandardMaterial({ color: outfit[piece], roughness: ROUGHNESS[piece] })
    const shell = new THREE.SkinnedMesh(geo, mat)
    shell.name = `cloth-${piece}`
    shell.userData.piece = piece
    shell.castShadow = mesh.castShadow
    shell.frustumCulled = false
    mesh.parent.add(shell)
    shell.bind(mesh.skeleton, mesh.bindMatrix)
  }
}

export function recolour(root: THREE.Object3D, outfit: Outfit) {
  root.traverse((o) => {
    const piece = o.userData.piece as Piece | undefined
    if (piece && o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).color.set(outfit[piece])
  })
}

import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { dress, outfitFor, recolour } from './clothing'
import type { Gender } from './net/NetClient'

const MODELS: Record<Gender, string> = {
  male: '/models/britlife_male_clean.glb',
  female: '/models/britlife_female_clean.glb',
}

// Licence-unverified placeholder characters for the two protagonists (see CREDITS.md).
// They live in public/models/real/ (gitignored). Build with VITE_REAL_MODELS=0 to use the stock models.
const REAL_ENABLED = import.meta.env.VITE_REAL_MODELS !== '0'
const REAL_MODELS: Record<Gender, string> = {
  male: '/models/real/jordan.glb',
  female: '/models/real/maya.glb',
}

/**
 * The cast (v48): Quaternius Universal Base Characters (CC0), one GLB each in public/models/cast/, all on
 * the same 65-bone skeleton. Their animations live in ONE shared file (Quaternius Universal Animation
 * Library, CC0), so a new character costs only its body. Built by scripts/assets/ (see docs/characters.md).
 */
const CAST_MODELS: Record<string, string> = {
  jordan: '/models/cast/jordan.glb', // male body, buzzed hair
  maya: '/models/cast/maya.glb', // female body, long hair
  adrian: '/models/cast/adrian.glb', // male body, side parting
}
const CAST_ANIMS = '/models/cast/anims.glb'
/** Where the animation library's own mannequin keeps its hips (pelvis rest position, in the root bone's space). */
const UAL_PELVIS = new THREE.Vector3(0, 0.05, 0.917)

/**
 * The library's hip track was recorded on its mannequin; a taller or shorter body needs its hips moved by
 * the difference, or its feet sink into the pavement or float. Also records how much longer the legs are
 * (model.userData.stride), so the walk cycle can be speeded up or slowed to match the ground covered.
 */
function fitClips(clips: THREE.AnimationClip[], model: THREE.Object3D): THREE.AnimationClip[] {
  let pelvis: THREE.Object3D | undefined
  model.traverse((o) => {
    if (o.name === 'pelvis' && !pelvis) pelvis = o
  })
  if (!pelvis) return clips
  const off = pelvis.position.clone().sub(UAL_PELVIS)
  model.userData.stride = pelvis.position.z / UAL_PELVIS.z
  return clips.map((clip) => {
    const copy = clip.clone()
    for (const track of copy.tracks) {
      if (track.name !== 'pelvis.position') continue
      const v = track.values
      for (let i = 0; i < v.length; i += 3) {
        v[i] += off.x
        v[i + 1] += off.y
        v[i + 2] += off.z
      }
    }
    return copy
  })
}

/**
 * Standing pose for the real models (they rest in a T-pose): each upper arm is swung until it points
 * down (slightly outward). Works from the bones' own directions, so it does not depend on how the
 * rig's local axes were rolled.
 */
function idleClip(root: THREE.Object3D): THREE.AnimationClip {
  root.updateMatrixWorld(true)
  const tracks: THREE.QuaternionKeyframeTrack[] = []
  const arm = (match: RegExp, side: number) => {
    root.traverse((o) => {
      if (!(o instanceof THREE.Bone) || !match.test(o.name)) return
      const child = o.children.find((c) => c instanceof THREE.Bone)
      if (!child || !o.parent) return
      const from = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)
      const to = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld)
      const dir = to.sub(from).normalize()
      const want = new THREE.Vector3(side * 0.1, -1, 0).normalize()
      const swing = new THREE.Quaternion().setFromUnitVectors(dir, want)
      const parentQ = o.parent.getWorldQuaternion(new THREE.Quaternion())
      const worldQ = o.getWorldQuaternion(new THREE.Quaternion())
      const q = parentQ.clone().invert().multiply(swing).multiply(worldQ)
      tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, [0], [q.x, q.y, q.z, q.w]))
    })
  }
  arm(/LeftArm$/, 1)
  arm(/RightArm$/, -1)
  return new THREE.AnimationClip('Idle', 1, tracks)
}

// Material names inside the GLBs
const BODY_MATERIAL: Record<Gender, string> = {
  male: 'Human.body.002',
  female: 'Human.001.body.001',
}

const HAIR_MATERIAL: Record<Gender, string> = {
  male: 'Human.afro01.002',
  female: 'Human.long01.001',
}

/** Average colour of a texture (linear), measured once and cached on the texture. */
function averageColour(texture: THREE.Texture): THREE.Color | null {
  const cached = texture.userData.averageColour as THREE.Color | undefined
  if (cached) return cached

  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null

    context.drawImage(texture.image as CanvasImageSource, 0, 0, 16, 16)
    const data = context.getImageData(0, 0, 16, 16).data

    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue // ignore transparent pixels
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
    if (!count) return null

    const average = new THREE.Color().setRGB(
      r / count / 255,
      g / count / 255,
      b / count / 255,
      THREE.SRGBColorSpace,
    )
    texture.userData.averageColour = average
    return average
  } catch {
    return null
  }
}

/**
 * Makes a material come out as `colour` even though it has a texture.
 * A texture is multiplied by the material colour, so tinting a brown skin
 * texture with a brown swatch would give nearly black. We divide by the
 * texture's own average first, so the swatch you pick is what you get.
 */
export function applyColour(material: THREE.Material, colour: string) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return

  const target = new THREE.Color(colour)
  const average = material.map ? averageColour(material.map) : null

  if (average) {
    const safe = (value: number) => Math.max(value, 0.02)
    material.color.setRGB(
      Math.min(target.r / safe(average.r), 6),
      Math.min(target.g / safe(average.g), 6),
      Math.min(target.b / safe(average.b), 6),
      THREE.LinearSRGBColorSpace,
    )
  } else {
    material.color.copy(target)
  }

  material.needsUpdate = true
}

function tint(root: THREE.Object3D, materialName: string, colour: string) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]

    for (const material of materials) {
      if (material.name === materialName) applyColour(material, colour)
    }
  })
}

/**
 * The real models (Man_01 / Woman_01) were exported facing -z, but the game walks characters along +z,
 * so they looked like they were walking backwards. Turn the armature round once.
 */
function faceForward(copy: THREE.Object3D) {
  for (const child of copy.children) child.rotateY(Math.PI)
}

/**
 * Their Walk clip also carries root motion: the hips travel about 1.3 m forward each cycle on top of
 * the game's own movement, so the body surged ahead and snapped back every step. Pin the hips' z (the
 * forward axis in this rig) to the first frame; the side sway and up-and-down bob stay. Returns new clips; the cached originals are untouched.
 */
function inPlace(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.map((clip) => {
    if (!/walk/i.test(clip.name)) return clip
    const copy = clip.clone()
    for (const track of copy.tracks) {
      if (!/hips\.position$/i.test(track.name)) continue
      const v = track.values
      for (let i = 3; i < v.length; i += 3) v[i + 2] = v[2] // forward travel is all on z (150 cm a cycle); keep the x sway and y bob
    }
    return copy
  })
}

/**
 * Gives every caller its OWN copy of the character (skeleton + materials),
 * so the local player and any number of remote players can animate and be
 * coloured independently.
 */
export function useCharacter(
  gender: Gender,
  skin: string,
  hair: string,
  outfit = '#315B78',
  real = false,
  cast?: string,
) {
  const castUrl = real && cast ? CAST_MODELS[cast] : undefined
  const useReal = real && REAL_ENABLED && !castUrl
  const { scene, animations: baked } = useGLTF(castUrl ?? (useReal ? REAL_MODELS[gender] : MODELS[gender]))
  const { animations: library } = useGLTF(CAST_ANIMS)

  const model = useMemo(() => {
    const copy = clone(scene)

    copy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone()
    })

    if (castUrl) {
      copy.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true
      })
      return copy
    }
    if (useReal) faceForward(copy)
    if (!useReal) dress(copy, BODY_MATERIAL[gender], outfitFor(outfit))
    return copy
  }, [scene, gender, useReal, castUrl])

  const animations = useMemo(
    () => (castUrl ? fitClips(library, model) : useReal ? [...inPlace(baked), idleClip(model)] : baked),
    [baked, library, model, useReal, castUrl],
  )

  // The cast's hair and eyebrows share one material (MI_Hair_1 or _2): tint it to the character's hair colour; the body
  // (skin and underwear in one texture) takes the skin colour
  useEffect(() => {
    if (!castUrl) return
    tint(model, 'MI_Hair_1', hair)
    tint(model, 'MI_Hair_2', hair)
    tint(model, 'MI_Superhero_Male', skin)
    tint(model, 'MI_Superhero_Female', skin)
  }, [model, hair, skin, castUrl])

  useEffect(() => {
    if (useReal || castUrl) return
    recolour(model, outfitFor(outfit))
  }, [model, outfit, useReal])

  useEffect(() => {
    if (useReal || castUrl) return
    tint(model, BODY_MATERIAL[gender], skin)
  }, [model, gender, skin, useReal, castUrl])

  useEffect(() => {
    if (useReal || castUrl) return
    tint(model, HAIR_MATERIAL[gender], hair)
  }, [model, gender, hair, useReal, castUrl])

  return { model, animations }
}

useGLTF.preload(MODELS.male)
useGLTF.preload(MODELS.female)
useGLTF.preload(CAST_ANIMS)
for (const url of Object.values(CAST_MODELS)) useGLTF.preload(url)
if (REAL_ENABLED) {
  useGLTF.preload(REAL_MODELS.male)
  useGLTF.preload(REAL_MODELS.female)
}

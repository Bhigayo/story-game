import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, Vignette } from '@react-three/postprocessing'

/** The colour grade: warm glow on lights and windows, a touch more saturation, soft dark corners. */
export default function PostFX() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.25} mipmapBlur />
      <HueSaturation saturation={0.18} />
      <BrightnessContrast contrast={0.08} />
      <Vignette offset={0.3} darkness={0.55} />
    </EffectComposer>
  )
}

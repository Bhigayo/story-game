import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { focus } from './focus'
import { groundPatch } from './surfaces'
import { applyDaylight, daylight, gameHour, rainAmount, skyAt } from './daylight'

// The sun (or moon) keeps the same compass bearing all day: low from the east-south-east, so buildings
// always throw long, readable shadows. Only its height, colour and strength change with the hour (v46).
const SUN_BEARING = new THREE.Vector2(0.7, 0.45).normalize()

const DOME_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const DOME_FRAG = `varying vec3 vDir;
uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uTop; uniform vec3 uSunDir; uniform vec3 uSunColour; uniform float uSunGlow; uniform float uStars;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main(){
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  c = mix(c, uTop, smoothstep(0.12, 0.7, h));
  float sun = pow(max(dot(vDir, uSunDir), 0.0), 40.0);
  c += uSunColour * sun * uSunGlow;
  // a scatter of stars on a clear night
  vec3 cell = floor(vDir * 220.0);
  float star = step(0.9965, hash(cell)) * smoothstep(0.15, 0.5, h) * uStars;
  c += vec3(star * 0.9);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

/** The sky: horizon, middle and overhead colours, the sun's glow and, at night, stars. Follows the player. */
function SkyDome({ uniforms }: { uniforms: Record<string, THREE.IUniform> }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (ref.current) ref.current.position.set(focus.x, 0, focus.z)
  })
  return (
    <mesh ref={ref} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[1000, 24, 16]} />
      <shaderMaterial vertexShader={DOME_VERT} fragmentShader={DOME_FRAG} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  )
}

/** Rain: streaks falling round the camera, one draw call, heavier as `daylight.rain` rises. */
function Rain() {
  const COUNT = 2200
  const { lines, pos, mat } = useMemo(() => {
    const pos = new Float32Array(COUNT * 6)
    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() - 0.5) * 70
      const y = Math.random() * 30
      const z = (Math.random() - 0.5) * 70
      pos.set([x, y, z, x + 0.06, y + 0.75, z + 0.03], i * 6)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.LineBasicMaterial({ color: '#A9B4C4', transparent: true, opacity: 0, depthWrite: false })
    const lines = new THREE.LineSegments(geo, mat)
    lines.frustumCulled = false
    return { lines, pos, mat }
  }, [])
  const camera = useThree((s) => s.camera)
  useFrame((_, delta) => {
    const rain = daylight.rain
    mat.opacity = rain * 0.42
    lines.visible = rain > 0.02
    if (!lines.visible) return
    // drops live in a 70 x 30 x 70 m box that follows the camera; anything leaving it wraps round
    lines.position.set(camera.position.x, Math.max(0, camera.position.y - 12), camera.position.z)
    const fall = 22 * Math.min(delta, 0.05)
    const shown = Math.floor(COUNT * (0.25 + rain * 0.75))
    for (let i = 0; i < COUNT; i++) {
      const o = i * 6
      let y: number
      if (i >= shown) y = -100 // light rain: the rest wait below the ground
      else if (pos[o + 1] < -50) y = Math.random() * 30 // back into the sky as the rain gets heavier
      else {
        y = pos[o + 1] - fall
        if (y < 0) y += 30
      }
      pos[o + 1] = y
      pos[o + 4] = y + 0.75
    }
    ;(lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  })
  return <primitive object={lines} />
}

const SKYLINE: { material: THREE.MeshBasicMaterial | null } = { material: null }

/** A ring of distant silhouettes so the city never just stops. Follows the player, ignores fog. */
function Skyline() {
  const group = useRef<THREE.Group>(null)
  const { geometry, material } = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const COUNT = 140
    for (let i = 0; i < COUNT; i++) {
      const r = (n: number) => Math.abs(Math.sin(i * 91.7 + n * 17.3) * 43758.5453) % 1
      const a = (i / COUNT) * Math.PI * 2 + r(1) * 0.04
      const dist = 900 + r(2) * 60
      const w = 30 + r(3) * 50
      const h = 25 + Math.pow(r(4), 2.4) * 120
      const g = new THREE.BoxGeometry(w, h, 30 + r(5) * 30)
      g.rotateY(-a)
      g.translate(Math.cos(a) * dist, h / 2 - 5, Math.sin(a) * dist)
      geos.push(g)
    }
    const merged = mergeGeometries(geos)!
    const mat = new THREE.MeshBasicMaterial({ color: '#8A6C93', fog: false })
    SKYLINE.material = mat
    return { geometry: merged, material: mat }
  }, [])
  useFrame(() => {
    if (group.current) group.current.position.set(focus.x, 0, focus.z)
  })
  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}

/** Sky, sunlight that follows the player (so shadows stay sharp), fog and ground. */
export default function Atmosphere() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const uniforms = useMemo(
    () => ({
      uHorizon: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uTop: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.7, 0.16, 0.45).normalize() },
      uSunColour: { value: new THREE.Color('#FF9A4D') },
      uSunGlow: { value: 0.8 },
      uStars: { value: 0 },
    }),
    [],
  )
  const wet = useRef(0) // roads stay wet for a while after the rain stops
  const sunDir = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    gl.toneMappingExposure = 1.0
  }, [gl])

  useFrame((_, delta) => {
    // The hour and the weather, the same for every player (v46)
    const now = Date.now()
    const hour = gameHour(now)
    const rain = rainAmount(now)
    daylight.hour = hour
    daylight.rain = rain
    wet.current += ((rain > 0.08 ? 1 : 0) - wet.current) * Math.min(1, delta / (rain > 0.08 ? 25 : 150))
    const sky = skyAt(hour, rain)
    applyDaylight(sky.lights, wet.current)

    // Sun (or moon): its height from the keyframe, its bearing fixed
    sunDir.set(SUN_BEARING.x * Math.cos(sky.sunElevation), Math.sin(sky.sunElevation), SUN_BEARING.y * Math.cos(sky.sunElevation)).normalize()
    const light = sun.current
    if (light) {
      light.position.copy(focus).addScaledVector(sunDir, 160)
      light.target.position.copy(focus)
      light.target.updateMatrixWorld()
      light.color.set(sky.sunColour)
      light.intensity = sky.sunIntensity
    }
    if (hemi.current) {
      hemi.current.color.set(sky.hemiSky)
      hemi.current.groundColor.set(sky.hemiGround)
      hemi.current.intensity = sky.hemiIntensity
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(sky.fog)
      scene.fog.far = 560 - rain * 240 // rain closes the distance in
      scene.fog.near = 140 - rain * 70
    }
    if (scene.background instanceof THREE.Color) scene.background.set(sky.fog)
    scene.environmentIntensity = sky.env
    uniforms.uHorizon.value.set(sky.horizon)
    uniforms.uMid.value.set(sky.mid)
    uniforms.uTop.value.set(sky.top)
    uniforms.uSunDir.value.copy(sunDir)
    uniforms.uSunColour.value.set(sky.sunColour)
    uniforms.uSunGlow.value = (1 - sky.lights) * 0.8 * (1 - rain) + 0.15
    uniforms.uStars.value = Math.max(0, sky.lights - 0.6) * 2.5 * (1 - rain)
    SKYLINE.material?.color.set(sky.skyline)
  })

  return (
    <>
      <color attach="background" args={['#C08A9E']} />
      <fog attach="fog" args={['#C08A9E', 140, 560]} />

      <SkyDome uniforms={uniforms} />
      <Rain />

      <hemisphereLight ref={hemi} args={['#9DA3E8', '#5B4660', 0.8]} />

      <directionalLight
        ref={sun}
        color="#FFB070"
        intensity={3.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />

      {/* Lighting for reflections, built locally: no downloads, so it can never fail offline */}
      <Environment resolution={128} frames={1} environmentIntensity={0.45}>
        <Lightformer form="rect" intensity={2.2} color="#FFE8CC" position={[8, 6, 6]} scale={[14, 10, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#BFD4F2" position={[-8, 4, -6]} scale={[16, 8, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#FFFFFF" position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
      </Environment>

      <Skyline />

      {/* Ground beneath and beyond the city; large enough to vanish into the fog */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial
          color="#6F6C72"
          roughness={1}
          onBeforeCompile={groundPatch}
          customProgramCacheKey={() => 'britlife-ground'}
        />
      </mesh>
    </>
  )
}

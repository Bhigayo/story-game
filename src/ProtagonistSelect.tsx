import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCharacter } from './useCharacter'
import { useWalk } from './useWalk'
import { PROTAGONISTS, type Protagonist } from './protagonists'

/** A slowly turning preview of one protagonist. */
function Preview({ hero }: { hero: Protagonist }) {
  const { model, animations } = useCharacter(hero.gender, hero.skin, hero.hair, hero.outfit, true)
  const pose = useWalk(model, animations)
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    pose.update(dt, false)
    if (group.current) group.current.rotation.y += dt * 0.5
  })
  return (
    <group ref={group} position={[0, -0.95, 0]}>
      <primitive object={model} />
    </group>
  )
}

/** The first screen. No character creator: you are one of two fixed protagonists. */
export default function ProtagonistSelect({ onChoose }: { onChoose: (id: string) => void }) {
  return (
    <main className="hero-select">
      <header>
        <strong>BRIT LIFE</strong>
        <span>CHOOSE WHO YOU ARE</span>
      </header>
      <div className="hero-cards">
        {PROTAGONISTS.map((hero) => (
          <button key={hero.id} className="hero-card" onClick={() => onChoose(hero.id)}>
            <div className="hero-view">
              <Canvas camera={{ position: [0, 0.6, 3.4], fov: 38 }}>
                <ambientLight intensity={0.9} />
                <directionalLight position={[2, 3, 3]} intensity={2.2} color="#FFB070" />
                <directionalLight position={[-3, 1, -2]} intensity={0.8} color="#9DA3E8" />
                <Suspense fallback={null}>
                  <Preview hero={hero} />
                </Suspense>
              </Canvas>
            </div>
            <b>{hero.name}</b>
            <small>{hero.tagline}</small>
            <span className="hero-go">PLAY AS {hero.name.split(' ')[0].toUpperCase()}</span>
          </button>
        ))}
      </div>
      <p>Your choice is saved to your account.</p>
    </main>
  )
}

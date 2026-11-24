import { useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useCharacter } from './useCharacter'
import { useWalk } from './useWalk'
import { ChatBubble } from './ChatUI'
import type { NetClient, RemotePlayerState } from './net/NetClient'

function RemotePlayer({
  id,
  initial,
  client,
}: {
  id: string
  initial: RemotePlayerState
  client: NetClient
}) {
  const group = useRef<THREE.Group>(null)
  const placed = useRef(false)
  const walking = useRef(false)

  const { model, animations } = useCharacter(
    initial.gender,
    initial.skin,
    initial.hair,
    initial.outfit,
    true,
  )
  const walk = useWalk(model, animations)

  useFrame((_, delta) => {
    const target = client.remotes.get(id)
    const body = group.current
    if (!target || !body) return

    // First frame: appear exactly where the player is, don't glide in.
    if (!placed.current) {
      body.position.set(target.x, 0, target.z)
      body.rotation.y = target.ry
      placed.current = true
    }

    // Smooth the 15 Hz network updates into fluid 60 fps movement.
    const k = 1 - Math.exp(-12 * delta)
    body.position.x += (target.x - body.position.x) * k
    body.position.z += (target.z - body.position.z) * k

    let turn = target.ry - body.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn)) // shortest way round
    body.rotation.y += turn * k

    model.visible = !target.veh // a driver is inside their car
    walk.update(delta, target.moving)
    walking.current = target.moving
  })

  return (
    <group ref={group}>
      <primitive object={model} />
      <Html position={[0, 2.15, 0]} center distanceFactor={9} zIndexRange={[4, 0]}>
        <div
          style={{
            color: 'white',
            background: 'rgba(0, 0, 0, 0.55)',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: 'Arial, sans-serif',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {initial.name}
        </div>
      </Html>
      <ChatBubble client={client} id={id} y={2.65} />
    </group>
  )
}

/** Renders every other player currently connected to the server. */
export default function RemotePlayers({ client }: { client: NetClient }) {
  const idsKey = useSyncExternalStore(client.subscribe, client.getIdsKey)
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey])

  return (
    <>
      {ids.map((id) => {
        const state = client.remotes.get(id)
        return state ? (
          <RemotePlayer key={id} id={id} initial={state} client={client} />
        ) : null
      })}
    </>
  )
}

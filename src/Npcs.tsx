import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type * as THREE from 'three'
import type { NetClient, NpcInfo } from './net/NetClient'
import { useCharacter } from './useCharacter'

/** One non-player character standing in the world. They turn to face you when you come close. */
function NpcBody({ npc, client }: { npc: NpcInfo; client: NetClient }) {
  const group = useRef<THREE.Group>(null)
  const { model } = useCharacter(npc.gender, npc.skin, npc.hair, npc.outfit)

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const dx = client.me.x - npc.x
    const dz = client.me.z - npc.z
    const want = Math.hypot(dx, dz) < 9 ? Math.atan2(dx, dz) : npc.ry
    let turn = want - g.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    g.rotation.y += turn * (1 - Math.exp(-6 * delta))
  })

  const near = client.nearNpcId === npc.id
  // A gold ! over the person your current mission wants you to find
  const target = client.missions?.active.find((m) => m.place)?.place === npc.id
  return (
    <group position={[npc.x, 0, npc.z]}>
      <group ref={group} rotation={[0, npc.ry, 0]}>
        <primitive object={model} />
      </group>
      <Html position={[0, 2.35, 0]} center distanceFactor={12} zIndexRange={[4, 0]}>
        <div className={`npc-tag ${near ? 'npc-tag-near' : ''} ${target ? 'npc-tag-mission' : ''}`}>
          {target ? <i>!</i> : null}
          <b>{npc.name}</b>
          <span>{npc.role}</span>
        </div>
      </Html>
    </group>
  )
}

export function Npcs({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  return (
    <>
      {(client.config?.npcs ?? []).map((npc) => (
        <NpcBody key={npc.id} npc={npc} client={client} />
      ))}
    </>
  )
}

/** The conversation box: who is speaking, what they say, and your replies. Keys 1 to 4 pick, Esc leaves. */
export function DialogueHud({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const d = client.dialogue
  const open = Boolean(d)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.key === 'Escape') client.endTalk()
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= 9) client.choose(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, client])

  if (!d) return null
  return (
    <div className="dialogue">
      <div className="dialogue-who">
        <b>{d.name}</b>
        <span>{d.role}</span>
      </div>
      <div className="dialogue-lines">
        {d.lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      <div className="dialogue-choices">
        {d.choices.map((text, i) => (
          <button key={i} onClick={() => client.choose(i)}>
            <kbd>{i + 1}</kbd> {text}
          </button>
        ))}
      </div>
      <small>Esc to walk away</small>
    </div>
  )
}

/** "Press E to talk to Aisha" */
export function NpcPrompt({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const npc = client.config?.npcs?.find((n) => n.id === client.nearNpcId)
  if (!npc || client.dialogue) return null
  return (
    <div className="npc-prompt">
      Press <kbd>E</kbd> to talk to <b>{npc.name}</b>
    </div>
  )
}

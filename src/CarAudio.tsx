// Your car's engine note, and the horn on H (v43).
import { useEffect } from 'react'
import { Engine, crash } from './carSounds'
import type { NetClient } from './net/NetClient'

export function CarAudio({ client }: { client: NetClient }) {
  useEffect(() => {
    const engine = new Engine()
    let running = false
    let lastHp = 100
    let lastId: string | null = null
    const timer = setInterval(() => {
      const id = client.myVehicle
      // A knock: crunch in proportion to the health it cost (v43, C7)
      const hp = id ? client.vehicles.get(id)?.hp ?? 100 : 100
      if (id && id === lastId && hp < lastHp) crash(Math.min(1, (lastHp - hp) / 45))
      lastHp = hp
      lastId = id
      if (id && hp <= 0 && running) {
        engine.stop() // a wreck: the engine's dead
        running = false
        return
      }
      if (id && hp > 0 && !running) {
        engine.start()
        running = true
      } else if (!id && running) {
        engine.stop()
        running = false
      }
      if (id) engine.update(client.vehicles.get(id)?.v ?? 0, Math.max(0, client.lastDrive.t))
    }, 60)
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || e.repeat) return
      if (e.key.toLowerCase() === 'h' && client.myVehicle) client.sendHorn()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(timer)
      window.removeEventListener('keydown', onKey)
      engine.stop()
    }
  }, [client])
  return null
}

// The sound of the city (v46), made in the browser like the car sounds: no files to download.
//  - a low city hum, always there, a little louder in the day
//  - traffic: noise that swells with how many cars are moving near you, and how fast
//  - rain: a hiss that follows the weather
//  - footsteps: a soft scuff for each step while you walk (splashier when the ground is wet)
// Browsers only allow sound after you've pressed a key or clicked, so it all starts then.
import { useEffect } from 'react'
import { audio } from './carSounds'
import { daylight } from './world/daylight'
import type { NetClient } from './net/NetClient'

function noiseSource(c: AudioContext) {
  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const data = buffer.getChannelData(0)
  // brown-ish noise: smoother and deeper than white noise
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  const src = c.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function bed(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const src = noiseSource(c)
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const gain = c.createGain()
  gain.gain.value = 0
  src.connect(filter).connect(gain).connect(c.destination)
  src.start()
  return { gain, filter }
}

function step(c: AudioContext, wet: number) {
  const len = 0.07
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate)
  const d = buffer.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3)
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = (wet > 0.3 ? 1900 : 900) + Math.random() * 300
  filter.Q.value = 1.2
  const gain = c.createGain()
  gain.gain.value = 0.09 + wet * 0.05
  src.connect(filter).connect(gain).connect(c.destination)
  src.start()
}

export function Ambience({ client }: { client: NetClient }) {
  useEffect(() => {
    let started = false
    let city: ReturnType<typeof bed> | null = null
    let traffic: ReturnType<typeof bed> | null = null
    let rain: ReturnType<typeof bed> | null = null
    let last = { x: client.me.x, z: client.me.z }
    let stride = 0

    const start = () => {
      if (started) return
      const c = audio()
      if (!c) return
      started = true
      city = bed(c, 'lowpass', 180)
      traffic = bed(c, 'lowpass', 600)
      rain = bed(c, 'highpass', 2500)
    }
    window.addEventListener('keydown', start)
    window.addEventListener('pointerdown', start)

    const timer = setInterval(() => {
      const c = audio()
      if (!started || !c || !city || !traffic || !rain) return
      const t = c.currentTime
      const day = 1 - daylight.lights
      city.gain.gain.setTargetAtTime(0.05 + day * 0.03, t, 0.5)

      // Traffic: each moving car adds by speed, fading with distance
      let loud = 0
      for (const v of client.vehicles.values()) {
        if (v.id === client.myVehicle) continue
        const d = Math.hypot(v.x - client.me.x, v.z - client.me.z)
        if (d > 90) continue
        loud += (Math.min(Math.abs(v.v), 15) / 15) * (1 / (1 + (d / 14) ** 2))
      }
      traffic.gain.gain.setTargetAtTime(Math.min(0.22, loud * 0.16), t, 0.25)
      traffic.filter.frequency.setTargetAtTime(400 + Math.min(loud, 2) * 350, t, 0.3)

      rain.gain.gain.setTargetAtTime(daylight.rain * (client.myVehicle ? 0.05 : 0.085), t, 0.8)

      // Footsteps: one per stride of the animation, which lengthens with speed (walk ~0.7 m, jog ~2.6 m,
      // sprint ~2.9 m; v48). The timer runs every 80 ms, so speed is distance over 0.08 s.
      const moved = Math.hypot(client.me.x - last.x, client.me.z - last.z)
      last = { x: client.me.x, z: client.me.z }
      if (!client.myVehicle && moved > 0.02 && moved < 3) {
        stride += moved
        const v = moved / 0.08
        if (stride > (v < 2.5 ? 0.7 : v < 6.6 ? 2.6 : 2.9)) {
          stride = 0
          step(c, daylight.rain)
        }
      } else stride = 0
    }, 80)

    return () => {
      clearInterval(timer)
      window.removeEventListener('keydown', start)
      window.removeEventListener('pointerdown', start)
      for (const b of [city, traffic, rain]) b?.gain.gain.setTargetAtTime(0, audio()?.currentTime ?? 0, 0.1)
    }
  }, [client])
  return null
}

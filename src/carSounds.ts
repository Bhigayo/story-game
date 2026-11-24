// Car sounds (v43), made in the browser with the Web Audio API: no sound files to download.
// The engine is two detuned oscillators through a low-pass filter; its pitch follows the speed and
// "changes gear" every ~5 m/s, and it gets louder on the throttle. The horn is a classic two-tone.
let ctx: AudioContext | null = null

export function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume() // browsers only allow sound after a key press or click
    return ctx
  } catch {
    return null // no audio support: the game just runs silently
  }
}

/** The engine note for the car you're driving. */
export class Engine {
  private nodes: { a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null

  start() {
    const c = audio()
    if (!c || this.nodes) return
    const a = c.createOscillator()
    const b = c.createOscillator()
    a.type = 'sawtooth'
    b.type = 'square'
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 700
    filter.Q.value = 2
    const gain = c.createGain()
    gain.gain.value = 0
    const bGain = c.createGain()
    bGain.gain.value = 0.35
    a.connect(filter)
    b.connect(bGain).connect(filter)
    filter.connect(gain).connect(c.destination)
    a.start()
    b.start()
    this.nodes = { a, b, filter, gain }
  }

  /** speed in m/s, throttle 0..1 */
  update(speed: number, throttle: number) {
    const c = ctx
    if (!c || !this.nodes) return
    const v = Math.abs(speed)
    const inGear = v % 5.5 // each "gear" spans ~5.5 m/s (12 mph)
    const gear = Math.min(5, Math.floor(v / 5.5))
    const rpm = 0.25 + (inGear / 5.5) * 0.75 * (gear === 5 ? 1 : 1) // 0.25 (idle) .. 1
    const base = 38 + rpm * 70 + gear * 4
    const t = c.currentTime
    this.nodes.a.frequency.setTargetAtTime(base, t, 0.05)
    this.nodes.b.frequency.setTargetAtTime(base * 0.5 + 1.5, t, 0.05)
    this.nodes.filter.frequency.setTargetAtTime(450 + rpm * 900 + throttle * 600, t, 0.08)
    this.nodes.gain.gain.setTargetAtTime(0.035 + throttle * 0.045 + Math.min(v, 18) * 0.0015, t, 0.08)
  }

  stop() {
    const c = ctx
    if (!c || !this.nodes) return
    const n = this.nodes
    this.nodes = null
    n.gain.gain.setTargetAtTime(0, c.currentTime, 0.08)
    setTimeout(() => {
      n.a.stop()
      n.b.stop()
      n.gain.disconnect()
    }, 400)
  }
}

/** A short two-tone horn. `volume` 0..1 (quieter the further away it is). */
export function horn(volume = 1, length = 0.45) {
  const c = audio()
  if (!c || volume <= 0.01) return
  const t = c.currentTime
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(0.11 * volume, t + 0.02)
  gain.gain.setValueAtTime(0.11 * volume, t + length - 0.05)
  gain.gain.linearRampToValueAtTime(0, t + length)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1800
  filter.connect(gain).connect(c.destination)
  for (const f of [392, 494]) {
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = f
    o.connect(filter)
    o.start(t)
    o.stop(t + length + 0.02)
  }
}

/** A crunch: a burst of filtered noise, louder and lower for a harder hit (v43, C7). `strength` 0..1 */
export function crash(strength: number) {
  const c = audio()
  if (!c || strength <= 0.02) return
  const len = 0.35 + strength * 0.4
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2)
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2400 - strength * 1500
  const gain = c.createGain()
  gain.gain.value = 0.18 + strength * 0.35
  src.connect(filter).connect(gain).connect(c.destination)
  src.start()
}

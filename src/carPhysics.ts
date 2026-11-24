// The same car physics as server/vehicles.mjs (keep the numbers in step), without the walls.
// Your own car runs this locally so it answers your keys at once; the server stays in charge
// and the car is gently pulled back to wherever the server says it is.
export const CAR = {
  wheelbase: 2.6,
  accel: 7,
  brake: 16,
  handbrake: 12,
  drag: 2.2,
  maxForward: 18,
  maxReverse: 5,
  steerAngle: 0.62,
}

export interface CarSim {
  x: number
  z: number
  h: number
  speed: number
  steer: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function stepCar(c: CarSim, dt: number, input: { t: number; s: number; b: boolean }) {
  c.steer += (input.s - c.steer) * Math.min(1, dt * 8)

  let a: number
  if (input.t > 0) a = c.speed < -0.3 ? CAR.brake : CAR.accel * input.t * (1 - Math.max(0, c.speed) / CAR.maxForward)
  else if (input.t < 0) a = c.speed > 0.3 ? -CAR.brake : -CAR.accel * 0.6 * -input.t * (1 - Math.max(0, -c.speed) / CAR.maxReverse)
  else a = -Math.sign(c.speed) * CAR.drag
  if (input.b) a += -Math.sign(c.speed) * CAR.handbrake

  const before = c.speed
  c.speed = clamp(c.speed + a * dt, -CAR.maxReverse, CAR.maxForward)
  if (input.t === 0 && Math.sign(before) !== Math.sign(c.speed) && before !== 0) c.speed = 0
  if (input.b && input.t === 0 && Math.abs(c.speed) < 0.3) c.speed = 0

  const angle = input.s === 0 && Math.abs(c.steer) < 0.02 ? 0 : c.steer * (CAR.steerAngle / (1 + Math.abs(c.speed) / 9))
  const dh = -(c.speed / CAR.wheelbase) * Math.tan(angle) * dt
  const hMid = c.h + dh / 2
  c.x += Math.sin(hMid) * c.speed * dt
  c.z += Math.cos(hMid) * c.speed * dt
  c.h += dh
}

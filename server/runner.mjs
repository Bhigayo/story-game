// Plays missions (v50, E16): starts them when you walk into their marker, checks the current step ten times a
// second, fails them (died, busted, the car wrecked, out of time, left your post), and passes them.
// The mission data and step types are described in missions.mjs. index.mjs owns the player and calls in here;
// everything that has to touch the wider game (paying out, moving you, police) comes in through `game`.
import { MISSIONS, availableFor, missionById, placeOf, startOf } from './missions.mjs'

/** Sends a mission's texts for one moment ('available', 'start', 'pass') through the game (v52). */
function textsFor(p, m, when, game) {
  ;(m.texts ?? []).forEach((text, i) => {
    if (text.when === when) game.text(p, `${m.id}:${when}:${i}`, { from: text.from, body: text.body, mission: when === 'available' ? m.id : null })
  })
}

export const START_RADIUS = 2.4 // walk this close to a yellow marker to start its mission
const RETRY_GRACE_MS = 1500 // a retried step can't fail in its first moments
const SCENE_MAX_MS = 90000 // a cut-scene the browser never reports finished is over after this

/** Is this character free to start a mission? On foot, not wanted, not down, not mid-conversation. */
const free = (p, now) => !p.run && !p.vehicleId && !p.travel && !(p.heat > 0) && !(now < (p.downUntil ?? 0)) && !(now < (p.switchUntil ?? 0))

/** One tick for one player. Call ten times a second. */
export function tickRun(p, now, game) {
  if (!p.run) {
    // Newly open missions text you about it (once each)
    for (const m of availableFor(p.profile, p.story)) textsFor(p, m, 'available', game)
    if (!free(p, now)) return
    for (const m of availableFor(p.profile, p.story)) {
      // starts by itself, once the browser is up and you've been in the city a moment
      if (m.start === 'auto') {
        if (p.firstMoveAt && now - p.firstMoveAt > 1500) startRun(p, m, now, game)
        return
      }
      const at = startOf(m)
      if (!at) continue
      const d = Math.hypot(p.x - at.x, p.z - at.z)
      if (p.markerBlock === m.id) {
        if (d > START_RADIUS * 3) p.markerBlock = null // walked away after quitting: the marker works again
        continue
      }
      if (d <= START_RADIUS) return startRun(p, m, now, game)
    }
    return
  }
  const run = p.run
  if (run.failed) return
  const m = missionById(run.id)
  // A cut-scene playing: nothing counts until it's over (v51)
  if (run.scene) {
    if (now > run.scene.until) sceneOver(p, now, game)
    return
  }
  const step = m.steps[run.step]

  // Failing
  const why = failure(p, run, step, now, game)
  if (why) return failRun(p, why, game)

  // The step done? Then on to the next (several can finish at once, e.g. flags already set)
  if (!stepDone(p, run, step, now, game)) return
  advance(p, run, m, now, game)
}

function startRun(p, m, now, game) {
  p.run = { id: m.id, step: 0, checkpoint: 0, stepAt: now, startedAt: now, deadline: 0, carId: null, failed: null, scene: null }
  if (m.startAt) game.place(p, m.startAt)
  textsFor(p, m, 'start', game)
  if (m.intro) playScene(p, m.intro, 'intro', now, game)
  else game.send(p, { t: 'mission', state: 'start', id: m.id, title: m.title, desc: m.desc })
  beginStep(p, p.run, m, now, game)
}

// ---- Cut-scenes (v51) ----
function playScene(p, id, kind, now, game) {
  p.run.scene = { id, kind, until: now + SCENE_MAX_MS }
  game.send(p, { t: 'scene', id })
}

/** The browser finished (or skipped) a scene. */
export function sceneDone(p, id, now, game) {
  if (p.run?.scene?.id === id) sceneOver(p, now, game)
}

function sceneOver(p, now, game) {
  const run = p.run
  const kind = run.scene.kind
  run.scene = null
  const m = missionById(run.id)
  if (kind === 'outro') return passRun(p, m, game)
  // After the intro: the title, and the clock for the first step starts now
  game.send(p, { t: 'mission', state: 'start', id: m.id, title: m.title, desc: m.desc })
  beginStep(p, run, m, now, game)
}

function beginStep(p, run, m, now, game) {
  const step = m.steps[run.step]
  run.stepAt = now
  run.deadline = step.timer ? now + step.timer : 0
  if (step.checkpoint) run.checkpoint = run.step
  pushRun(p, game)
}

function advance(p, run, m, now, game) {
  run.step++
  if (run.step >= m.steps.length) return m.outro ? playScene(p, m.outro, 'outro', now, game) : passRun(p, m, game)
  beginStep(p, run, m, now, game)
}

function stepDone(p, run, step, now, game) {
  const near = (at, r) => {
    const place = placeOf(at)
    return place && Math.hypot(p.x - place.x, p.z - place.z) <= r
  }
  switch (step.do) {
    case 'goto':
      return (!step.car || p.vehicleId) && near(step.at, step.r ?? 4)
    case 'drive':
      return Boolean(p.vehicleId) && near(step.at, step.r ?? 7)
    case 'car':
      if (!p.vehicleId) return false
      run.carId = p.vehicleId
      return true
    case 'talk':
      return Boolean(p.story.flags?.[step.flag ?? `met:${step.npc}`]) && !game.talking(p)
    case 'flag':
      return Boolean(p.story.flags?.[step.flag]) && !game.talking(p)
    case 'wait':
      return now - run.stepAt >= step.ms
    case 'clear':
      return !(p.heat > 0)
    default:
      return true
  }
}

function failure(p, run, step, now, game) {
  if (now - run.stepAt < RETRY_GRACE_MS) return null
  if (run.deadline && now > run.deadline) return 'You ran out of time.'
  if (run.carId && game.carWrecked(run.carId)) return 'The car was wrecked.'
  if (step.stay) {
    const at = placeOf(step.stay.at)
    if (at && Math.hypot(p.x - at.x, p.z - at.z) > step.stay.r) return step.stay.text ?? 'You left the area.'
  }
  return null
}

/** Failed: the reason goes up on screen; the player chooses retry or quit. Also called on wasted/busted. */
export function failRun(p, reason, game) {
  if (!p.run || p.run.failed) return
  p.run.failed = { reason }
  game.send(p, { t: 'mission', state: 'failed', id: p.run.id, title: missionById(p.run.id)?.title ?? '', reason })
  pushRun(p, game)
}

/** Retry from the last checkpoint (or the start). */
export function retryRun(p, now, game) {
  const run = p.run
  if (!run?.failed) return
  const m = missionById(run.id)
  run.failed = null
  run.carId = null
  run.step = run.checkpoint
  // Back to where the checkpoint step happens, if it has a place
  const step = m.steps[run.step]
  const back = step.stay ? placeOf(step.stay.at) : run.step > 0 ? placeOf(m.steps[run.step - 1].at) : startOf(m)
  if (back) game.place(p, back)
  game.send(p, { t: 'mission', state: 'retry', id: m.id, title: m.title })
  beginStep(p, run, m, now, game)
}

/** Give up: the mission goes back on the map, and its marker waits till you've walked away. */
export function quitRun(p, game) {
  if (!p.run) return
  p.markerBlock = p.run.id
  p.run = null
  pushRun(p, game)
}

function passRun(p, m, game) {
  p.run = null
  textsFor(p, m, 'pass', game)
  game.pass(p, m)
  pushRun(p, game)
}

/** What the browser needs to show the mission being played: the objective, the target, a timer. */
export function runView(p) {
  const run = p.run
  if (!run) return null
  const m = missionById(run.id)
  const step = m.steps[Math.min(run.step, m.steps.length - 1)]
  const target = placeOf(step.at ?? step.npc ?? step.stay?.at ?? null)
  return {
    id: m.id,
    title: m.title,
    step: run.step,
    steps: m.steps.length,
    text: step.text,
    hint: step.hint ?? null,
    target,
    left: run.deadline ? Math.max(0, run.deadline - Date.now()) : 0,
    failed: run.failed?.reason ?? null,
  }
}

function pushRun(p, game) {
  game.send(p, { t: 'run', run: runView(p) })
  game.missionsChanged(p)
}

export { MISSIONS }

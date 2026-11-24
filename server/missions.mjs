// Missions (v50, E16). A mission is plain data: where it starts, whose it is, and a list of steps played in
// order. The server runs them (server/runner.mjs) from what it already knows (where you are, whether you're
// in a car, story flags set by conversations, your wanted level), so nothing can be faked from the browser.
//
// A mission:
//   id, group, order, title, hero ('jordan' | 'maya' | 'adrian'; whose mission it is), requires (a mission id)
//   desc     what the mission log says before you start
//   start    'auto' (starts by itself as soon as it's available) or { at } (a yellow marker you walk into)
//   steps    [step]   played one after another
//   reward   { cash (pence), rep }
//   then     { flags: [..], unlock: 'maya', chapter: 'ch2' }   what passing it changes
//   intro    a cut-scene id (src/cutscenes/scenes.ts) played as it starts; outro: one played before it passes
//   startAt  { x, z }: where you're put as it starts (before the intro), e.g. off the coach
//   texts    [{ from, body, when }]: texts to the phone (v52). when: 'available' (the mission is now open:
//            the text offers Set GPS to its marker), 'start', or 'pass'. `from` is an NPC id (or 'daze'...)
//
// A step (all take `text`, the objective shown on screen):
//   goto     { at, r }          be within r metres (default 4) of a place, person or { x, z }; `car: true` = driving
//   car      {}                 get in a car (that car becomes the mission car: wreck it and you fail)
//   drive    { at, r }          be in a car within r metres (default 7)
//   talk     { npc, flag }      talk to someone until the conversation sets `flag` (default met:<npc>)
//   flag     { flag, at }       a story flag gets set (by a conversation); `at` is just where the marker goes
//   wait     { ms }             hold on for this long
//   clear    {}                 lose the police (no wanted level)
// Step options: checkpoint (a retry starts here), timer (ms to finish this step), stay ({ at, r, text }: leave
// that circle and you fail), hint (a longer line shown once under the objective).
//
// Places for `at`: a map place id ('shop'), a person ('leon'), or a point { x, z, name }.
import { INTERACT_RADIUS, PLACES } from './config.mjs'
import { NPCS } from './npcs.mjs'

const pounds = (n) => n * 100

export const MISSIONS = [
  // ---- Act 1: The Collision ----
  {
    id: 'a1m1', group: 'Act 1: The Collision', order: 0.1, title: 'No Fixed Address', hero: 'jordan',
    desc: "Off the coach with nothing. Leon's text says get something to eat, then find him at the garage yard.",
    start: 'auto',
    startAt: { x: -112.5, z: 83.4 }, // Digbeth Coach Station
    intro: 'arrival',
    texts: [
      { from: 'leon', when: 'start', body: 'You back then? Get some food in you first. Corner shop, Gibb Street.' },
      { from: 'leon', when: 'start', body: "Then come find me at the yard. Sofa's yours. Don't get comfy." },
    ],
    steps: [
      { do: 'goto', at: 'shop', text: 'Get something to eat at the Corner Shop.', hint: 'The gold route on the minimap shows the way. M opens the full map.' },
    ],
    reward: { cash: pounds(5), rep: 10 },
  },
  {
    id: 'a1m2', group: 'Act 1: The Collision', order: 0.2, title: 'Sofa Rules', hero: 'jordan', requires: 'a1m1',
    desc: "Leon's got a sofa, a few rules and, by the look of him, a problem.",
    start: { at: 'leon' },
    texts: [{ from: 'leon', when: 'available', body: "Eaten? Good. Yard's round the back by the Greenhouse. Blue shutter, can't miss it." }],
    steps: [{ do: 'talk', npc: 'leon', text: 'Talk to Leon (E).' }],
    reward: { cash: pounds(10), rep: 15 },
  },
  {
    id: 'a1m3', group: 'Act 1: The Collision', order: 0.3, title: 'Day Shift', hero: 'jordan', requires: 'a1m2',
    desc: "Leon says Aisha's café is always short-handed. Say hello, then have a word with Raymond on Gibb Street.",
    start: { at: 'aisha' },
    texts: [
      { from: 'leon', when: 'available', body: "Aisha's café is always short-handed. Tell her I sent you. Then say hello to Raymond on Gibb Street, he'll talk your ear off." },
      { from: 'daze', when: 'pass', body: "Heard you're back. Don't make me come looking. We'll talk soon." },
    ],
    steps: [
      { do: 'talk', npc: 'aisha', text: 'Say hello to Aisha (E).' },
      { do: 'talk', npc: 'raymond', text: 'Have a word with Raymond on Gibb Street.' },
    ],
    reward: { cash: pounds(15), rep: 20 },
  },
  {
    id: 'a1m4', group: 'Act 1: The Collision', order: 0.4, title: 'Small Favour', hero: 'jordan', requires: 'a1m3',
    desc: 'Leon wants a word. He has a favour to ask. Whatever you tell him, it will matter.',
    start: { at: 'leon' },
    texts: [{ from: 'leon', when: 'available', body: 'Need a word. Come to the yard when you can. Not on the phone.' }],
    steps: [{ do: 'talk', npc: 'leon', flag: 'favour:decided', text: 'Hear Leon out.' }],
    reward: { cash: pounds(10), rep: 15 },
  },
  {
    id: 'a1m5', group: 'Act 1: The Collision', order: 0.5, title: 'The Night It Went Wrong', hero: 'jordan', requires: 'a1m4',
    desc: 'The lock-up near the courier depot. Stand at the end of the lane and whistle if anyone turns up.',
    start: { at: { x: 160, z: 62, name: 'Gibb Street' } },
    texts: [{ from: 'leon', when: 'available', body: "Tonight. Meet me on Gibb Street and I'll walk you down. End of the lane by the lock-up, nine o'clock. Just watch." }],
    steps: [
      { do: 'goto', at: { x: 181, z: 70, name: 'the end of the lane' }, r: 3, text: 'Get to the end of the lane by the lock-up.', timer: 90000, hint: "Leon's friend moves the cash at nine. Don't be late." },
      { do: 'wait', ms: 20000, checkpoint: true, text: 'Keep watch. Stay at the end of the lane.', stay: { at: { x: 181, z: 70 }, r: 9, text: 'You left your post.' } },
      { do: 'talk', npc: 'nia', flag: 'money:missing', text: "It's gone quiet. Too quiet. Find out what happened." },
    ],
    reward: { cash: pounds(25), rep: 30 },
    then: { chapter: 'ch2' },
  },
]

/** Where `at` is: a place id, a person's id, or { x, z, name }. Null if unknown. */
export function placeOf(at) {
  if (!at) return null
  if (typeof at === 'object') return { x: at.x, z: at.z, name: at.name ?? '' }
  const place = PLACES.find((p) => p.id === at)
  if (place) return { x: place.x, z: place.z, name: place.name }
  const npc = NPCS[at]
  return npc ? { x: npc.x, z: npc.z, name: npc.name } : null
}

/** Where a mission's start marker stands (null for missions that start by themselves). */
export function startOf(m) {
  if (m.start === 'auto') return null
  const at = placeOf(m.start.at)
  const npc = typeof m.start.at === 'string' ? NPCS[m.start.at] : null
  // A person's marker stands two metres in front of them, not on top of them
  return npc && at ? { ...at, x: at.x + Math.sin(npc.ry ?? 0) * 2, z: at.z + Math.cos(npc.ry ?? 0) * 2 } : at
}

export const missionById = (id) => MISSIONS.find((m) => m.id === id) ?? null

// ---- Player state ----
export function ensureMissionState(p) {
  p.stats ??= { shifts: 0, earned: 0, bought: 0, months: 0, cleanStreak: 0, visited: {}, met: [] }
  p.stats.visited ??= {}
  p.stats.met ??= []
  p.missions ??= { done: {} }
  p.dreamDone ??= false
  p.rep ??= 0
}

/** Notes places the player is standing at, and other players they are near. Call about once a second. */
export function noteVisits(player, everyone) {
  const stats = player.profile.stats
  let changed = false
  for (const place of PLACES) {
    if (!stats.visited[place.id] && Math.hypot(player.x - place.x, player.z - place.z) <= INTERACT_RADIUS) {
      stats.visited[place.id] = true
      changed = true
    }
  }
  for (const other of everyone) {
    if (other === player) continue
    const tag = other.walletKey.slice(0, 12)
    if (stats.met.length < 60 && !stats.met.includes(tag) && Math.hypot(player.x - other.x, player.z - other.z) <= 7) {
      stats.met.push(tag)
      changed = true
    }
  }
  return changed
}

/** Missions this character could start now: not done, the one before it done, and theirs. */
export const availableFor = (profile, story) =>
  MISSIONS.filter((m) => !profile.missions.done[m.id] && (!m.requires || profile.missions.done[m.requires]) && (!m.hero || m.hero === story.protagonist)).sort(
    (a, b) => a.order - b.order,
  )

/** The mission log: what's available (per character), what's done. `run` is the mission being played. */
export function missionSnapshot(profile, story, run) {
  const row = (m) => ({
    id: m.id,
    title: m.title,
    desc: m.desc,
    group: m.group,
    hero: m.hero ?? null,
    place: m.start === 'auto' ? null : typeof m.start.at === 'string' ? m.start.at : null,
    start: startOf(m),
    cur: run?.id === m.id ? run.step : 0,
    target: m.steps.length,
    money: false,
    cash: m.reward.cash,
  })
  const mine = MISSIONS.filter((m) => !profile.missions.done[m.id] && (!m.requires || profile.missions.done[m.requires])).sort((a, b) => a.order - b.order)
  return {
    active: mine.filter((m) => !m.hero || m.hero === story.protagonist).map(row),
    others: mine.filter((m) => m.hero && m.hero !== story.protagonist).map(row),
    done: MISSIONS.filter((m) => profile.missions.done[m.id]).sort((a, b) => a.order - b.order).map((m) => ({ id: m.id, title: m.title, group: m.group })),
    dream: null,
    rep: profile.rep,
  }
}

/** The map places the story sends you to (the client only gets these; the rest were life-sim venues). */
export const STORY_PLACES = new Set(
  MISSIONS.flatMap((m) => [m.start === 'auto' ? null : m.start.at, ...m.steps.map((s) => s.at)])
    .filter((at) => typeof at === 'string' && PLACES.some((p) => p.id === at)),
)

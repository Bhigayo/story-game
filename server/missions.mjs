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
//   car      {}                 get in a car (that car becomes the mission car: wreck it and you fail). With
//            { carId, spawn: { x, z, h }, colour, carName } the mission parks one for you and waits for that one
//   drive    { at, r }          be in a car within r metres (default 7)
//   talk     { npc, flag }      talk to someone until the conversation sets `flag` (default met:<npc>)
//   flag     { flag, at }       a story flag gets set (by a conversation); `at` is just where the marker goes
//   wait     { ms }             hold on for this long
//   clear    {}                 lose the police (no wanted level)
// Step options: checkpoint (a retry starts here), timer (ms to finish this step), stay ({ at, r, text }: leave
// that circle and you fail), clean (true or a reason: get a wanted level and you fail), hint (a longer line
// shown once under the objective).
// Texts can have `if: { decision: value or [values] }` to arrive only when the story went that way.
//
// Places for `at`: a map place id ('shop'), a person ('leon'), or a point { x, z, name }.
import { INTERACT_RADIUS, PLACES } from './config.mjs'
import { NPCS } from './npcs.mjs'

const pounds = (n) => n * 100

export const MISSIONS = [
  // ---- Act 1: The Collision (story bible, v53) ----
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
      { do: 'talk', npc: 'leon', flag: 'lead:garage', text: 'Find Leon at the garage yard.' },
    ],
    reward: { cash: pounds(5), rep: 10 },
  },
  {
    id: 'a1-favour', group: 'Act 1: The Collision', order: 0.2, title: 'One More Favour', hero: 'jordan', requires: 'a1m1',
    desc: "Leon's supplier has stopped giving him credit. He needs a part, paid in cash, and someone to fetch it.",
    start: { at: 'leon' },
    texts: [
      { from: 'leon', when: 'available', body: "Morning, sleeping beauty. Come to the yard when you're up. Need a hand with something." },
      { from: 'leon', when: 'pass', if: { helpedLeon: 'yes' }, body: "Supplier's back on side. Corsa's out Friday. Owe you one, proper." },
      // Kept the change? Leon finds out (the consequence of decision 1, straight away)
      { from: 'leon', when: 'pass', if: { helpedLeon: 'no', partPrice: ['70', '90'] }, body: 'Bumped into Kenny at the cash and carry. Says he did you a good price on that clutch. Funny, that.' },
    ],
    steps: [
      { do: 'talk', npc: 'leon', flag: 'part:asked', text: 'Talk to Leon.' },
      { do: 'car', carId: 'leon-hatchback', carName: "Leon's hatchback", spawn: { x: 86, z: 81, h: 1.57 }, colour: '#8A8F96', checkpoint: true, text: "Get in Leon's grey hatchback." },
      { do: 'drive', at: { x: 449.4, z: 99.2, name: "Kenny's Motor Spares" }, r: 12, clean: "The police clocked Leon's hatchback. It isn't exactly legal.", text: "Drive to Kenny's Motor Spares on Adderley Street. Keep it clean: no police." },
      { do: 'talk', npc: 'kenny', flag: 'part:bought', checkpoint: true, text: 'Buy the clutch kit from Kenny. Talk him down if you can.' },
      { do: 'drive', at: { x: 84, z: 83, name: "Leon's yard" }, r: 10, clean: "The police clocked Leon's hatchback. It isn't exactly legal.", text: 'Take the part back to the yard. Still no police.' },
      { do: 'talk', npc: 'leon', flag: 'leon:paid', text: 'Give Leon the part.' },
    ],
    reward: { cash: pounds(20), rep: 20 },
  },
  {
    // Interim until mission 3 (A Place to Sit) is rebuilt with Maya and the Custard Factory café
    id: 'a1m3', group: 'Act 1: The Collision', order: 0.3, title: 'A Place to Sit', hero: 'jordan', requires: 'a1-favour',
    desc: "Aisha's café is always short-handed. Say hello, then have a word with Raymond on Gibb Street.",
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

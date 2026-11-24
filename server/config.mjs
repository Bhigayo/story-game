// Brit Life economy configuration. All money is in PENCE.
//
// Real-world anchors (Birmingham, 2026): ONS average rents (1-bed £820, 2-bed £992),
// National Living Wage £12.71/h, Band A council tax £131.27/month, Band B £153.15,
// Band D about £196.91. Rooms, bills and food are estimates. Tune freely.

const env = (name, fallback) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && process.env[name] !== undefined ? value : fallback
}

// ---- Time: 1 real hour online = 1 game month; a shift = one working day ----
export const MONTH_MS = env('MONTH_MS', 3_600_000)
export const DAYS_PER_MONTH = 30
export const DAY_MS = MONTH_MS / DAYS_PER_MONTH // 2 real minutes per game day
export const SHIFT_SCALE = env('SHIFT_SCALE', 1) // tests shrink shift length
export const WORK_HOURS = 8 // one shift = one 8-hour working day

// Day 0 is a Monday. Days 5 and 6 of each week are the weekend (no shifts).
export const isWeekend = (day) => day % 7 >= 5

// ---- Tax (approximate UK rates; monthly-cumulative like a real payslip) ----
export const TAX = {
  monthlyAllowance: 104750, // £12,570 / 12 personal allowance & NI threshold
  incomeRate: 0.2, // basic rate
  niRate: 0.08, // employee National Insurance
}

// ---- Hunger: 0-100, drains with game time, topped up in the shop ----
export const HUNGER = {
  start: 80,
  perDay: Number(process.env.HUNGER_PER_DAY) || 50, // loses 50 per game day (empty in 2 game days / 4 real minutes)
  minToWork: 15, // too hungry to work below this
}

// ---- Housing ----
export const HOMES = {
  sofa: { name: "Friend's sofa", rent: 0, councilTax: 0, bills: 0, note: 'Free, but only until you find your own place' },
  room: { name: 'Room in a shared house', rent: 55000, councilTax: 0, bills: 8000, note: 'Council tax included. Shared kitchen and bathroom.' },
  onebed: { name: '1-bed flat', rent: 82000, councilTax: 13127, bills: 10000, note: 'Your own front door' },
  twobed: { name: '2-bed flat', rent: 99200, councilTax: 15315, bills: 13000, note: 'Room to grow' },
  family: { name: 'Family-owned flat', rent: 0, councilTax: 19691, bills: 15000, note: 'Mortgage paid by the family. You cover council tax and bills.' },
}

// Costs everyone pays every month, wherever they live (estimates)
export const UNIVERSAL_BILLS = [
  { label: 'Bus pass (Swift)', amount: 7000 },
  { label: 'Phone & subscriptions', amount: 3500 },
]

// Homes a player can choose to move into (you only reach "sofa" by eviction,
// and "family" is where NEPO characters start).
export const MOVABLE_HOMES = ['room', 'onebed', 'twobed']

// Five weeks' rent: the legal cap for a tenancy deposit in England. Refunded when you move out.
export const depositFor = (home) => Math.round(((HOMES[home]?.rent ?? 0) * 12) / 52 * 5)

// ---- Starting backgrounds ----
// The story game has no NEPO/LAPO wheel: everyone starts from the same place. ('lapo' and 'nepo'
// stay here only so older saved wallets keep working. The Sims-style game owns that mechanic.)
export const BACKGROUNDS = {
  story: { label: 'Newcomer', balance: 35000, home: 'room', allowance: 0 },
  lapo: { label: 'LAPO', balance: 35000, home: 'room', allowance: 0 },
  nepo: { label: 'NEPO', balance: 120000, home: 'family', allowance: 50000 },
}

export const BACKGROUND_ODDS = { lapo: 0, nepo: 0 }
export const rollBackground = () => 'story'

// ---- Shop ----
export const SHOP = [
  { id: 'snack', name: 'Snack', price: 160, restore: 12 },
  { id: 'mealdeal', name: 'Meal deal', price: 450, restore: 40 },
  { id: 'hot', name: 'Hot meal', price: 850, restore: 70 },
]

// ---- Places in the world ----
export const INTERACT_RADIUS = 3 // how close you must stand
export const LEAVE_RADIUS = 5 // walk further than this and a shift is cancelled

import { districtBuilt } from './districts.mjs'

const ALL_PLACES = [
  { id: 'warehouse', kind: 'job', name: 'Warehouse Packer', x: 153, z: 45, hourly: 1271, seconds: 30 },
  { id: 'cafe', kind: 'job', name: 'Café Barista', x: 168, z: 60, hourly: 1320, seconds: 35 },
  { id: 'courier', kind: 'job', name: 'Courier Run', x: 199, z: 59, hourly: 1450, seconds: 45 },
  { id: 'shop', kind: 'shop', name: 'Corner Shop', x: 141, z: 50 },
  { id: 'lettings', kind: 'lettings', name: 'Lettings Office', x: 140, z: 38 },
  // The first Hustle Hub is The Greenhouse (a real Digbeth building on the map)
  { id: 'greenhouse', kind: 'hub', name: 'The Greenhouse (Hustle Hub)', x: 97, z: 82 },

  // ---- City Centre (only exists once public/data/centre.geojson is in place) ----
  // Rings sit on a free spot at the front of the real building.
  { id: 'primark', venue: 'Primark', kind: 'job', name: 'Primark (Retail Assistant)', x: -654.2, z: -340.3, hourly: 1271, seconds: 30, district: 'centre' },
  { id: 'costa', venue: 'Costa', kind: 'job', name: 'Costa (Barista)', x: -1019.8, z: -290.6, hourly: 1290, seconds: 35, district: 'centre' },
  { id: 'cityshop', venue: 'Select & Save', kind: 'shop', name: 'Select & Save (city prices)', x: -1076.8, z: -138.6, priceMult: 1.15, district: 'centre' },
  { id: 'college', venue: 'BCU International College', kind: 'college', name: 'BCU International College', x: -271.8, z: -689.3, district: 'centre' },
]
export const PLACES = ALL_PLACES.filter((p) => !p.district || districtBuilt(p.district))

export const SPAWN = { x: 129, z: 44 }

// ---- Personality traits (pick 2) ----
// Each trait is a set of multipliers the economy applies. Keep them small and honest.
export const TRAIT_LIMIT = 2
export const TRAITS = {
  hustler: { label: 'Hustler', blurb: 'Sees money everywhere. Every shift pays 8% more and pitches land 5% more often.', mods: { pay: 1.08 }, pitch: 0.05 },
  foodie: { label: 'Foodie', blurb: 'Lives for a balti. Food fills you up 25% more.', mods: { food: 1.25 } },
  penny: { label: 'Penny Pincher', blurb: 'Knows every deal. Everything at the shop is 10% cheaper.', mods: { shop: 0.9 } },
  lazy: { label: 'Lazy Bones', blurb: 'Why rush? You get hungry 25% slower, but shifts pay 5% less.', mods: { hunger: 0.75, pay: 0.95 } },
  gym: { label: 'Gym Rat', blurb: 'Strong worker: shifts pay 4% more. You also get hungry 15% faster.', mods: { pay: 1.04, hunger: 1.15 } },
  smooth: { label: 'Smooth Talker', blurb: 'Mouth sweet like honey. Mission rewards are 20% bigger and investors like you (+10% pitch odds).', mods: { mission: 1.2 }, pitch: 0.1 },
}

// ---- Dreams (pick 1): a long-term goal that follows you around ----
// The objective is evaluated by server/missions.mjs.
export const DREAMS = {
  saver: {
    label: 'Stack Paper',
    blurb: 'Save up £5,000.',
    objective: { type: 'balance', target: 500000, label: 'Hold £5,000' },
    reward: { cash: 25000, rep: 100 },
  },
  roof: {
    label: 'Top Floor Living',
    blurb: 'Move into a two-bed flat.',
    objective: { type: 'home', value: 'twobed', label: 'Live in a two-bed flat' },
    reward: { cash: 20000, rep: 100 },
  },
  grafter: {
    label: 'Proper Grafter',
    blurb: 'Work 60 shifts.',
    objective: { type: 'stat', key: 'shifts', target: 60, label: 'Complete shifts' },
    reward: { cash: 30000, rep: 100 },
  },
  padi: {
    label: "Everybody's Padi",
    blurb: 'Meet 8 different players in Birmingham.',
    objective: { type: 'met', target: 8, label: 'Meet different players' },
    reward: { cash: 15000, rep: 100 },
  },
  investor: {
    label: 'Funded!',
    blurb: 'Win 3 pitches at the Hustle Hub.',
    objective: { type: 'stat', key: 'pitchWins', target: 3, label: 'Successful pitches' },
    reward: { cash: 30000, rep: 100 },
  },
  clean: {
    label: 'Clean Slate',
    blurb: 'Pay every bill on time for 6 months in a row.',
    objective: { type: 'stat', key: 'cleanStreak', target: 6, label: 'Months with every bill paid' },
    reward: { cash: 25000, rep: 100 },
  },
}

// Which mods a player has, combined across their traits
export function modsFor(traits = []) {
  const out = { pay: 1, food: 1, shop: 1, hunger: 1, mission: 1 }
  for (const id of traits) {
    for (const [key, value] of Object.entries((Object.hasOwn(TRAITS, id) ? TRAITS[id].mods : {}))) out[key] *= value
  }
  return out
}

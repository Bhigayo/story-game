// The phone (v52, E17): texts and contacts, kept per character in the story save.
// Missions send texts (see `texts` in missions.mjs): when they become available ('available'), as they start
// ('start') or when they're passed ('pass'). A text can point at a mission, so the phone offers "Set GPS".
// Contacts are the people this character knows: a few from the start, the rest once you've met them.
import { NPCS } from './npcs.mjs'

/** Who each character has in their phone from the beginning (by NPC id, or a name for people not in the city yet). */
const KNOWN = {
  jordan: ['leon', 'daze'],
  maya: ['aisha'],
  adrian: ['mercer'],
}

/** People who text but aren't standing in the city (yet). */
const OFFSTAGE = {
  daze: { name: 'Daze', role: 'Someone you owe' },
  mercer: { name: 'Daniel Mercer', role: 'Meridian, your boss' },
}

const MAX_TEXTS = 80

export function phoneOf(story, hero) {
  story.phones ??= {}
  story.phones[hero] ??= { texts: [], sent: {} }
  return story.phones[hero]
}

/** Adds a text, once (`key` stops the same text arriving twice). Returns it, or null if it was already sent. */
export function addText(story, hero, key, text) {
  const phone = phoneOf(story, hero)
  if (phone.sent[key]) return null
  phone.sent[key] = true
  const item = { id: key, from: text.from, body: text.body, at: Date.now(), read: false, mission: text.mission ?? null }
  phone.texts.push(item)
  if (phone.texts.length > MAX_TEXTS) phone.texts.splice(0, phone.texts.length - MAX_TEXTS)
  return item
}

export function markRead(story, hero, from) {
  for (const t of phoneOf(story, hero).texts) if (t.from === from) t.read = true
}

const person = (id) => (NPCS[id] ? { id, name: NPCS[id].name, role: NPCS[id].role } : OFFSTAGE[id] ? { id, ...OFFSTAGE[id] } : { id, name: id, role: '' })

/** Contacts: who you knew already, anyone you've met, and anyone who has texted you. */
export function contactsOf(story, hero) {
  const ids = new Set(KNOWN[hero] ?? [])
  for (const id of Object.keys(NPCS)) if (story.flags?.[`met:${id}`] && hero === 'jordan') ids.add(id) // conversations so far are Jordan's
  for (const t of phoneOf(story, hero).texts) ids.add(t.from)
  return [...ids].map(person)
}

/** What the browser's phone shows. */
export function phoneSnapshot(story, hero) {
  const phone = phoneOf(story, hero)
  return { t: 'phone', texts: phone.texts, contacts: contactsOf(story, hero) }
}

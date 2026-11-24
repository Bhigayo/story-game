// The three protagonists (v47): you play all of them and switch between them, GTA V-style (see
// docs/story-bible.md). The SERVER decides the name and look, so a client can't invent its own.
// Keep in step with src/protagonists.ts. Colours are placeholders until the licensed models arrive.

export const PROTAGONISTS = {
  jordan: { id: 'jordan', name: 'Jordan Hayes', gender: 'male', skin: '#8B5A40', hair: '#171514', outfit: '#30343A', home: { x: 129, z: 44 }, cash: null },
  maya: { id: 'maya', name: 'Maya Rahman', gender: 'female', skin: '#B87955', hair: '#171514', outfit: '#6B557D', home: { x: 155.8, z: 42 }, cash: 12000 },
  adrian: { id: 'adrian', name: 'Adrian Vale', gender: 'male', skin: '#C68B68', hair: '#2A1E17', outfit: '#1F2A3A', home: { x: -984, z: -647.2 }, cash: 90000 },
}

export const DEFAULT_PROTAGONIST = 'jordan'
export const PROTAGONIST_ORDER = ['jordan', 'maya', 'adrian']

/** Returns the preset for an id, or null if it isn't one of ours. */
export const protagonistFor = (id) => (typeof id === 'string' && Object.hasOwn(PROTAGONISTS, id) ? PROTAGONISTS[id] : null)

/** Who you can switch to. All three for now; once Act I is rewritten, Maya unlocks at mission 3 and Adrian at 4. */
export const unlockedFor = (story) => PROTAGONIST_ORDER.filter((id) => !story.locked?.includes(id))

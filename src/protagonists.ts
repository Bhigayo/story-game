import type { Gender } from './net/NetClient'

// The three protagonists you switch between (v47; see docs/story-bible.md). No character creator.
// Keep this in step with server/protagonists.mjs (the server is the source of truth for the look).
export type Protagonist = {
  id: string
  name: string
  gender: Gender
  skin: string
  hair: string
  outfit: string
  tagline: string
}

export const PROTAGONISTS: Protagonist[] = [
  {
    id: 'jordan',
    name: 'Jordan Hayes',
    gender: 'male',
    skin: '#8B5A40',
    hair: '#171514',
    outfit: '#30343A',
    tagline: 'Back in Birmingham with nothing. Leon’s sofa, and a debt he hasn’t mentioned.',
  },
  {
    id: 'maya',
    name: 'Maya Rahman',
    gender: 'female',
    skin: '#B87955',
    hair: '#171514',
    outfit: '#6B557D',
    tagline: 'Digbeth born. Courier jobs, night study, and a sister fighting for her café.',
  },
  {
    id: 'adrian',
    name: 'Adrian Vale',
    gender: 'male',
    skin: '#C68B68',
    hair: '#2A1E17',
    outfit: '#1F2A3A',
    tagline: 'Junior acquisitions at Meridian. He makes the paperwork happen.',
  },
]

export const protagonistById = (id: string | null | undefined) => PROTAGONISTS.find((p) => p.id === id) ?? null

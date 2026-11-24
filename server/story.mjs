import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Story and progression state. Kept in its OWN file, separate from the wallet/economy profile,
// so the two systems can change and be reset independently. Same key (hash of the token).
// Shape per player:
//   { protagonist, chapterId, activeMissionId, completedMissions[], decisions{}, relationships{}, flags{} }
// Everything is decided on the server. The client only ever displays it.

const FILE = process.env.STORY_FILE || fileURLToPath(new URL('./data/story.json', import.meta.url))

let data = {}
let dirty = false
try {
  if (existsSync(FILE)) data = JSON.parse(readFileSync(FILE, 'utf8'))
} catch (error) {
  console.error('Could not read story file, starting empty:', error.message)
}

export function newStory() {
  return {
    protagonist: null, // 'jordan' | 'maya', chosen once at the start (see protagonists.mjs)
    chapterId: 'ch1',
    activeMissionId: null,
    completedMissions: [],
    decisions: {},
    relationships: {},
    flags: {},
  }
}

export function storyFor(key) {
  let s = data[key]
  if (!s || typeof s !== 'object') {
    s = newStory()
    data[key] = s
    dirty = true
  }
  return s
}

export const touchStory = () => {
  dirty = true
}

export function flushStory() {
  if (!dirty) return
  try {
    mkdirSync(dirname(FILE), { recursive: true })
    writeFileSync(FILE + '.tmp', JSON.stringify(data))
    renameSync(FILE + '.tmp', FILE)
    dirty = false
  } catch (error) {
    console.error('Could not save story:', error.message)
  }
}

setInterval(flushStory, 10000).unref()
// 'exit' fires even when another handler calls process.exit()
process.on('exit', flushStory)

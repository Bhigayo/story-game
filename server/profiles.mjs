import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

// File-backed profile store, keyed by a hash of the player's secret token.
// Fine for a prototype. Swap for Postgres/Supabase when you add real accounts.
const FILE = process.env.WALLET_FILE || fileURLToPath(new URL('./data/wallets.json', import.meta.url))

let data = {}
let dirty = false

try {
  if (existsSync(FILE)) data = JSON.parse(readFileSync(FILE, 'utf8'))
} catch (error) {
  console.error('Could not read profiles file, starting empty:', error.message)
}

export const keyFor = (token) =>
  createHash('sha256').update(String(token)).digest('hex').slice(0, 32)

/** Returns the stored profile (an object, or a bare balance number from the old wallet format). */
export const load = (key) => data[key]

export function save(key, profile) {
  data[key] = profile
  dirty = true
}

export const touch = () => {
  dirty = true
}

export function flush() {
  if (!dirty) return
  try {
    mkdirSync(dirname(FILE), { recursive: true })
    writeFileSync(FILE + '.tmp', JSON.stringify(data))
    renameSync(FILE + '.tmp', FILE) // atomic: never leaves a half-written file
    dirty = false
  } catch (error) {
    console.error('Could not save profiles:', error.message)
  }
}

setInterval(flush, 10000).unref()
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    flush()
    process.exit(0)
  })
}

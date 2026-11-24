// The switch wheel (v47): Tab shows the three protagonists, where each one is, and lets you jump to
// another (1, 2, 3, or click). The server decides whether you can (not while you're wanted).
import { useEffect, useState, useSyncExternalStore } from 'react'
import { areaAt } from './DistrictBanner'
import { protagonistById } from './protagonists'
import type { NetClient } from './net/NetClient'

export function SwitchWheel({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.key === 'Tab') {
        e.preventDefault() // don't move the browser's focus
        if (!e.repeat) setOpen((v) => !v)
        return
      }
      if (e.key === 'Escape') setOpen(false)
      if (!open) return
      const n = Number(e.key)
      const pick = client.cast[n - 1]
      if (pick && pick.unlocked && !pick.active) {
        client.switchTo(pick.id)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [client, open])

  // Close it once a switch is under way
  useEffect(() => {
    if (client.switching) setOpen(false)
  })

  if (!open || !client.cast.length) return null
  const wanted = (client.wanted?.level ?? 0) > 0
  return (
    <div className="switch-wheel" role="dialog" aria-label="Switch character">
      <div className="switch-title">Switch character</div>
      <div className="switch-cards">
        {client.cast.map((c, i) => {
          const hero = protagonistById(c.id)
          const blocked = !c.unlocked || c.active || wanted
          return (
            <button
              key={c.id}
              className={`switch-card${c.active ? ' switch-active' : ''}${!c.unlocked ? ' switch-locked' : ''}`}
              disabled={blocked}
              onClick={() => {
                client.switchTo(c.id)
                setOpen(false)
              }}
            >
              <kbd>{i + 1}</kbd>
              <span className="switch-face" style={{ background: hero?.outfit, borderColor: hero?.skin }}>
                {c.name.split(' ').map((w) => w[0]).join('')}
              </span>
              <b>{c.name}</b>
              <small>{!c.unlocked ? 'Not yet' : c.active ? 'You' : areaAt(c.x, c.z)}</small>
            </button>
          )
        })}
      </div>
      <div className="switch-hint">{wanted ? 'Lose the police before you switch' : 'Tab or Esc to close'}</div>
    </div>
  )
}

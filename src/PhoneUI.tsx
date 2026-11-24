import { useEffect, useSyncExternalStore } from 'react'
import { BankPanel } from './CashUI'
import { MissionLog } from './MissionUI'
import { BigMap, Minimap } from './MapUI'
import { formatMoney, type NetClient, type PhoneApp } from './net/NetClient'
import { audio } from './carSounds'

const APPS: { id: Exclude<PhoneApp, 'home'>; label: string; icon: string; colour: string; key?: string }[] = [
  { id: 'messages', label: 'Messages', icon: '💬', colour: '#34a853' },
  { id: 'contacts', label: 'Contacts', icon: '📇', colour: '#c76b2e' },
  { id: 'missions', label: 'Missions', icon: '🎯', colour: '#e0a63a', key: 'J' },
  { id: 'bank', label: 'Bank', icon: '💷', colour: '#2f9e5f', key: 'B' },
  { id: 'map', label: 'Map', icon: '🗺️', colour: '#3b82c4', key: 'M' },
  { id: 'profile', label: 'Profile', icon: '🪪', colour: '#7a5cd6' },
  { id: 'people', label: 'People', icon: '👥', colour: '#d6568a' },
  { id: 'wiki', label: 'How to play', icon: '📖', colour: '#5a6472' },
]

const title = (app: PhoneApp) => APPS.find((a) => a.id === app)?.label ?? 'Phone'

function Profile({ client }: { client: NetClient }) {
  const missions = client.missions

  return (
    <>
      <div className="m-card">
        <div className="tracker-top">
          <b>{client.myName}</b>
        </div>
        <small>
          {client.story ? `Chapter ${client.story.chapterId.replace(/\D/g, '') || 1} · ` : ''}Reputation {missions?.rep ?? 0}
        </small>
      </div>
    </>
  )
}

function People({ client }: { client: NetClient }) {
  const me = client.me
  const others = [...client.remotes.values()].sort(
    (a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z),
  )
  return (
    <>
      <div className="m-section">
        <h4>{others.length + 1} online in Birmingham</h4>
        <div className="m-card">
          <b>{client.myName}</b> <small>(you)</small>
        </div>
        {others.map((p) => (
          <div className="m-card" key={p.id}>
            <div className="tracker-top">
              <b>{p.name}</b>
              <span>{Math.round(Math.hypot(p.x - me.x, p.z - me.z))} m</span>
            </div>
          </div>
        ))}
        {others.length === 0 ? <p className="panel-note">Nobody else is around yet.</p> : null}
      </div>
      <p className="panel-note">Walk up to someone and say hello in chat (Enter). Meeting people counts towards missions.</p>
    </>
  )
}

function Wiki() {
  return (
    <div className="phone-wiki">
      <h4>Moving</h4>
      <p>WASD or the arrow keys to walk. Drag the mouse to look, scroll to zoom. Enter to chat.</p>
      <h4>People and cars</h4>
      <p>E talks to someone nearby, or gets you in and out of a car. Space is the handbrake.</p>
      <h4>Your phone</h4>
      <p>P opens your phone. J missions, B bank, M the full map: search, tap any building and set a waypoint. The gold line on the map is your route.</p>
      <h4>The story</h4>
      <p>Follow the gold marker. Missions come from the people you meet; what you decide stays with you.</p>
      <h4>The police</h4>
      <p>Patrol cars are about. Steal or carjack a car, run someone down or ram the police and they come looking; red lights, speeding and ramming only count if a patrol sees it. On foot, officers get out and chase you: outrun them or get into a car. Break their line of sight to lose them; get caught and you're fined.</p>
    </div>
  )
}

const when = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** Set the GPS to where a mission starts (from a text about it). */
function gpsTo(client: NetClient, missionId: string) {
  const m = client.missions?.active.find((x) => x.id === missionId)
  if (!m?.start) return false
  client.setWaypoint({ id: null, name: m.start.name || m.title, x: m.start.x, z: m.start.z })
  return true
}

/** Messages (v52): one conversation per person, newest first; open one to read it. */
function Messages({ client }: { client: NetClient }) {
  const from = client.thread
  if (from) {
    const thread = client.texts.filter((t) => t.from === from)
    return (
      <div className="sms">
        <button className="sms-back" onClick={() => client.openThread(null)}>
          ‹ All messages
        </button>
        <h4>{client.contactName(from)}</h4>
        <div className="sms-thread">
          {thread.map((t) => {
            const open = t.mission ? client.missions?.active.find((m) => m.id === t.mission) : null
            return (
              <div className="sms-bubble" key={t.id}>
                <p>{t.body}</p>
                <small>{when(t.at)}</small>
                {open?.start ? (
                  <button className="sms-gps" onClick={() => gpsTo(client, open.id) && client.closePhone()}>
                    📍 Set GPS
                  </button>
                ) : null}
              </div>
            )
          })}
          {thread.length === 0 ? <p className="panel-note">No messages yet.</p> : null}
        </div>
      </div>
    )
  }
  const people = [...new Set([...client.texts].reverse().map((t) => t.from))]
  return (
    <div className="sms">
      {people.map((id) => {
        const last = [...client.texts].reverse().find((t) => t.from === id)!
        const unread = client.texts.filter((t) => t.from === id && !t.read).length
        return (
          <button className={`sms-row ${unread ? 'sms-unread' : ''}`} key={id} onClick={() => client.openThread(id)}>
            <div className="tracker-top">
              <b>{client.contactName(id)}</b>
              <span>{when(last.at)}</span>
            </div>
            <small>{last.body}</small>
            {unread ? <i>{unread}</i> : null}
          </button>
        )
      })}
      {people.length === 0 ? <p className="panel-note">No messages yet.</p> : null}
    </div>
  )
}

/** Contacts (v52): who this character knows. Tap one to see your messages with them. */
function Contacts({ client }: { client: NetClient }) {
  return (
    <div className="sms">
      {client.contacts.map((c) => (
        <button className="sms-row" key={c.id} onClick={() => client.openThread(c.id)}>
          <b>{c.name}</b>
          <small>{c.role}</small>
        </button>
      ))}
      {client.contacts.length === 0 ? <p className="panel-note">Nobody yet.</p> : null}
    </div>
  )
}

/** A short two-note buzz for a new text. */
function ping() {
  const c = audio()
  if (!c) return
  const t = c.currentTime
  for (const [f, d] of [
    [1320, 0],
    [1760, 0.12],
  ]) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = f
    g.gain.setValueAtTime(0, t + d)
    g.gain.linearRampToValueAtTime(0.08, t + d + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18)
    o.connect(g).connect(c.destination)
    o.start(t + d)
    o.stop(t + d + 0.2)
  }
}

/** GTA-style: a new text slides in above the minimap for 6 s. Click it to read. */
function TextPopup({ client }: { client: NetClient }) {
  const n = client.newText
  const at = n?.at ?? 0
  useEffect(() => {
    if (at) ping()
  }, [at])
  if (!n || performance.now() - n.at > 6000 || client.phone === 'messages') return null
  return (
    <button className="sms-pop" key={n.at} onClick={() => (client.openMap(false), client.openThread(n.text.from))}>
      <span className="sms-pop-icon">💬</span>
      <span>
        <b>{client.contactName(n.text.from)}</b>
        <small>{n.text.body}</small>
      </span>
    </button>
  )
}

function Home({ client }: { client: NetClient }) {
  const profile = client.profile
  return (
    <div className="phone-home">
      <div className="phone-clock">
        <b>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
        <span>Birmingham</span>
        <em>{profile ? formatMoney(profile.balance) : ''}</em>
      </div>
      <div className="phone-grid">
        {APPS.map((a) => {
          const badge = a.id === 'missions' ? client.missions?.active.length : a.id === 'messages' ? client.unreadTexts : 0
          return (
            <button key={a.id} className="phone-app" onClick={() => (a.id === 'map' ? client.openMap(true) : client.showApp(a.id))}>
              <span className="phone-icon" style={{ background: a.colour }}>
                {a.icon}
                {badge ? <i>{badge}</i> : null}
              </span>
              <span>{a.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Phone({ client, app }: { client: NetClient; app: PhoneApp }) {
  return (
    <div className="phone" role="dialog" aria-label="Phone">
      <div className="phone-bar">
        {app === 'home' ? <span /> : <button onClick={() => client.showApp('home')}>‹ Home</button>}
        <b>{app === 'home' ? 'Phone' : title(app)}</b>
        <button onClick={() => client.closePhone()} aria-label="Close phone">✕</button>
      </div>
      <div className="phone-body">
        <div className="phone-embed">
          {app === 'home' ? <Home client={client} /> : null}
          {app === 'missions' ? <MissionLog client={client} /> : null}
          {app === 'bank' ? <BankPanel client={client} /> : null}
          {app === 'profile' ? <Profile client={client} /> : null}
          {app === 'people' ? <People client={client} /> : null}
          {app === 'wiki' ? <Wiki /> : null}
          {app === 'messages' ? <Messages client={client} /> : null}
          {app === 'contacts' ? <Contacts client={client} /> : null}
        </div>
      </div>
    </div>
  )
}

/** Minimap, phone button, the phone itself, and the keys that open it. */
export default function PhoneHud({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT' || event.repeat || client.journey) return
      const key = event.key.toLowerCase()
      if (key === 'p') client.phone ? client.closePhone() : (client.openMap(false), client.openPhone('home'))
      else if (key === 'j') (client.openMap(false), client.openPhone('missions'))
      else if (key === 'b') (client.openMap(false), client.openPhone('bank'))
      else if (key === 'm') client.openMap()
      else if (key === 'escape') client.mapOpen ? client.openMap(false) : client.closePhone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [client])

  // Hide behind the setup screens
  if (!client.profile) return null

  return (
    <>
      <Minimap client={client} />
      <TextPopup client={client} />
      <button className="phone-button" onClick={() => client.openPhone('home')} title="Phone (P)">
        📱
        {client.unreadTexts ? <i className="phone-badge">{client.unreadTexts}</i> : null}
      </button>
      {client.phone ? <Phone client={client} app={client.phone} /> : null}
      {client.mapOpen ? <BigMap client={client} /> : null}
    </>
  )
}

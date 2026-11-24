import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatMoney, type MissionRow, type NetClient } from './net/NetClient'

// Money goals show whole pounds so the tracker stays compact: £350 / £5,000
const money = (row: { money: boolean }, n: number) => (row.money ? `£${Math.round(n / 100).toLocaleString('en-GB')}` : String(n))

function Bar({ cur, target }: { cur: number; target: number }) {
  return (
    <div className="m-bar">
      <div style={{ width: `${Math.min(100, (cur / Math.max(1, target)) * 100)}%` }} />
    </div>
  )
}

function placeName(client: NetClient, id: string | null) {
  return client.findTarget(id)?.name ?? null
}

/** mm:ss */
const clock = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/** Re-renders every `ms` while `on` (for timers and fading text). */
function useTicker(on: boolean, ms = 250) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => tick((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [on, ms])
}

/**
 * Top left: the mission you're playing (its objective and timer), or, when you're not on one, your next
 * missions and where they start (v50).
 */
function Tracker({ client }: { client: NetClient }) {
  const state = client.missions
  const run = client.run
  useTicker(Boolean(run && client.runEndsAt))
  if (run) {
    const left = client.runEndsAt ? client.runEndsAt - performance.now() : 0
    return (
      <div className="tracker">
        <div className="tracker-row tracker-main">
          <div className="tracker-top">
            <b>{run.title}</b>
            <span>
              {Math.min(run.step + 1, run.steps)}/{run.steps}
            </span>
          </div>
          <Bar cur={run.step} target={run.steps} />
          <small>{run.failed ? 'Failed' : run.text}</small>
          {client.runEndsAt && !run.failed ? <div className={`run-timer ${left < 10000 ? 'run-timer-low' : ''}`}>{clock(left)}</div> : null}
        </div>
      </div>
    )
  }
  if (!state) return null
  const pinned = state.active.slice(0, 3)
  return (
    <div className="tracker">
      {pinned.map((m, i) => (
        <div className={`tracker-row ${i === 0 ? 'tracker-main' : ''}`} key={m.id}>
          <div className="tracker-top">
            <b>{m.title}</b>
          </div>
          {i === 0 && m.start ? <small>→ Yellow marker: {m.start.name}</small> : null}
        </div>
      ))}
      {pinned.length === 0 && state.others?.length ? <div className="tracker-row"><small>Nothing for this character right now. Tab to switch.</small></div> : null}
      <button className="tracker-more" onClick={() => client.showApp('missions')}>
        All missions <kbd>J</kbd>
      </button>
    </div>
  )
}

/** Bottom centre, GTA-style: the objective when it changes (for 7 s), with its hint underneath. */
function Objective({ client }: { client: NetClient }) {
  const run = client.run
  const age = performance.now() - client.runChangedAt
  const show = Boolean(run && !run.failed && age < 7000)
  useTicker(show, 500)
  if (!show || !run) return null
  return (
    <div className="run-objective" key={client.runChangedAt}>
      <p>{run.text}</p>
      {run.hint && run.step === 0 ? <small>{run.hint}</small> : null}
    </div>
  )
}

/** The mission's title, big, as it starts. */
function TitleCard({ client }: { client: NetClient }) {
  const card = client.missionCard
  if (!card || performance.now() - card.at > 3500) return null
  return (
    <div className="run-title" key={card.at}>
      <b>{card.title}</b>
    </div>
  )
}

/** MISSION FAILED, why, and retry (R) or quit (Q). Waits until the WASTED/BUSTED screen has gone. */
function Failed({ client }: { client: NetClient }) {
  const run = client.run
  const failed = Boolean(run?.failed)
  const down = client.isDown
  useTicker(failed && down, 300)
  useEffect(() => {
    if (!failed) return
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || client.isDown) return
      const k = e.key.toLowerCase()
      if (k === 'r') client.retryMission()
      if (k === 'q') client.quitMission()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [failed, client])
  if (!run?.failed || down) return null
  return (
    <div className="run-failed">
      <strong>MISSION FAILED</strong>
      <span>{run.failed}</span>
      <div className="run-failed-actions">
        <button onClick={() => client.retryMission()}>
          <kbd>R</kbd> Retry
        </button>
        <button onClick={() => client.quitMission()}>
          <kbd>Q</kbd> Quit
        </button>
      </div>
    </div>
  )
}

function MissionCard({ client, m }: { client: NetClient; m: MissionRow }) {
  const where = placeName(client, m.place)
  return (
    <div className="m-card">
      <div className="tracker-top">
        <b>{m.title}</b>
        <span className="m-reward">+{formatMoney(m.cash)}</span>
      </div>
      <p>{m.desc}</p>
      <small>
        {m.hero ? `${m.hero[0].toUpperCase()}${m.hero.slice(1)} · ` : ''}
        {m.target} {m.target === 1 ? 'step' : 'steps'}
        {m.start?.name ? ` · starts at ${m.start.name}` : where ? ` · ${where}` : m.start === null ? ' · starts by itself' : ''}
      </small>
    </div>
  )
}

export function MissionLog({ client }: { client: NetClient }) {
  const state = client.missions
  if (!state) return null
  const groups = [...new Set(state.active.map((m) => m.group))]

  return (
    <div className="panel mission-log">
      <div className="panel-head">
        <b>Missions</b>
        <span className="m-rep">Reputation {state.rep}</span>
        <button className="panel-close" onClick={() => client.closePhone()}>
          ✕
        </button>
      </div>

      {state.dream ? (
        <div className="m-section">
          <h4>Your dream</h4>
          <div className={`m-card m-dream ${state.dream.done ? 'm-done' : ''}`}>
            <div className="tracker-top">
              <b>{state.dream.title}</b>
              <span className="m-reward">{state.dream.done ? 'Done ✓' : `+${formatMoney(state.dream.cash)}`}</span>
            </div>
            <p>{state.dream.desc}</p>
            <Bar cur={state.dream.cur} target={state.dream.target} />
            <small>
              {money(state.dream, state.dream.cur)} / {money(state.dream, state.dream.target)}
            </small>
          </div>
        </div>
      ) : null}

      {groups.map((group) => (
        <div className="m-section" key={group}>
          <h4>{group}</h4>
          {state.active
            .filter((m) => m.group === group)
            .map((m) => (
              <MissionCard client={client} m={m} key={m.id} />
            ))}
        </div>
      ))}

      {state.active.length === 0 ? <p className="panel-note">All current missions done. More are coming.</p> : null}

      {state.others?.length ? (
        <div className="m-section">
          <h4>Other characters</h4>
          {state.others.map((m) => (
            <MissionCard client={client} m={m} key={m.id} />
          ))}
        </div>
      ) : null}

      {state.done.length > 0 ? (
        <div className="m-section">
          <h4>Completed ({state.done.length})</h4>
          <div className="m-done-list">
            {state.done.map((d) => (
              <span key={d.id}>✓ {d.title}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Banner({ client }: { client: NetClient }) {
  const done = client.missionBanner
  if (!done || Date.now() - done.at > 5000) return null
  return (
    <div className="m-banner" key={done.at}>
      <small>{done.dream ? 'DREAM ACHIEVED' : 'MISSION PASSED'}</small>
      <b>{done.title}</b>
      <span>
        +{formatMoney(done.cash)} · +{done.rep} reputation
      </span>
    </div>
  )
}

/** The tracker and the "mission complete" banner. The full log lives in the phone (J). */
export default function MissionHud({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)

  // Hide behind the setup screens
  if (!client.profile) return null

  return (
    <>
      <Tracker client={client} />
      <Banner client={client} />
      <Objective client={client} />
      <TitleCard client={client} />
      <Failed client={client} />
    </>
  )
}

import { useSyncExternalStore } from 'react'
import type { NetClient } from './net/NetClient'

const TABS: { key: string; label: string; icon: string; run: (c: NetClient) => void }[] = [
  { key: 'M', label: 'Map', icon: '🗺️', run: (c) => c.openMap() },
  { key: 'J', label: 'Missions', icon: '🎯', run: (c) => (c.openMap(false), c.openPhone('missions')) },
  { key: 'B', label: 'Bank', icon: '🏦', run: (c) => (c.openMap(false), c.openPhone('bank')) },
  { key: 'P', label: 'Phone', icon: '📱', run: (c) => (c.phone ? c.closePhone() : (c.openMap(false), c.openPhone('home'))) },
]

/** Top bar: logo and district on the left, nav tabs in the middle, online count on the right. */
export default function TopBar({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const summary = useSyncExternalStore(client.subscribe, client.getSummary)
  const [status, others] = summary.split('|')
  const online = status === 'online'

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <strong>BRIT LIFE</strong>
        <span>BIRMINGHAM</span>
      </div>

      <nav className="topbar-nav">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => t.run(client)}>
            <i>{t.icon}</i>
            {t.label}
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <div className={`topbar-online ${online ? 'on' : ''}`}>
          <i />
          {online ? `${Number(others) + 1} online` : status === 'connecting' ? 'Connecting' : 'Offline'}
        </div>
      </div>
    </header>
  )
}

/** Recent public happenings: promotions and story milestones. */
export function CityFeed({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const items = client.feed.slice(-5)
  if (!items.length) return null
  return (
    <div className="city-feed">
      <div className="city-feed-title">CITY FEED</div>
      {items.map((f, i) => (
        <div key={f.at + ':' + i} className={`city-feed-row feed-${f.kind}`}>
          {f.kind === 'promo' ? '📈' : f.kind === 'story' ? '📖' : '•'} {f.text}
        </div>
      ))}
    </div>
  )
}

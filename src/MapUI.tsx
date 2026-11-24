import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CATEGORIES, useGeo, type GeoMap, type VenueCategory } from './world/geo'
import { formatMoney, jobPay, routeAhead, type NetClient, type PlaceKind, type Quote } from './net/NetClient'

const KIND_COLOUR: Record<PlaceKind, string> = { job: '#ffd27a', shop: '#7dd3ff', lettings: '#c9a7ff', hub: '#6ee7d4', college: '#f9a8d4' }
const KIND_ICON: Record<PlaceKind, string> = { job: '💼', shop: '🛒', lettings: '🏠', hub: '💡', college: '🎓' }

/** Where the gold marker points: a waypoint you set, otherwise your current mission's place. */
export function currentTarget(client: NetClient) {
  // Playing a mission (v50): its objective comes first
  const run = client.run
  if (run && !run.failed && run.target) return { id: null, ...run.target, kind: 'mission' as const }
  if (client.waypoint) return { ...client.waypoint, kind: 'waypoint' as const }
  if (run) return null
  // Otherwise: the yellow start marker of your next mission
  const next = client.missions?.active.find((m) => m.start)
  return next?.start ? { id: null, ...next.start, kind: 'mission' as const } : null
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.round(Math.hypot(a.x - b.x, a.z - b.z))

/** The GPS route still ahead of you to `target`, if the server's route is for this target. */
function gpsFor(client: NetClient, target: { x: number; z: number } | null) {
  const gps = client.gps
  if (!target || !gps || Math.hypot(gps.to.x - target.x, gps.to.z - target.z) > 3) return null
  const ahead = routeAhead(gps.pts, client.me)
  return { ok: gps.ok, pts: ahead.pts.map(([x, z]) => `${x},${z}`).join(' '), length: ahead.length }
}

/** The gold route line: a dark casing under it so it reads on any background. Dashed if there is no road route. */
function RouteLine({ route, me, target, w }: { route: ReturnType<typeof gpsFor>; me: { x: number; z: number }; target: { x: number; z: number }; w: number }) {
  if (route?.ok) {
    return (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
        <polyline points={route.pts} stroke="#1a1408" strokeOpacity={0.75} strokeWidth={w * 1.8} />
        <polyline points={route.pts} stroke="#ffe14d" strokeWidth={w} />
      </g>
    )
  }
  return <line x1={me.x} y1={me.z} x2={target.x} y2={target.z} stroke="#ffe14d" strokeWidth={w * 0.7} strokeDasharray={`${w * 2} ${w * 2}`} strokeOpacity={0.8} pointerEvents="none" />
}

/** Roads and buildings. Drawn once; the map moves by changing the viewBox. */
const StaticLayer = memo(function StaticLayer({ geo }: { geo: GeoMap }) {
  return (
    <g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {geo.roads.filter((r) => r.kind === 'path').map((r, i) => <path key={i} d={r.d} stroke="#323a44" strokeWidth={1.6} />)}
        {geo.roads.filter((r) => r.kind === 'minor').map((r, i) => <path key={i} d={r.d} stroke="#414a56" strokeWidth={6} />)}
        {geo.roads.filter((r) => r.kind === 'major').map((r, i) => <path key={i} d={r.d} stroke="#5a6472" strokeWidth={9} />)}
      </g>
      <g strokeWidth={0.6} stroke="#3c4550">
        {geo.buildings.map((b, i) => (
          <path
            key={i}
            d={b.d}
            fill={b.category ? CATEGORIES[b.category].colour : '#2c333c'}
            fillOpacity={b.category ? 0.35 : 1}
          />
        ))}
      </g>
    </g>
  )
})

/** Small round map in the corner: north is up, centred on you. */
export function Minimap({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const geo = useGeo()
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 100)
    return () => clearInterval(timer)
  }, [])

  const R = 60
  const me = client.me
  const target = currentTarget(client)
  client.updateGps(target)
  const route = gpsFor(client, target)

  // If the target is off the edge of the minimap, show it as a marker on the rim
  let tx = 0
  let tz = 0
  let onRim = false
  if (target) {
    const d = Math.hypot(target.x - me.x, target.z - me.z)
    const k = d > R * 0.86 ? (R * 0.86) / d : 1
    tx = me.x + (target.x - me.x) * k
    tz = me.z + (target.z - me.z) * k
    onRim = k < 1
  }

  return (
    <div className="minimap-wrap">
      <button className="minimap" onClick={() => client.openMap(true)} title="Open the map (M)">
        <svg viewBox={`${me.x - R} ${me.z - R} ${R * 2} ${R * 2}`}>
          <rect x={me.x - R} y={me.z - R} width={R * 2} height={R * 2} fill="#1b2026" />
          {geo ? <StaticLayer geo={geo} /> : null}
          {(client.config?.places ?? []).map((p) => (
            <circle key={p.id} cx={p.x} cy={p.z} r={3} fill={KIND_COLOUR[p.kind]} stroke="#111" strokeWidth={0.8} />
          ))}
          {[...client.remotes.values()].map((r) => (
            <circle key={r.id} cx={r.x} cy={r.z} r={2.4} fill="#7dd3ff" stroke="#111" strokeWidth={0.6} />
          ))}
          {target ? <RouteLine route={route} me={me} target={target} w={2.4} /> : null}
          {target ? (
            <g>
              <circle cx={tx} cy={tz} r={onRim ? 3.6 : 5.5} fill="none" stroke="#ffe14d" strokeWidth={1.6} />
              <circle cx={tx} cy={tz} r={1.8} fill="#ffe14d" />
            </g>
          ) : null}
          <circle cx={me.x} cy={me.z} r={3.2} fill="#fff" stroke="#7dffa0" strokeWidth={1.4} />
        </svg>
        <span className="minimap-n">N</span>
      </button>
      {target ? (
        <div className="minimap-label">
          → {target.name} · {route?.ok ? Math.round(route.length) : distance(me, target)} m
          {target.kind === 'waypoint' ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                client.setWaypoint(null)
              }}
              title="Clear waypoint"
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type Dest = {
  key: string
  name: string
  icon: string
  label: string
  colour: string
  open: boolean
  text: string
  x: number
  z: number
  placeId: string | null
  category: VenueCategory | null
  far?: boolean
}

type Filter = 'all' | 'open' | VenueCategory

/** Full-screen map: search, filter, tap any building, set a waypoint. */
export function BigMap({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const geo = useGeo()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1000, h: 600 })
  const [view, setView] = useState(() => ({ x: client.me.x, z: client.me.z, span: 260 }))
  const [names, setNames] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const drag = useRef<{ px: number; py: number; moved: number } | null>(null)
  const lastMoved = useRef(0)
  const [, tick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const config = client.config
  const places = config?.places ?? []
  const me = client.me
  const target = currentTarget(client)

  // Everything you can pick: places that work today, then every named building
  const all: Dest[] = []
  for (const p of places) {
    all.push({
      key: `p:${p.id}`,
      name: p.name,
      icon: KIND_ICON[p.kind],
      label: p.kind === 'job' ? 'Job' : p.kind === 'shop' ? 'Shop' : p.kind === 'hub' ? 'Hustle hub' : p.kind === 'college' ? 'College' : 'Lettings',
      colour: KIND_COLOUR[p.kind],
      open: true,
      text:
        p.kind === 'job'
          ? `Open now. ${client.profile?.career?.[p.id]?.title ?? 'Work'}: earn ${formatMoney(jobPay(p, config ?? null, client.profile ?? null))} a shift. Work here regularly to get promoted.`
          : p.kind === 'shop'
            ? p.priceMult && p.priceMult > 1
              ? 'Open now. Food, at city prices (about 15% dearer than the Corner Shop).'
              : 'Open now. Buy food to keep your hunger up.'
            : p.kind === 'hub'
              ? 'Open now. Take gigs, learn to code and pitch to investors.'
              : p.kind === 'college'
                ? 'Open now. Go to lectures: every education level makes all your shifts pay 2% more.'
                : 'Open now. See homes and move in.',
      x: p.x,
      z: p.z,
      placeId: p.id,
      category: null,
    })
  }
  for (const v of geo?.venues ?? []) {
    // A real place sits on this building: show that one instead
    if (places.some((p) => (p.venue ? p.venue === v.name : Math.hypot(p.x - v.x, p.z - v.z) < 12))) continue
    const cat = CATEGORIES[v.category]
    all.push({
      key: `v:${v.id}`, name: v.name, icon: cat.icon, label: cat.label, colour: cat.colour,
      open: false, text: cat.teaser, x: v.x, z: v.z, placeId: null, category: v.category,
    })
  }
  // Parts of Birmingham that are not built yet: you can price the trip, not take it
  for (const f of config?.farDestinations ?? []) {
    if (f.built) continue // it is on the map now, so its real buildings are listed instead
    all.push({
      key: `f:${f.id}`, name: f.name, icon: f.icon, label: 'Across Birmingham', colour: '#94a3b8',
      open: false, text: 'Coming to Brit Life later. You can see what getting there would cost.',
      x: f.x, z: f.z, placeId: null, category: null, far: true,
    })
  }

  const q = query.trim().toLowerCase()
  const shown = all.filter((d) => {
    if (q && !d.name.toLowerCase().includes(q) && !d.label.toLowerCase().includes(q)) return false
    if (filter === 'all') return true
    if (filter === 'open') return d.open
    return d.category === filter
  })
  const selected = all.find((d) => d.key === selectedKey) ?? null
  const dist = (d: { x: number; z: number }) => Math.round(Math.hypot(d.x - me.x, d.z - me.z))
  const distLabel = (d: { x: number; z: number }) => (dist(d) >= 1000 ? `${(dist(d) / 1000).toFixed(1)} km` : `${dist(d)} m`)

  const categories = [...new Set((geo?.venues ?? []).map((v) => v.category))]

  // metres per on-screen pixel, so pins and labels keep a constant size
  const pxPerMetre = Math.max(size.w, size.h) / view.span
  const s = 1 / pxPerMetre

  // Label decluttering: places first, then nearest to you; skip a label if it would overlap one already placed
  const labelled = new Set<string>()
  if (names && view.span < 500) {
    const taken: { x: number; y: number; w: number }[] = []
    const px = (d: Dest) => ({ x: (d.x - view.x) * pxPerMetre, y: (d.z - view.z) * pxPerMetre })
    const order = [...shown].sort((a, b) => Number(b.open) - Number(a.open) || dist(a) - dist(b))
    for (const d of order) {
      const p = px(d)
      const w = d.name.length * 6.8 + 8
      const y = p.y + 22
      if (Math.abs(p.x) > size.w / 2 + 40 || Math.abs(p.y) > size.h / 2 + 40) continue
      if (taken.some((t) => Math.abs(t.x - p.x) < (t.w + w) / 2 && Math.abs(t.y - y) < 16)) continue
      taken.push({ x: p.x, y, w })
      labelled.add(d.key)
    }
  }

  const zoom = (factor: number) => setView((v) => ({ ...v, span: Math.min(1200, Math.max(40, v.span * factor)) }))
  const focus = (d: Dest) => {
    setSelectedKey(d.key)
    setView((v) => ({ ...v, x: d.x, z: d.z, span: Math.min(v.span, 110) }))
  }

  const onDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, moved: 0 }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    d.px = e.clientX
    d.py = e.clientY
    const before = d.moved
    d.moved += Math.abs(dx) + Math.abs(dy)
    // Only capture once it's really a drag, so a simple tap still reaches the pin under it
    if (before <= 5 && d.moved > 5) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setView((v) => ({ ...v, x: v.x - dx / pxPerMetre, z: v.z - dy / pxPerMetre }))
  }
  const onUp = () => {
    lastMoved.current = drag.current?.moved ?? 0
    drag.current = null
  }
  const tap = (key: string) => {
    if (lastMoved.current <= 5) setSelectedKey(key)
  }

  const isWaypoint = (d: Dest) => client.waypoint?.x === d.x && client.waypoint?.z === d.z

  return (
    <div className="bigmap">
      <div
        className="bigmap-canvas"
        ref={box}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 0.87)}
      >
        <svg
          viewBox={`${view.x - view.span / 2} ${view.z - (view.span * size.h) / size.w / 2} ${view.span} ${(view.span * size.h) / size.w}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <rect x={view.x - 5000} y={view.z - 5000} width={10000} height={10000} fill="#1b2026" />
          {geo ? <StaticLayer geo={geo} /> : null}

          {shown.map((d) => (
            <g key={d.key} className="map-pin" onClick={() => tap(d.key)}>
              <circle cx={d.x} cy={d.z} r={s * 20} fill="transparent" />
              <circle cx={d.x} cy={d.z} r={s * (d.open ? 13 : 8)} fill={d.colour} stroke="#111" strokeWidth={s * 1.6} />
              {d.open ? (
                <text x={d.x} y={d.z + s * 5} fontSize={s * 14} textAnchor="middle" className="map-icon">
                  {d.icon}
                </text>
              ) : null}
              {labelled.has(d.key) ? (
                <text
                  x={d.x}
                  y={d.z + s * 26}
                  fontSize={s * 12}
                  textAnchor="middle"
                  className={`map-label ${d.open ? 'map-label-open' : ''}`}
                >
                  {d.name}
                </text>
              ) : null}
            </g>
          ))}

          {target ? <RouteLine route={gpsFor(client, target)} me={me} target={target} w={s * 5} /> : null}
          {target ? <circle cx={target.x} cy={target.z} r={s * 24} fill="none" stroke="#ffe14d" strokeWidth={s * 3} /> : null}
          {selected ? <circle cx={selected.x} cy={selected.z} r={s * 19} fill="none" stroke="#fff" strokeWidth={s * 2.4} strokeDasharray={`${s * 6} ${s * 4}`} /> : null}
          {[...client.remotes.values()].map((r) => (
            <circle key={r.id} cx={r.x} cy={r.z} r={s * 7} fill="#7dd3ff" stroke="#111" strokeWidth={s * 1.5} />
          ))}
          <circle cx={me.x} cy={me.z} r={s * 9} fill="#fff" stroke="#7dffa0" strokeWidth={s * 3.5} />
        </svg>
      </div>

      <div className="bigmap-top">
        <b>Map</b>
        <input
          type="search"
          placeholder="Search places..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="bigmap-close" onClick={() => client.openMap(false)} aria-label="Close map">
          ✕ <kbd>M</kbd>
        </button>
      </div>

      <div className="bigmap-chips">
        {(['all', 'open'] as Filter[]).concat(categories).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'open' ? '● Open now' : `${CATEGORIES[f as VenueCategory].icon} ${CATEGORIES[f as VenueCategory].label}`}
          </button>
        ))}
      </div>

      <div className="bigmap-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoom(0.7)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(1.4)} aria-label="Zoom out">−</button>
        <button onClick={() => setView((v) => ({ ...v, x: client.me.x, z: client.me.z }))} aria-label="Centre on me">⌖</button>
        <button className={names ? 'on' : ''} onClick={() => setNames((n) => !n)}>Names</button>
      </div>

      <aside className="bigmap-side">
        {selected ? (
          <div className="bigmap-card">
            <button className="bigmap-back" onClick={() => setSelectedKey(null)}>‹ All places</button>
            <div className="tracker-top">
              <b>
                {selected.icon} {selected.name}
              </b>
              <span className={selected.open ? 'm-reward' : 'map-soon'}>{selected.open ? 'OPEN' : 'COMING SOON'}</span>
            </div>
            <small className="map-cat">
              {selected.label} · {distLabel(selected)} away
            </small>
            <p>{selected.text}</p>
            <TravelPicker client={client} dest={selected} isWaypoint={isWaypoint(selected)} />
          </div>
        ) : (
          <div className="bigmap-list">
            <h4>
              {shown.length} place{shown.length === 1 ? '' : 's'}
            </h4>
            {[...shown]
              .sort((a, b) => Number(b.open) - Number(a.open) || dist(a) - dist(b))
              .map((d) => (
                <button key={d.key} className="bigmap-row" onClick={() => focus(d)}>
                  <span className="bigmap-dot" style={{ background: d.colour }}>{d.open ? d.icon : ''}</span>
                  <span className="bigmap-name">
                    <b>{d.name}</b>
                    <small>{d.label}</small>
                  </span>
                  <span className={d.open ? 'm-reward' : 'map-soon'}>{d.open ? 'OPEN' : distLabel(d)}</span>
                </button>
              ))}
            {shown.length === 0 ? <p className="map-hint">Nothing matches. Try another search.</p> : null}
          </div>
        )}
      </aside>
    </div>
  )
}


/** What each way of getting there costs. Prices come from the server. */
function TravelPicker({ client, dest, isWaypoint }: { client: NetClient; dest: Dest; isWaypoint: boolean }) {
  const { x, z } = dest

  // Ask for fresh prices when you pick a place, then every 15 seconds (Uber surge changes)
  useEffect(() => {
    client.requestQuote(x, z)
    const timer = setInterval(() => client.requestQuote(x, z), 15000)
    return () => clearInterval(timer)
  }, [client, x, z])

  const quote: Quote | null = client.quote && client.quote.x === x && client.quote.z === z ? client.quote : null
  const balance = client.profile?.balance ?? 0
  const onShift = Boolean(client.shift)
  const walk = quote?.modes.find((m) => m.id === 'walk')

  return (
    <div className="travel">
      <button
        className={`travel-row travel-walk ${dest.far ? 'travel-off' : ''}`}
        disabled={dest.far}
        onClick={() => {
          if (isWaypoint) client.setWaypoint(null)
          else {
            client.setWaypoint({ id: dest.placeId, name: dest.name, x, z })
            client.openMap(false)
          }
        }}
      >
        <span className="travel-icon">🚶</span>
        <span className="travel-main">
          <b>{isWaypoint ? 'Clear waypoint' : 'Walk'}</b>
          <small>{dest.far ? 'Too far to walk to today' : 'Free. Follow the gold marker.'}</small>
        </span>
        <span className="travel-price">{walk ? `${walk.minutes} min` : ''}</span>
      </button>

      {!quote ? <p className="travel-wait">Checking fares…</p> : null}

      {quote?.modes
        .filter((m) => m.id !== 'walk')
        .map((m) => {
          const cannotAfford = m.available && m.fare > balance
          const can = m.available && !dest.far && !onShift && !cannotAfford
          const why = !m.available ? m.reason : dest.far ? 'Not built yet' : onShift ? 'Finish your shift first' : cannotAfford ? "Can't afford it" : m.note
          return (
            <button
              key={m.id}
              className={`travel-row ${can ? '' : 'travel-off'}`}
              disabled={!can}
              onClick={() => client.sendTravel(x, z, m.id)}
              title={m.note}
            >
              <span className="travel-icon">{m.icon}</span>
              <span className="travel-main">
                <b>{m.label}</b>
                <small>{why}</small>
              </span>
              <span className="travel-price">
                {m.available ? (
                  <>
                    <b>{m.fare === 0 ? 'Pass' : formatMoney(m.fare)}</b>
                    <small>{m.minutes} min</small>
                  </>
                ) : (
                  <small>—</small>
                )}
              </span>
            </button>
          )
        })}

      {quote?.modes.find((m) => m.id === 'uber')?.surge ? <p className="travel-surge">Busy right now: Uber prices are up.</p> : null}
      {dest.far ? <p className="travel-wait">Fares are a preview. This part of Birmingham opens in a later update.</p> : null}
    </div>
  )
}

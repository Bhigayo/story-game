import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatMoney, type NetClient } from './net/NetClient'

/** Shown while you are on a bus, tram, train or in a cab. The server decides when you arrive. */
export default function TravelHud({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const [, tick] = useState(0)
  const journey = client.journey

  useEffect(() => {
    if (!journey) return
    const timer = setInterval(() => tick((n) => n + 1), 100)
    return () => clearInterval(timer)
  }, [journey])

  if (!journey) return null

  const elapsed = (performance.now() - journey.startedAt) / 1000
  const progress = Math.min(1, elapsed / journey.seconds)

  return (
    <div className="journey" role="status">
      <div className="journey-card">
        <div className={`journey-vehicle journey-${journey.mode}`}>{journey.icon}</div>
        <h3>{journey.label}</h3>
        <p className="journey-note">{journey.note}</p>
        <div className="journey-track">
          <div className="journey-fill" style={{ width: `${progress * 100}%` }} />
          <span className="journey-dot" style={{ left: `${progress * 100}%` }}>{journey.icon}</span>
        </div>
        <div className="journey-meta">
          <span>{journey.minutes} min journey</span>
          <span>{journey.fare === 0 ? 'Covered by your pass' : `Fare paid ${formatMoney(journey.fare)}`}</span>
        </div>
      </div>
    </div>
  )
}

// The story game's money and notices (v37). Replaces EconomyUI and the job HUD, which belonged to
// the life-sim (hunger, rent, payslips, shifts): those now live in archive/life-sim/.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatMoney, type NetClient } from './net/NetClient'

/** Your cash and health, top right (health v49: green, amber under 50, red and pulsing under 25). */
export function CashHud({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const hp = Math.max(0, Math.min(100, client.health))
  const hurt = client.hurt && performance.now() - client.hurt.at < 600 ? client.hurt : null
  return (
    <>
      <div className="status-panel">
        <div className="wallet">{client.profile ? formatMoney(client.profile.balance) : '£–'}</div>
        <div className={`health ${hp < 25 ? 'health-low' : hp < 50 ? 'health-mid' : ''}`} title={`Health ${Math.round(hp)}`}>
          <i style={{ width: `${hp}%` }} />
        </div>
      </div>
      {hurt ? <div className="hurt-flash" key={hurt.at} /> : null}
    </>
  )
}

/** Short notices from the server ("You stole a car…", mission rewards): bottom centre for 3 seconds. */
export function Toasts({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const [, tick] = useState(0)
  const toast = client.toast && Date.now() - client.toast.at < 3000 ? client.toast : null
  // Hide it again once its 3 seconds are up
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, 3000 - (Date.now() - toast.at)) + 50)
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast) return null
  return <div className={`job-toast ${toast.good ? 'job-toast-good' : 'job-toast-bad'}`}>{toast.text}</div>
}

/** The phone's Bank app: just your balance now that there are no wages, bills or rent. */
export function BankPanel({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const balance = client.profile?.balance ?? 0
  return (
    <div className="panel money-panel">
      <div className="panel-section">Current account</div>
      <div className="wallet">{formatMoney(balance)}</div>
      <p className="panel-note">Cash comes from missions and, later, jobs you take on for the crew. Car fares and police fines come out of it.</p>
    </div>
  )
}

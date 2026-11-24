import { useSyncExternalStore } from 'react'
import type { NetClient } from './net/NetClient'

/** "Press E to drive", and the speedometer while you are at the wheel. */
export function VehicleHud({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const now = useSyncExternalStore(
    (onChange) => {
      // The speedometer needs to refresh while driving, but nothing else does
      const t = setInterval(() => client.myVehicle && onChange(), 150)
      return () => clearInterval(t)
    },
    () => (client.myVehicle ? Math.round(Math.abs(client.vehicles.get(client.myVehicle)?.v ?? 0) * 2.237) : -1),
  )

  if (client.myVehicle) {
    // The car's condition (v43, C7): green, then amber, then red; a wreck says so
    const hp = client.vehicles.get(client.myVehicle)?.hp ?? 100
    const tone = hp > 60 ? '#5FD38A' : hp > 30 ? '#F0B429' : '#E5533D'
    return (
      <div className="speedo">
        <b>{now}</b>
        <small>MPH</small>
        <div className="car-health" title="Condition">
          {hp <= 0 ? <em>WRECKED</em> : <i style={{ width: `${hp}%`, background: tone }} />}
        </div>
        <span>
          <kbd>W</kbd>
          <kbd>S</kbd> drive · <kbd>A</kbd>
          <kbd>D</kbd> steer · <kbd>Space</kbd> handbrake · <kbd>H</kbd> horn · <kbd>E</kbd> get out
        </span>
      </div>
    )
  }

  if (client.nearVehicleId && !client.nearNpcId && !client.dialogue && !client.nearPlaceId) {
    const near = client.vehicles.get(client.nearVehicleId)
    const what = near?.k === 'van' ? 'van' : near?.k === 'taxi' ? 'cab' : 'car'
    if (near?.t) {
      return (
        <div className="npc-prompt">
          Press <kbd>E</kbd> to drag the driver out and take the {what}
          <small className="npc-crime">Carjacking: two stars</small>
        </div>
      )
    }
    return (
      <div className="npc-prompt">
        Press <kbd>E</kbd> to {near?.o ? `steal this ${what}` : 'drive'}
        {near?.o ? <small className="npc-crime">Crime: police will come after you</small> : null}
      </div>
    )
  }
  return null
}

/** Wanted stars, and the BUSTED and WASTED banners. */
export function WantedHud({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getGameKey)
  const { level, searching } = client.wanted
  const busted = client.busted && Date.now() - client.busted.at < 4000 ? client.busted : null
  const wasted = client.wasted && Date.now() - client.wasted.at < 4500 ? client.wasted : null
  return (
    <>
      {level > 0 ? (
        <div className={`wanted ${searching ? 'wanted-hiding' : ''}`}>
          <div className="wanted-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <i key={n} className={n <= level ? 'on' : ''}>
                ★
              </i>
            ))}
          </div>
          <small>{searching ? 'Police lost you. Stay hidden.' : 'WANTED'}</small>
        </div>
      ) : null}
      {busted ? (
        <div className="busted" key={busted.at}>
          <strong>BUSTED</strong>
          <span>Fined £{(busted.fine / 100).toFixed(2)}. Released from {busted.place}.</span>
        </div>
      ) : null}
      {wasted ? (
        <>
          <div className="wasted-grey" />
          <div className="busted wasted" key={wasted.at}>
            <strong>WASTED</strong>
            <span>
              {wasted.bill > 0 ? `Hospital bill £${(wasted.bill / 100).toFixed(2)}. ` : ''}You wake up at {wasted.place}.
            </span>
          </div>
        </>
      ) : null}
    </>
  )
}

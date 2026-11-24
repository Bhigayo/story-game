
import { setupWater, waterBlocked } from './world/water'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { DialogueHud, Npcs, NpcPrompt } from './Npcs'
import TopBar, { CityFeed } from './TopBar'
import PostFX from './world/PostFX'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import DigbethMap from './world/DigbethMap'
import { Landmarks } from './world/Landmarks'
import Atmosphere from './world/Atmosphere'
import { focus } from './world/focus'
import StreetFurniture from './world/StreetFurniture'
import StreetLife from './world/StreetLife'
import Pedestrians from './world/Pedestrians'
import './multiplayer.css'
import './hud.css'
import RemotePlayers from './RemotePlayers'
import { ChatBox, ChatBubble } from './ChatUI'
import { CashHud, Toasts } from './CashUI'
import { MissionMarkers, ObjectiveMarker } from './ObjectiveMarker'
import { CutsceneDirector, CutsceneOverlay } from './cutscenes/Cutscene'
import { Smoke } from './world/Smoke'
import { AutoResolution, PerfHud, PerfProbe } from './PerfStats'
import { DistrictBanner } from './DistrictBanner'
import { SwitchWheel } from './SwitchWheel'
import { STYLES, heightOf, styleOf } from './world/buildingStyle'
import { CarAudio } from './CarAudio'
import { Ambience } from './Ambience'
import MissionHud from './MissionUI'
import PhoneHud from './PhoneUI'
import TravelHud from './TravelUI'
import { loadDistricts } from './world/districts'
import { useCharacter } from './useCharacter'
import { useWalk } from './useWalk'
import { Vehicles } from './Vehicles'
import { TrafficSignals } from './world/TrafficSignals'
import { VehicleHud, WantedHud } from './VehicleUI'
import { NetClient, SWITCH_MS, getServerUrl, storageKey } from './net/NetClient'

// On-foot speeds, m/s (v48). Keep SPRINT_SPEED in step with MAX_SPEED in server/index.mjs.
const WALK_SPEED = 1.4
const JOG_SPEED = 5
const SPRINT_SPEED = 7.5
import { protagonistById, type Protagonist } from './protagonists'

// Starting position: Gibb Street, Digbeth
const START_POSITION: [number, number, number] = [129, 0, 44]
type BuildingFootprint = [number, number][]

const CENTRE_LON = -1.8850989
const CENTRE_LAT = 52.4759448

function toWorld(lon: number, lat: number): [number, number] {
  const x =
    (lon - CENTRE_LON) *
    111320 *
    Math.cos(CENTRE_LAT * Math.PI / 180)

  const z = -(lat - CENTRE_LAT) * 110540

  return [x, z]
}

function isInsidePolygon(
  x: number,
  z: number,
  polygon: BuildingFootprint,
): boolean {
  let inside = false

  for (
    let i = 0, j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]

    const intersects =
      (zi > z) !== (zj > z) &&
      x < ((xj - xi) * (z - zi)) / (zj - zi) + xi

    if (intersects) inside = !inside
  }

  return inside
}

function distanceToSegment(
  x: number,
  z: number,
  start: [number, number],
  end: [number, number],
): number {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]

  const lengthSquared = dx * dx + dz * dz

  if (lengthSquared === 0) {
    return Math.hypot(x - start[0], z - start[1])
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - start[0]) * dx + (z - start[1]) * dz) /
        lengthSquared,
    ),
  )

  const closestX = start[0] + t * dx
  const closestZ = start[1] + t * dz

  return Math.hypot(x - closestX, z - closestZ)
}

const boxes = new WeakMap<BuildingFootprint, [number, number, number, number]>()
function boxOf(polygon: BuildingFootprint) {
  let box = boxes.get(polygon)
  if (!box) {
    const xs = polygon.map((p) => p[0])
    const zs = polygon.map((p) => p[1])
    box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
    boxes.set(polygon, box)
  }
  return box
}

function isBlocked(
  x: number,
  z: number,
  buildings: BuildingFootprint[],
): boolean {
  const playerRadius = 0.65
  if (waterBlocked(x, z)) return true

  return buildings.some((polygon) => {
    // Quick reject: most buildings are nowhere near the player
    const box = boxOf(polygon)
    if (x < box[0] - playerRadius || x > box[1] + playerRadius || z < box[2] - playerRadius || z > box[3] + playerRadius) {
      return false
    }

    if (isInsidePolygon(x, z, polygon)) return true

    for (let i = 0; i < polygon.length; i++) {
      const next = (i + 1) % polygon.length

      if (
        distanceToSegment(
          x,
          z,
          polygon[i],
          polygon[next],
        ) < playerRadius
      ) {
        return true
      }
    }

    return false
  })
}


// ---- What the camera can't pass through (v46) ----
// Every building as its outline and its real height (the same formula the city is drawn with), in a
// 25 m grid. The camera only pulls in for a building that's actually between you and it, and the canal
// doesn't count (you can't walk on it, but the camera can hover over it).
type CamBlock = { poly: BuildingFootprint; box: [number, number, number, number]; top: number }
const CAM_CELL = 25
const camGrid = new Map<string, CamBlock[]>()

function setupCameraBlocks(features: any[]) {
  camGrid.clear()
  features.forEach((feature: any, index: number) => {
    if (feature.geometry.type !== 'Polygon' || !feature.properties.building) return
    const tags = feature.properties
    const style = STYLES[styleOf(tags)]
    const poly: BuildingFootprint = feature.geometry.coordinates[0].map(([lon, lat]: number[]) => toWorld(lon, lat))
    const block: CamBlock = { poly, box: boxOf(poly), top: heightOf(tags, style, String(feature.id ?? index)) }
    for (let cx = Math.floor((block.box[0] - 1) / CAM_CELL); cx <= Math.floor((block.box[1] + 1) / CAM_CELL); cx++)
      for (let cz = Math.floor((block.box[2] - 1) / CAM_CELL); cz <= Math.floor((block.box[3] + 1) / CAM_CELL); cz++) {
        const k = `${cx},${cz}`
        if (!camGrid.has(k)) camGrid.set(k, [])
        camGrid.get(k)!.push(block)
      }
  })
}

/** Is a camera at (x, y, z) inside, or within 0.4 m of, a building? */
function camBlocked(x: number, y: number, z: number) {
  const margin = 0.4
  for (const b of camGrid.get(`${Math.floor(x / CAM_CELL)},${Math.floor(z / CAM_CELL)}`) ?? []) {
    if (y > b.top + margin) continue // above the roof: fine
    if (x < b.box[0] - margin || x > b.box[1] + margin || z < b.box[2] - margin || z > b.box[3] + margin) continue
    if (isInsidePolygon(x, z, b.poly)) return true
    for (let i = 0; i < b.poly.length; i++) if (distanceToSegment(x, z, b.poly[i], b.poly[(i + 1) % b.poly.length]) < margin) return true
  }
  return false
}

/** How far the camera can go from `from` along `dir` (up to `want`) before something's in the way. */
function clearReach(from: THREE.Vector3, dir: THREE.Vector3, want: number, min = 1.2) {
  for (let d = min; d <= want; d += 0.4) {
    if (camBlocked(from.x + dir.x * d, from.y + dir.y * d, from.z + dir.z * d)) return Math.max(min, d - 0.5)
  }
  return want
}

/**
 * How deep (in metres) a person at (x, z) would be inside any car, as the car is drawn right now:
 * 0 = clear. Each car is a box (vans are a little bigger), turned to its heading, plus your 0.35 m.
 */
function carOverlap(client: NetClient, x: number, z: number) {
  let worst = 0
  for (const [id, v] of client.vehicles) {
    if (Math.abs(v.x - x) > 6 || Math.abs(v.z - z) > 6) continue
    const pose = client.vehiclePose.get(id) ?? v
    const halfW = (v.k === 'van' ? 1.0 : 0.92) + 0.35
    const halfL = (v.k === 'van' ? 2.5 : 2.1) + 0.35
    const dx = x - pose.x
    const dz = z - pose.z
    const along = dx * Math.sin(pose.h) + dz * Math.cos(pose.h)
    const across = dx * Math.cos(pose.h) - dz * Math.sin(pose.h)
    const depth = Math.min(halfL - Math.abs(along), halfW - Math.abs(across))
    if (depth > worst) worst = depth
  }
  return worst
}

function Player({
  profile,
  spawn,
  client,
}: {
  profile: Protagonist
  spawn: [number, number, number]
  client: NetClient
}) {
  const player = useRef<THREE.Group>(null)
  const keys = useRef<Record<string, boolean>>({})
  const buildings = useRef<BuildingFootprint[]>([])
  const walking = useRef(false)
  const lastArrival = useRef(0)
  // Orbit camera: drag the mouse to look round, scroll to zoom
  const orbit = useRef({ yaw: 0, pitch: 0.42, want: 9.85, dist: 9.85, drag: false })
  // Conversation camera (v46): 0 = the normal orbit, 1 = the side-on two-shot of you and who you're talking to
  const talkCam = useRef({ blend: 0, side: 1, npc: '' })
  // Switching characters (v47): which placement we've handled, where the camera started, whether we've landed
  const switchCam = useRef({ seq: 0, start: new THREE.Vector3(), moved: true })
  const { camera } = useThree()

  const { model, animations } = useCharacter(
    profile.gender,
    profile.skin,
    profile.hair,
    profile.outfit,
    true,
    profile.id,
  )
  const walk = useWalk(model, animations)
  // C swaps between jogging (the default, as in GTA) and walking (v48)
  const strolling = useRef(false)

  // Keyboard controls
  useEffect(() => {
    // Keys typed into the chat box must not move the character
    const isTyping = (event: KeyboardEvent) =>
      (event.target as HTMLElement | null)?.tagName === 'INPUT'

    const down = (event: KeyboardEvent) => {
      if (isTyping(event)) return
      const key = event.key.toLowerCase()
      keys.current[key] = true
      if (key === ' ' && client.myVehicle) event.preventDefault() // the handbrake must not scroll the page

      if (event.repeat) return

      if (key === 'c' && !client.myVehicle) strolling.current = !strolling.current

      if (key === 'e') {
        if (client.myVehicle) {
          client.exitVehicle()
          return
        }
        if (client.nearNpcId && !client.dialogue) {
          client.talk(client.nearNpcId)
          return
        }
        if (client.dialogue) return
        if (client.nearVehicleId) client.enterVehicle(client.nearVehicleId)
      }
    }

    const up = (event: KeyboardEvent) => {
      keys.current[event.key.toLowerCase()] = false
    }

    // Stops the character getting stuck walking if the tab loses focus
    // or the chat box takes focus while a key is held
    const clear = () => {
      keys.current = {}
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    window.addEventListener('focusin', clear)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      window.removeEventListener('focusin', clear)
    }
  }, [client])

  // Mouse look: hold left or right button on the scene and drag; wheel zooms
  useEffect(() => {
    const o = orbit.current
    const onCanvas = (e: Event) => (e.target as HTMLElement | null)?.tagName === 'CANVAS'
    const down = (e: PointerEvent) => {
      if (onCanvas(e) && (e.button === 0 || e.button === 2)) o.drag = true
    }
    const up = () => {
      o.drag = false
    }
    const move = (e: PointerEvent) => {
      if (!o.drag) return
      o.yaw -= e.movementX * 0.006
      o.pitch = Math.min(1.35, Math.max(0.08, o.pitch + e.movementY * 0.005))
    }
    const wheel = (e: WheelEvent) => {
      if (!onCanvas(e)) return
      o.want = Math.min(18, Math.max(2.5, o.want + e.deltaY * 0.01))
    }
    const menu = (e: Event) => {
      if (onCanvas(e)) e.preventDefault()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    window.addEventListener('pointermove', move)
    window.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('contextmenu', menu)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('wheel', wheel)
      window.removeEventListener('contextmenu', menu)
    }
  }, [])

  // Load building collision shapes
  useEffect(() => {
    loadDistricts()
      .then((data) => {
        setupWater(data.features)
        setupCameraBlocks(data.features)
        buildings.current = data.features
          .filter(
            (feature: any) =>
              feature.geometry.type === 'Polygon' &&
              Boolean(feature.properties.building),
          )
          .map((feature: any) =>
            feature.geometry.coordinates[0].map(
              ([lon, lat]: number[]) => toWorld(lon, lat),
            ),
          )
      })
      .catch(console.error)
  }, [])

  // Player movement, animation, networking and camera
  useFrame((_, delta) => {
    if (!player.current) return

    // Just got off a bus or out of a cab: appear at the destination, on a spot that isn't inside a building
    if (client.arrival.n !== lastArrival.current) {
      lastArrival.current = client.arrival.n
      const { x: ax, z: az } = client.arrival
      let best: [number, number] = [ax, az]
      search: for (let r = 0; r <= 24; r += 1) {
        for (let k = 0; k < Math.max(1, r * 8); k++) {
          const a = (k / Math.max(1, r * 8)) * Math.PI * 2
          const cx = ax + Math.cos(a) * r
          const cz = az + Math.sin(a) * r
          if (!isBlocked(cx, cz, buildings.current)) {
            best = [cx, cz]
            break search
          }
        }
      }
      player.current.position.x = best[0]
      player.current.position.z = best[1]
      camera.position.set(best[0], 4, best[1] + 9)
    }

    // On a journey: the character is off the street
    player.current.visible = !client.journey
    if (client.journey || client.dialogue || client.switching || client.isDown || client.scene) keys.current = {}
    // In a cut-scene (v51) the scene says where you stand and whether you walk; when it ends, the camera
    // comes back behind you
    const actor = client.scene ? client.sceneActor : null
    if (actor) {
      player.current.position.x = actor.x
      player.current.position.z = actor.z
      player.current.rotation.y = actor.ry
      orbit.current.yaw = actor.ry + Math.PI
    }

    // The server put us somewhere (joining, a switch, busted): jump there. For a switch, the jump happens
    // while the camera is high over the city, two thirds of the way through the fly-over (v47).
    const placed = client.placed
    if (placed && placed.seq !== switchCam.current.seq) {
      const s = switchCam.current
      s.seq = placed.seq
      s.start.copy(camera.position)
      s.moved = false
      if (placed.instant) {
        player.current.position.set(placed.x, 0, placed.z)
        s.moved = true
      }
    }
    if (placed && !switchCam.current.moved && performance.now() - placed.at > SWITCH_MS * 0.62) {
      player.current.position.set(placed.x, 0, placed.z)
      switchCam.current.moved = true
    }
    const drivingId = client.myVehicle
    model.visible = !drivingId // there is no sitting animation yet, so the driver is hidden

    // On foot (v48): jog by default, hold Shift to sprint, C to walk. The server allows up to SPRINT.
    const speed = keys.current.shift ? SPRINT_SPEED : strolling.current ? WALK_SPEED : JOG_SPEED
    const direction = new THREE.Vector3()
    let fwd = 0
    let side = 0
    if (keys.current.w || keys.current.arrowup) fwd += 1
    if (keys.current.s || keys.current.arrowdown) fwd -= 1
    if (keys.current.a || keys.current.arrowleft) side -= 1
    if (keys.current.d || keys.current.arrowright) side += 1
    // W is away from the camera, D is to its right, whichever way you have turned it
    const { yaw } = orbit.current
    direction.set(-Math.sin(yaw) * fwd + Math.cos(yaw) * side, 0, -Math.cos(yaw) * fwd - Math.sin(yaw) * side)

    const isMoving = !drivingId && direction.lengthSq() > 0

    // Walking animation: the clip always runs, and its weight eases up and down (see useWalk).
    // Knocked over or wasted: fall down (v49); talking: gesture
    const down = client.isDown ? client.down!.kind : null
    if (actor) walk.update(delta, actor.moving, actor.speed, actor.pose)
    else walk.update(delta, isMoving, speed, down === 'knocked' || down === 'wasted' ? 'death' : client.dialogue ? 'talk' : undefined)
    walking.current = isMoving

    // Player movement
    if (isMoving) {
      direction.normalize()

      const movement = direction.multiplyScalar(speed * delta)

      const currentX = player.current.position.x
      const currentZ = player.current.position.z

      const nextX = currentX + movement.x
      const nextZ = currentZ + movement.z

      // Buildings, water, and (v46) cars: you walk round a parked car, not through it.
      // A car you're already overlapping (one just pulled up on you) never traps you: only moves that
      // take you further into it are refused.
      const into = (x: number, z: number) => {
        const before = carOverlap(client, currentX, currentZ)
        const after = carOverlap(client, x, z)
        return after > 0 && after >= before
      }
      if (!isBlocked(nextX, currentZ, buildings.current) && !into(nextX, currentZ)) {
        player.current.position.x = nextX
      }

      if (
        !isBlocked(
          player.current.position.x,
          nextZ,
          buildings.current,
        ) &&
        !into(player.current.position.x, nextZ)
      ) {
        player.current.position.z = nextZ
      }

      player.current.rotation.y = Math.atan2(movement.x, movement.z)
    }

    // In a conversation: turn to face who you're talking to (v48)
    if (client.dialogue && !drivingId) {
      const other = client.config?.npcs?.find((n) => n.id === client.dialogue!.npc)
      if (other) {
        const want = Math.atan2(other.x - player.current.position.x, other.z - player.current.position.z)
        let turn = want - player.current.rotation.y
        turn = Math.atan2(Math.sin(turn), Math.cos(turn)) // the short way round
        player.current.rotation.y += turn * (1 - Math.exp(-8 * delta))
      }
    }

    // Driving: you ARE the car. Follow where it is drawn, and tell the server what you are holding.
    if (drivingId) {
      const pose = client.vehiclePose.get(drivingId)
      if (pose) {
        player.current.position.x = pose.x
        player.current.position.z = pose.z
        player.current.rotation.y = pose.h
      }
      const k = keys.current
      client.sendDrive(
        (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0),
        (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0),
        Boolean(k[' ']),
      )
      client.noteMe(player.current.position.x, player.current.position.z, player.current.rotation.y)
    }

    focus.copy(player.current.position)

    // Is someone to talk to within reach? (the server checks this again)
    let nearNpc: string | null = null
    let npcDistance = 3.5
    for (const npc of client.config?.npcs ?? []) {
      const d = Math.hypot(player.current.position.x - npc.x, player.current.position.z - npc.z)
      if (d < npcDistance) {
        nearNpc = npc.id
        npcDistance = d
      }
    }
    client.setNearNpc(nearNpc)

    // Is a free car within reach? (the server checks this again)
    let nearCar: string | null = null
    if (!drivingId) {
      let carDistance = 3.2
      for (const v of client.vehicles.values()) {
        if (v.d || v.p) continue // taken, or police
        if (v.t && Math.abs(v.v) > 3.5) continue // traffic can be carjacked, but only when it's stopped or crawling (v43)
        const d = Math.hypot(player.current.position.x - v.x, player.current.position.z - v.z)
        if (d < carDistance) {
          nearCar = v.id
          carDistance = d
        }
      }
    }
    client.setNearVehicle(nearCar)

    // Tell the server where we are (throttled inside NetClient). While driving, the car is our position.
    // Not mid-switch: until we land, our old position is stale.
    if (!drivingId && !client.switching) {
      client.sendMove(
        player.current.position.x,
        player.current.position.z,
        player.current.rotation.y,
        isMoving,
      )
    }

    // Camera orbit, pulled in so it never ends up inside a building
    const o = orbit.current
    const want = o.want + (drivingId ? 3.5 : 0)
    // In a car the camera swings round behind it, unless you are dragging the view yourself
    const pose = drivingId ? client.vehiclePose.get(drivingId) : null
    if (pose && !o.drag) {
      const diff = Math.atan2(Math.sin(pose.h + Math.PI - o.yaw), Math.cos(pose.h + Math.PI - o.yaw))
      o.yaw += diff * (1 - Math.exp(-2.5 * delta))
    }
    const target = player.current.position.clone()
    const cp = Math.cos(o.pitch)
    const dir = new THREE.Vector3(Math.sin(o.yaw) * cp, Math.sin(o.pitch), Math.cos(o.yaw) * cp)
    const head = new THREE.Vector3(target.x, target.y + 1.6, target.z)
    const reach = clearReach(head, dir, want)
    // Snap in at once when something is in the way, ease back out when it clears
    o.dist = reach < o.dist ? reach : o.dist + (reach - o.dist) * (1 - Math.exp(-4 * delta))
    const orbitPos = head.clone().addScaledVector(dir, o.dist)
    let look = head

    // In a conversation: swing round to a side-on shot of the two of you (v46)
    const t = talkCam.current
    const npc = client.dialogue ? client.config?.npcs?.find((n) => n.id === client.dialogue!.npc) : null
    t.blend += ((npc ? 1 : 0) - t.blend) * (1 - Math.exp(-5 * delta))
    let camPos = orbitPos
    if (npc || t.blend > 0.01) {
      const other = npc ?? client.config?.npcs?.find((n) => n.id === t.npc)
      if (other) {
        const mid = new THREE.Vector3((target.x + other.x) / 2, target.y + 1.45, (target.z + other.z) / 2)
        const gap = Math.max(1, Math.hypot(other.x - target.x, other.z - target.z))
        const across = new THREE.Vector3(-(other.z - target.z) / gap, 0, (other.x - target.x) / gap)
        // Pick the side with room (and keep it for the rest of the conversation)
        if (npc && t.npc !== npc.id) {
          t.npc = npc.id
          const room = (s: number) => clearReach(mid, across.clone().multiplyScalar(s).setY(0.12).normalize(), 6)
          t.side = room(1) >= room(-1) ? 1 : -1
        }
        const away = across.clone().multiplyScalar(t.side).setY(0.12).normalize()
        const back = gap * 0.6 + 4.6
        const talkPos = mid.clone().addScaledVector(away, Math.min(clearReach(mid, away, back), back))
        // aim at their waists, so the two of them sit in the top half, above the conversation panel
        const aim = mid.clone().setY(target.y + 0.35)
        const e = t.blend * t.blend * (3 - 2 * t.blend) // ease in and out
        camPos = orbitPos.clone().lerp(talkPos, e)
        look = head.clone().lerp(aim, e)
      }
    }
    // Switching characters (v47): up over the old one, across the city, down to the new one
    if (client.switching && placed?.from) {
      const t = (performance.now() - placed.at) / SWITCH_MS
      const ease = (x: number) => x * x * (3 - 2 * x)
      const high = 150
      const aboveFrom = new THREE.Vector3(placed.from.x, high, placed.from.z + 40)
      const aboveTo = new THREE.Vector3(placed.x, high, placed.z + 40)
      const fromGround = new THREE.Vector3(placed.from.x, 0, placed.from.z)
      const toGround = new THREE.Vector3(placed.x, 0, placed.z)
      if (t < 0.3) {
        const e = ease(t / 0.3)
        camPos = switchCam.current.start.clone().lerp(aboveFrom, e)
        look = look.clone().lerp(fromGround, e)
      } else if (t < 0.65) {
        const e = ease((t - 0.3) / 0.35)
        camPos = aboveFrom.clone().lerp(aboveTo, e)
        look = fromGround.clone().lerp(toGround, e)
      } else {
        const e = ease((t - 0.65) / 0.35)
        camPos = aboveTo.clone().lerp(camPos, e)
        look = toGround.clone().lerp(look, e)
      }
    }
    camera.position.copy(camPos)
    camera.lookAt(look)
  })

  return (
    <group ref={player} position={spawn}>
      <primitive object={model} />
      <ChatBubble client={client} id={null} y={2.4} />
    </group>
  )
}

function City({
  profile,
  spawn,
  client,
}: {
  profile: Protagonist
  spawn: [number, number, number]
  client: NetClient
}) {
  return (
    <>
      <PerfProbe />
      <AutoResolution />
      <Atmosphere />
      <PostFX />

      {/* Real Digbeth geographical data */}
      <DigbethMap />
      <Landmarks />
      <StreetFurniture />
      <StreetLife />
      <Player profile={profile} spawn={spawn} client={client} />
      <CutsceneDirector client={client} />
      <RemotePlayers client={client} />
      <ObjectiveMarker client={client} />
      <MissionMarkers client={client} />
      <Pedestrians client={client} />
      <Npcs client={client} />
      <Vehicles client={client} />
      <TrafficSignals client={client} />
      <Smoke client={client} />

    </>
  )
}

function Game({ profile, onServerHero }: { profile: Protagonist; onServerHero: (id: string) => void }) {
  // A small random offset so players joining together don't stand inside each other
  const spawn = useMemo<[number, number, number]>(() => {
    // Development only: ?at=x,z puts the camera somewhere else to look at the map (the server still decides where you really are)
    const at = import.meta.env.DEV ? new URLSearchParams(location.search).get('at')?.split(',').map(Number) : null
    if (at && at.length === 2 && at.every(Number.isFinite)) return [at[0], 0, at[1]]
    return [START_POSITION[0] + (Math.random() - 0.5) * 2, 0, START_POSITION[2] + (Math.random() - 0.5) * 2]
  }, [])

  const [client] = useState(
    () =>
      new NetClient(getServerUrl(), {
        protagonist: profile.id,
        x: spawn[0],
        z: spawn[2],
      }),
  )

  useEffect(() => {
    client.connect()
    // Development only: lets a test script reach the connection (never in a production build)
    if (import.meta.env.DEV) (window as unknown as { __client?: NetClient }).__client = client
    // Development only: ?scene=arrival replays a cut-scene a few seconds after loading (v51)
    const replay = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null
    const timer = replay
      ? setTimeout(() => client.playScene(replay), 6000)
      : 0
    return () => {
      clearTimeout(timer)
      client.disconnect()
    }
  }, [client])

  // The server remembers your first choice. If it differs from what this browser asked for, follow it.
  const heroId = useSyncExternalStore(client.subscribe, () => client.heroId ?? '')
  useEffect(() => {
    if (heroId && heroId !== profile.id) onServerHero(heroId)
  }, [heroId, profile.id, onServerHero])

  return (
    <main className="game">
      <Canvas
        shadows
        camera={{
          position: [spawn[0], 5, spawn[2] + 8],
          fov: 60,
          near: 0.3,
          far: 1200,
        }}
      >
        <City profile={profile} spawn={spawn} client={client} />
      </Canvas>

      <div className="vignette" />

      <div className="game-title">
        <strong>BRIT LIFE</strong>
        <span>DIGBETH PROTOTYPE 0.6</span>
      </div>

      <TopBar client={client} />
      <DialogueHud client={client} />
      <NpcPrompt client={client} />
      <VehicleHud client={client} />
      <WantedHud client={client} />
      <CityFeed client={client} />
      <ChatBox client={client} />
      <Toasts client={client} />
      <CashHud client={client} />
      <MissionHud client={client} />
      <PhoneHud client={client} />
      <TravelHud client={client} />
      <PerfHud />
      <DistrictBanner client={client} />
      <SwitchWheel client={client} />
      <CarAudio client={client} />
      <Ambience client={client} />
      <CutsceneOverlay client={client} />

      <div className="controls-hint">
        <strong>WASD</strong> move · <strong>Shift</strong> sprint · <strong>C</strong> walk · <strong>Drag mouse</strong> look · <strong>Scroll</strong> zoom · <strong>E</strong> interact / enter car · <strong>P</strong> phone · <strong>Tab</strong> switch · <strong>Enter</strong> chat
      </div>
    </main>
  )
}

const HERO_KEY = storageKey('britlife-hero')

/** Who you were last playing (v47: there's no choosing screen; a new game starts as Jordan, mission 1). */
function savedHero(): string {
  try {
    return protagonistById(localStorage.getItem(HERO_KEY))?.id ?? 'jordan'
  } catch {
    return 'jordan'
  }
}

export default function App() {
  const [heroId, setHeroId] = useState<string>(savedHero)

  const choose = (id: string) => {
    try {
      localStorage.setItem(HERO_KEY, id)
    } catch {
      // private browsing: you'll be asked again next visit; the server still remembers
    }
    setHeroId(id)
  }

  const hero = protagonistById(heroId) ?? protagonistById('jordan')!

  // One game for all three: switching changes who you are without reconnecting (v47)
  return <Game profile={hero} onServerHero={choose} />
}

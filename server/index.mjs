// Brit Life multiplayer server (prototype).
// Run with:  npm run server
//
// Protocol (JSON over WebSocket)
//   client -> server  { t: 'join', name, gender, skin, hair, token }
//   client -> server  { t: 'move', x, z, ry, moving }
//   client -> server  { t: 'chat', text }
//   client -> server  { t: 'work', placeId } / { t: 'quit' }
//   client -> server  { t: 'buy', item }
//   client -> server  { t: 'movehome', tier }
//   server -> client  { t: 'welcome', id }
//   server -> client  { t: 'config', places, homes, movable, shop, monthMs, daysPerMonth, tax, hunger }
//   server -> client  { t: 'profile', ...economy snapshot }   (about once a second, and after every action)
//   server -> client  { t: 'shift', state, placeId, seconds?, reason? }
//   server -> client  { t: 'payslip', job, gross, tax, ni, net }
//   server -> client  { t: 'statement', month, items, income, balance, status, note }
//   server -> client  { t: 'notice', text, good }
//   server -> client  { t: 'chat', id, name, text, at }
//   client -> server  { t: 'enter', vehicle } / { t: 'exit' } / { t: 'drive', throttle, steer, brake }
//   server -> client  { t: 'state', players: [...], vehicles: [...] }
//   server -> client  { t: 'signals', cycle, serverNow, list: [{ id, x, z, r, o, arms: [{ b, ph }] }] }  (on join)
//   client -> server  { t: 'route', x, z, id }   server -> client  { t: 'route', id, drive, ok, pts: [[x, z], ...] }  (GPS)

import { WebSocketServer } from 'ws'
import { NPCS, NPC_LIST, TALK_RANGE, choose, startTalk, storySnapshot, view } from './npcs.mjs'
import { storyFor, touchStory } from './story.mjs'
import { DEFAULT_PROTAGONIST, PROTAGONIST_ORDER, protagonistFor, unlockedFor } from './protagonists.mjs'
import { ensureMissionState, missionSnapshot, noteVisits } from './missions.mjs'
import { failRun, quitRun, retryRun, runView, sceneDone, tickRun } from './runner.mjs'
import { addText, markRead, phoneSnapshot } from './phone.mjs'
import { PLACES, SPAWN } from './config.mjs'
import { newWallet } from './wallet.mjs'
import { STORY_PLACES } from './missions.mjs'
import { keyFor, load, save, touch, flush } from './profiles.mjs'
import { HEAT, OFFICERS, addHeat, officerSnapshot, policeSee, removeUnits, tickPolice } from './police.mjs'
import { HORNS, tickTraffic } from './traffic.mjs'
import { HEALTH, HOSPITALS, STATIONS, carHitDamage, crashDamage, nearest } from './health.mjs'
import { blocked } from './colliders.mjs'
import { PEOPLE, addFleeing, pedSnapshot, tickPedestrians } from './pedestrians.mjs'
import { ROAD_NODES, nearestNode, route } from './roads.mjs'
import { JUNCTIONS, armFor, lightFor, signalStats, signalsMessage } from './signals.mjs'
import { CAR, CRASHES, VEHICLES, cannotEnter, exitSpot, setInput, spawnCar, stepVehicle, vehicleById, vehicleSnapshot } from './vehicles.mjs'
import { FAR_DESTINATIONS, STOPS, bookTrip, quote, surgeAt, travelSeconds, inBounds } from './transport.mjs'

const PORT = Number(process.env.PORT) || 2567
const TICK_MS = 66 // ~15 snapshots per second
const MAX_SPEED = 7.5 // must match the client's sprinting speed, SPRINT_SPEED in src/App.tsx (m/s)
const MAX_PLAYERS = 100
const MAX_MESSAGES_PER_SECOND = 60
const MAX_CHAT_LENGTH = 140
const CHAT_COOLDOWN_MS = 600

const players = new Map()
const byWallet = new Map()
let nextId = 1

const wss = new WebSocketServer({ port: PORT, maxPayload: 2048 })

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function cleanChat(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // strip control characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHAT_LENGTH)
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

function broadcast(message) {
  const data = JSON.stringify(message)
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data)
  }
}

// v37: the story game has no life-sim (jobs, rent, hunger, homes, college, hub). Only the places the
// story sends you to are sent; the rest of the old config lives in archive/life-sim/.
const CONFIG_MESSAGE = {
  t: 'config',
  places: PLACES.filter((p) => STORY_PLACES.has(p.id)),
  homes: {},
  movable: [],
  shop: [],
  workHours: 8,
  farDestinations: FAR_DESTINATIONS.map((d) => ({ ...d, built: inBounds(d) })),
  npcs: NPC_LIST,
  stops: STOPS.map(({ id, name, mode, x, z }) => ({ id, name, mode, x, z })),
}

/** What the client sees of your wallet: in the story game that's just your cash. */
function snapshot(p) {
  return { t: 'profile', balance: p.profile.balance }
}

function pushProfile(p) {
  p.send?.(snapshot(p))
  p.lastProfileSent = Date.now()
}

/** Sends the mission log, but only when it has changed since last time. */
function pushMissions(p, force = false) {
  const body = JSON.stringify(missionSnapshot(p.profile, p.story, p.run))
  if (!force && body === p.lastMissions) return
  p.lastMissions = body
  p.send?.({ t: 'missions', ...JSON.parse(body) })
}

/** The mission log changed (or might have): send it if it differs from last time. */
function settleMissions(p) {
  pushMissions(p)
}

// What the mission runner (runner.mjs, v50) needs from the rest of the game
const GAME = {
  send: (p, message) => p.send?.(message),
  talking: (p) => Boolean(p.dialogue),
  carWrecked: (id) => Boolean(vehicleById(id)?.wrecked),
  spawnCar: (id, anchor, colour) => spawnCar(id, anchor, colour),
  clearWanted: (p) => {
    if (!(p.heat > 0)) return
    p.heat = 0
    p.arrestMs = 0
    removeUnits(p)
    p.wantedLevel = 0
    p.wantedSearching = false
    p.send({ t: 'wanted', level: 0, searching: false })
  },
  missionsChanged: (p) => pushMissions(p),
  /** A text to this character's phone (once per key); it arrives with a buzz (v52). */
  text: (p, key, text) => {
    const item = addText(p.story, p.story.protagonist, key, text)
    if (!item) return
    touchStory()
    p.send({ t: 'text', text: item })
    p.send(phoneSnapshot(p.story, p.story.protagonist))
  },
  /** Puts you somewhere (a retry from a checkpoint): out of any car, and the browser jumps there too. */
  place: (p, at) => {
    if (p.vehicleId) releaseVehicle(p)
    p.x = at.x
    p.z = at.z
    p.lastMove = Date.now()
    p.send({ t: 'switched', hero: p.story.protagonist, x: at.x, z: at.z, instant: true, cast: castView(p) })
  },
  /** Passed: pay out, mark it done, and whatever it changes in the story. */
  pass: (p, m) => {
    const profile = p.profile
    profile.balance += m.reward.cash
    profile.rep = (profile.rep ?? 0) + m.reward.rep
    profile.missions.done[m.id] = Date.now()
    const story = p.story
    if (!story.completedMissions.includes(m.id)) story.completedMissions.push(m.id)
    for (const flag of m.then?.flags ?? []) story.flags[flag] = true
    if (m.then?.unlock) story.locked = (story.locked ?? []).filter((id) => id !== m.then.unlock)
    p.send({ t: 'missionDone', id: m.id, title: m.title, dream: false, cash: m.reward.cash, rep: m.reward.rep, story: true })
    // Finishing the last mission of Act 1 opens Act 2
    if (m.then?.chapter === 'ch2' && story.chapterId === 'ch1') {
      story.chapterId = 'ch2'
      story.flags['chapter:2'] = true
      p.send({ t: 'notice', text: 'Act 1 complete. Act 2: The Network is now open.', good: true })
      addFeed(`${p.name} finished Act 1: The Collision`, 'story')
    }
    p.send(storySnapshot(story))
    touch()
    touchStory()
    pushProfile(p)
  },
}

// ---- The public city feed ----
const feed = []
function addFeed(text, kind = 'info') {
  const item = { text, kind, at: Date.now() }
  feed.push(item)
  if (feed.length > 30) feed.shift()
  broadcast({ t: 'feed', item })
}

/** Gets a player out of their car (the car stays where it is, with no driver). */
function releaseVehicle(p) {
  const v = vehicleById(p.vehicleId)
  if (v && v.driver === p.id) {
    v.driver = null
    v.leftAt = Date.now() // an abandoned stolen car is tidied away later (v43)
    v.input = { throttle: 0, steer: 0, brake: false, at: 0 }
  }
  p.vehicleId = null
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) {
    ws.close(1013, 'Server full')
    return
  }

  const id = String(nextId++)
  let player = null
  let messageCount = 0
  const rateReset = setInterval(() => {
    messageCount = 0
  }, 1000)

  ws.on('message', (raw) => {
    if (++messageCount > MAX_MESSAGES_PER_SECOND) return

    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.t === 'join' && !player) {
      const token =
        typeof msg.token === 'string' && msg.token.length >= 16
          ? msg.token.slice(0, 64)
          : `guest-${id}-${Date.now()}`
      const walletKey = keyFor(token)

      // One session per wallet: a second login replaces the first
      const existing = byWallet.get(walletKey)
      if (existing) {
        existing.send?.({ t: 'notice', text: 'Logged in from another tab or device', good: false })
        existing.ws.close(4000, 'Replaced')
      }

      // Load or create the wallet (migrating the old bare-balance wallets)
      const stored = load(walletKey)
      let profile
      let fresh = false
      if (stored && typeof stored === 'object') {
        profile = stored
      } else {
        profile = newWallet(typeof stored === 'number' ? stored : null)
        save(walletKey, profile)
        fresh = true
      }

      // Older profiles gain the newer fields. Traits and dream are set once, from the join message.
      const legacy = !fresh && profile.traits === undefined
      if (legacy) profile.homeChosen = true // existing players already live somewhere
      profile.traits ??= []
      profile.dream = null // dreams belonged to the life-sim
      ensureMissionState(profile)
      touch()

      // There is no character creator: you are one of two fixed protagonists, chosen once and
      // remembered on your wallet. The client only suggests one; the server decides the look.
      const story = storyFor(walletKey)
      if (!protagonistFor(story.protagonist)) {
        story.protagonist = (protagonistFor(msg.protagonist) ?? protagonistFor(DEFAULT_PROTAGONIST)).id
        touchStory()
      }
      const hero = protagonistFor(story.protagonist)
      // Each protagonist keeps their own place in the city and their own cash (v47)
      story.cast ??= {}
      profile.cash ??= {}
      profile.cash[hero.id] ??= profile.balance
      const at = story.cast[hero.id] ?? hero.home
      story.health ??= {}

      player = {
        id,
        ws,
        name: hero.name,
        gender: hero.gender,
        skin: hero.skin,
        hair: hero.hair,
        outfit: hero.outfit,
        // The server decides where you spawn: where this character was left (or their home)
        x: at.x,
        z: at.z,
        ry: 0,
        moving: false,
        lastMove: Date.now(),
        lastChat: 0,
        lastTick: Date.now(),
        lastProfileSent: 0,
        shift: null,
        walletKey,
        profile,
        story,
        heat: 0,
        // Health is kept per character (v49); someone who quit while wasted comes back well
        health: (story.health[hero.id] ?? 0) > 0 ? story.health[hero.id] : HEALTH.max,
        send: (message) => send(ws, message),
      }
      players.set(id, player)
      byWallet.set(walletKey, player)

      send(ws, { t: 'welcome', id, hero: story.protagonist, x: player.x, z: player.z, cast: castView(player) })
      send(ws, CONFIG_MESSAGE)
      send(ws, signalsMessage()) // traffic lights: the list once, the client runs the clock
      pushProfile(player)
      sendHealth(player)
      player.send(phoneSnapshot(player.story, player.story.protagonist))
      pushMissions(player, true)
      player.send(storySnapshot(player.story))
      player.send({ t: 'feedLog', items: feed })
      broadcast({ t: 'chat', id: null, name: '', text: `${player.name} joined`, at: Date.now() })
      console.log(`+ ${player.name} joined (${players.size} online)`)
      return
    }

    if (!player) return
    // Down (knocked over, wasted, busted): only chat gets through (v49)
    if (Date.now() < (player.downUntil ?? 0) && !['chat', 'move', 'dev'].includes(msg.t)) return

    // Test helpers, off unless the server is started with DEV_TOOLS=1
    if (process.env.DEV_TOOLS === '1' && msg.t === 'dev') {
      if (msg.cmd === 'heat') addHeat(player, num(msg.value, 0))
      // dev: knock the nearest few parked cars about (60, 40, 20, 0 health) to see damage (v43)
      if (msg.cmd === 'damage') {
        const near = VEHICLES.filter((v) => !v.driver && !v.traffic && !v.police).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))
        ;[55, 40, 20, 0].forEach((hp, i) => {
          if (!near[i]) return
          near[i].health = hp
          if (hp === 0) near[i].wrecked = true
        })
      }
      if (msg.cmd === 'hurt') hurt(player, num(msg.value, 10), Date.now()) // dev: lose health (v49)
      if (msg.cmd === 'bust') busted(player) // dev: arrested on the spot (v49)
      if (msg.cmd === 'teleport' && !player.vehicleId) {
        player.x = num(msg.x, player.x)
        player.z = num(msg.z, player.z)
        player.lastMove = Date.now()
      }
      if (msg.cmd === 'teleport' && player.vehicleId) {
        // dev: the car you're driving goes with you (v53, for testing driving steps)
        const car = vehicleById(player.vehicleId)
        if (car) {
          car.x = player.x = num(msg.x, car.x)
          car.z = player.z = num(msg.z, car.z)
          car.speed = 0
        }
      }
      return
    }

    // While you are driving, only chat, driving and getting out are allowed. Your position is the car's.
    if (player.vehicleId && !['chat', 'drive', 'exit', 'horn', 'missionRetry', 'missionQuit', 'sceneDone', 'textsRead'].includes(msg.t)) return

    if (msg.t === 'enter') {
      const vehicle = vehicleById(msg.vehicle)
      const fail = (text) => player.send({ t: 'notice', text, good: false })
      if (player.travel || player.shift || player.dialogue) return fail('Finish what you are doing first')
      const problem = cannotEnter(player, vehicle)
      if (problem) return fail(problem)
      const carjack = vehicle.traffic
      if (carjack) {
        // Drag the driver out (v43). They run off from the driver's side (UK cars: the right), and the
        // car stops being traffic: it's yours now, and it stays where you leave it.
        const rx = -Math.cos(vehicle.h)
        const rz = Math.sin(vehicle.h)
        const out = addFleeing(vehicle.x + rx * 1.6, vehicle.z + rz * 1.6, vehicle.x + rx * 9 - Math.sin(vehicle.h) * 4, vehicle.z + rz * 9 - Math.cos(vehicle.h) * 4)
        if (out) out.fleeMs = 3000
        vehicle.traffic = false
        vehicle.ai = false
        vehicle.owned = false
        vehicle.stolen = true
        delete vehicle.drive
      }
      vehicle.driver = player.id
      vehicle.input = { throttle: 0, steer: 0, brake: false, at: Date.now() }
      player.vehicleId = vehicle.id
      player.moving = false
      if (carjack) {
        addHeat(player, HEAT.carjack)
        player.send({ t: 'notice', text: 'You dragged the driver out. They are calling the police.', good: false })
      } else if (vehicle.owned) {
        addHeat(player, HEAT.theft)
        player.send({ t: 'notice', text: 'You stole a car. The police will be looking for you.', good: false })
      }
      return
    }

    // The horn (v43): everyone within earshot hears it
    if (msg.t === 'horn') {
      const vehicle = vehicleById(player.vehicleId)
      const now = Date.now()
      if (!vehicle || vehicle.driver !== player.id || now - (player.lastHorn ?? 0) < 250) return
      player.lastHorn = now
      HORNS.push({ id: vehicle.id, x: vehicle.x, z: vehicle.z, by: player.id })
      return
    }

    if (msg.t === 'drive') {
      const vehicle = vehicleById(player.vehicleId)
      if (vehicle && vehicle.driver === player.id) setInput(vehicle, msg, Date.now())
      return
    }

    if (msg.t === 'exit') {
      const vehicle = vehicleById(player.vehicleId)
      if (!vehicle) return
      if (Math.abs(vehicle.speed) > CAR.exitMaxSpeed) return player.send({ t: 'notice', text: 'Slow down before you get out', good: false })
      const spot = exitSpot(vehicle)
      if (!spot) return player.send({ t: 'notice', text: 'No room to get out here', good: false })
      releaseVehicle(player)
      player.x = spot.x
      player.z = spot.z
      player.lastMove = Date.now()
      return
    }

    if (msg.t === 'chat') {
      const now = Date.now()
      const text = cleanChat(msg.text)
      if (!text || now - player.lastChat < CHAT_COOLDOWN_MS) return

      player.lastChat = now
      broadcast({ t: 'chat', id, name: player.name, text, at: now })
      return
    }

    // ---- Talking to NPCs. The server picks the lines and checks every choice. ----
    // GPS: a road-following route from where you are to (x, z). At most about one a second each.
    if (msg.t === 'route') {
      const now = Date.now()
      if (now - (player.lastRoute ?? 0) < 800) return
      player.lastRoute = now
      const x = Number(msg.x)
      const z = Number(msg.z)
      if (!Number.isFinite(x) || !Number.isFinite(z)) return
      const drive = Boolean(player.vehicleId)
      const from = nearestNode(player.x, player.z, 120)
      const to = nearestNode(x, z, 160)
      // Driving: the legal way round. If there isn't one on the surface (one-way streets and bus gates
      // can make an area hard to reach), show the shortest way instead, one-ways and all.
      const path = from >= 0 && to >= 0 ? route(from, to, 20000, !drive) ?? (drive ? route(from, to, 20000, true) : null) : null
      const pts = path ? simplify(path.map((i) => [ROAD_NODES[i].x, ROAD_NODES[i].z]), 1.5) : []
      pts.push([x, z])
      player.send({ t: 'route', id: msg.id ?? null, drive, ok: Boolean(path), pts: pts.map(([px, pz]) => [Math.round(px * 10) / 10, Math.round(pz * 10) / 10]) })
      return
    }

    if (msg.t === 'talk') {
      const npc = NPCS[msg.npc]
      if (!npc || player.travel || player.shift) return
      if (Math.hypot(player.x - npc.x, player.z - npc.z) > TALK_RANGE) return
      player.dialogue = startTalk(player.story, npc.id)
      player.send(view(player.dialogue))
      return
    }

    if (msg.t === 'choose') {
      const d = player.dialogue
      if (!d) return
      const npc = NPCS[d.npc]
      if (Math.hypot(player.x - npc.x, player.z - npc.z) > TALK_RANGE + 2) {
        player.dialogue = null
        player.send({ t: 'dialogueEnd' })
        return
      }
      const result = choose(player.story, d, msg.i)
      if (!result) return
      // Money changing hands in a conversation (v53): never more than you have
      if (result.cash) {
        const amount = Math.max(result.cash, -player.profile.balance)
        player.profile.balance += amount
        player.send({ t: 'notice', text: `${amount > 0 ? '+' : '−'}£${(Math.abs(amount) / 100).toFixed(2)}`, good: amount > 0 })
        touch()
        pushProfile(player)
      }
      if (result.end) {
        player.dialogue = null
        player.send({ t: 'dialogueEnd' })
      } else {
        player.dialogue = result.state
        player.send(view(player.dialogue))
      }
      player.send(storySnapshot(player.story))
      settleMissions(player)
      return
    }

    if (msg.t === 'endtalk') {
      player.dialogue = null
      return
    }

    // v37: 'work', 'hub', 'college', 'quit', 'buy', 'choosehome' and 'movehome' were life-sim actions (see archive/life-sim/).

    if (msg.t === 'quote' || msg.t === 'travel') {
      const dest = { x: num(msg.x, NaN), z: num(msg.z, NaN) }
      if (!Number.isFinite(dest.x) || !Number.isFinite(dest.z)) return
      const hasPass = false // no monthly bills in the story game, so no bus pass: fares come out of your cash
      const q = quote(player, dest, { hasPass, surge: surgeAt() })
      const fail = (text) => player.send({ t: 'notice', text, good: false })

      if (msg.t === 'quote') {
        player.send({ t: 'quote', x: dest.x, z: dest.z, hasPass, ...q })
        return
      }

      if (player.travel) return
      const mode = q.modes.find((m) => m.id === msg.mode && m.id !== 'walk')
      if (!mode) return fail('Pick a way to travel')
      if (!inBounds(dest)) return fail('That part of the city is not built yet. You can see the fare, but you cannot go.')
      if (!mode.available) return fail(mode.reason ?? 'That trip is not possible')
      if (player.shift) return fail('Finish your shift first (press Q to leave early).')
      if (player.profile.balance < mode.fare) return fail("You can't afford that fare")

      bookTrip(player.profile, mode.fare)
      const seconds = travelSeconds(mode.minutes)
      player.travel = { mode: mode.id, x: dest.x, z: dest.z, endsAt: Date.now() + seconds * 1000 }
      player.moving = false
      player.send({ t: 'travel', state: 'started', mode: mode.id, label: mode.label, icon: mode.icon, fare: mode.fare, minutes: mode.minutes, seconds, note: mode.note })
      settleMissions(player)
      pushProfile(player)
      return
    }

    // Switch protagonist (v47), GTA V-style. Not while the police are after you, or on the bus. If you're
    // driving, you get out and the car stays where it is. Each character keeps their place and cash.
    if (msg.t === 'switch') {
      const to = protagonistFor(msg.to)
      const now = Date.now()
      const story = player.story
      if (!to || to.id === story.protagonist || now < (player.switchUntil ?? 0)) return
      if (!unlockedFor(story).includes(to.id)) return player.send({ t: 'notice', text: `You can't play as ${to.name} yet.`, good: false })
      if ((player.heat ?? 0) > 0) return player.send({ t: 'notice', text: "You can't switch while the police are after you.", good: false })
      if (player.travel) return player.send({ t: 'notice', text: 'Wait till you get off.', good: false })
      if (now < (player.downUntil ?? 0)) return
      if (player.run && !player.run.failed) return player.send({ t: 'notice', text: 'Finish the mission first (or fail it).', good: false })
      if (player.run) quitRun(player, GAME)
      if (player.vehicleId) releaseVehicle(player)
      const from = { x: player.x, z: player.z }
      const was = story.protagonist
      story.cast ??= {}
      story.cast[was] = { x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10 }
      const profile = player.profile
      profile.cash ??= {}
      profile.cash[was] = profile.balance
      profile.balance = profile.cash[to.id] ?? to.cash ?? profile.balance
      story.health ??= {}
      story.health[was] = Math.round(player.health)
      player.health = (story.health[to.id] ?? 0) > 0 ? story.health[to.id] : HEALTH.max
      story.protagonist = to.id
      const at = story.cast[to.id] ?? to.home
      Object.assign(player, { name: to.name, gender: to.gender, skin: to.skin, hair: to.hair, outfit: to.outfit, x: at.x, z: at.z, moving: false })
      player.switchUntil = now + 3000 // ignore the old position the browser still reports while the camera flies over
      touch()
      touchStory()
      player.send({ t: 'switched', hero: to.id, x: at.x, z: at.z, from, cast: castView(player) })
      pushProfile(player)
      sendHealth(player)
      player.send(phoneSnapshot(player.story, player.story.protagonist))
      pushMissions(player, true) // missions are per character
      return
    }

    // A failed mission: try again from the last checkpoint, or give up (v50)
    if (msg.t === 'missionRetry') return retryRun(player, Date.now(), GAME)
    if (msg.t === 'missionQuit') return quitRun(player, GAME)
    if (msg.t === 'sceneDone') return sceneDone(player, String(msg.id), Date.now(), GAME)
    if (msg.t === 'textsRead') {
      markRead(player.story, player.story.protagonist, String(msg.from))
      touchStory()
      return player.send(phoneSnapshot(player.story, player.story.protagonist))
    }

    if (msg.t === 'move') {
      if (player.travel) return // you're on the bus
      if (Date.now() < (player.switchUntil ?? 0)) return // mid-switch: the old position is stale
      if (Date.now() < (player.downUntil ?? 0)) return // knocked down, wasted or busted: you can't move
      player.firstMoveAt ??= Date.now() // the browser is up (missions that start by themselves wait for this)
      const now = Date.now()
      const dt = Math.max((now - player.lastMove) / 1000, 0.016)
      player.lastMove = now

      // Anti-teleport: a player may only travel as far as walking allows.
      const dx = num(msg.x, player.x) - player.x
      const dz = num(msg.z, player.z) - player.z
      const distance = Math.hypot(dx, dz)
      const maxDistance = MAX_SPEED * dt * 1.5 + 0.25
      const scale = distance > maxDistance ? maxDistance / distance : 1

      player.x += dx * scale
      player.z += dz * scale
      player.ry = num(msg.ry, player.ry)
      player.moving = Boolean(msg.moving)
    }
  })

  ws.on('close', () => {
    clearInterval(rateReset)
    if (player) {
      // Remember where this character was left (v47)
      player.story.cast ??= {}
      if (!(Date.now() < (player.switchUntil ?? 0))) player.story.cast[player.story.protagonist] = { x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10 }
      player.story.health ??= {}
      player.story.health[player.story.protagonist] = Math.round(player.health)
      touchStory()
      releaseVehicle(player)
      removeUnits(player)
      players.delete(id)
      if (byWallet.get(player.walletKey) === player) byWallet.delete(player.walletKey)
      touch()
      broadcast({ t: 'chat', id: null, name: '', text: `${player.name} left`, at: Date.now() })
      console.log(`- ${player.name} left (${players.size} online)`)
    }
  })

  ws.on('error', () => ws.terminate())
})

// The world clock, 4 times a second: journeys arriving, missions, and the wallet snapshot.
// (Until v37 this also ran the life-sim: rent, hunger, monthly statements and job shifts.)
setInterval(() => {
  const now = Date.now()

  for (const p of players.values()) {
    p.lastTick = now
    let changed = false

    // Travel: arrive at the destination when the journey is up
    if (p.travel && now >= p.travel.endsAt) {
      p.x = p.travel.x
      p.z = p.travel.z
      p.lastMove = now
      p.travel = null
      p.send({ t: 'travel', state: 'arrived', x: p.x, z: p.z })
    }

    // Missions: note who and where you've been about once a second, then pay out anything finished
    if (now - (p.lastMissionCheck ?? 0) >= 1000) {
      p.lastMissionCheck = now
      noteVisits(p, players.values())
      changed = true
    }
    if (changed) settleMissions(p)

    if (changed || now - p.lastProfileSent >= 1000) pushProfile(p)
  }

  if (players.size > 0) touch()
}, 250)

setInterval(() => {
  if (players.size === 0) return

  const state = JSON.stringify({
    t: 'state',
    players: [...players.values()].filter((p) => !p.travel).map((p) => ({
      id: p.id,
      name: p.name,
      gender: p.gender,
      skin: p.skin,
      hair: p.hair,
      outfit: p.outfit,
      x: Math.round(p.x * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      ry: Math.round(p.ry * 100) / 100,
      moving: p.moving,
      veh: p.vehicleId ?? null,
    })),
  })

  // Cars are only sent to players they are near (traffic fills the streets, so this keeps messages small)
  const snapshots = VEHICLES.map((v) => [v, vehicleSnapshot(v)])
  const head = state.slice(0, -1) // the message without its closing brace
  for (const p of players.values()) {
    if (p.ws.readyState !== p.ws.OPEN) continue
    const mine = snapshots.filter(([v]) => !v.underground && (v.driver || !v.traffic || Math.hypot(v.x - p.x, v.z - p.z) < 260)).map(([, snap]) => snap)
    const people = PEOPLE.filter((u) => Math.abs(u.x - p.x) < 170 && Math.abs(u.z - p.z) < 170).map(pedSnapshot)
    for (const o of OFFICERS) if (Math.abs(o.x - p.x) < 170 && Math.abs(o.z - p.z) < 170) people.push(officerSnapshot(o))
    p.ws.send(`${head},"vehicles":${JSON.stringify(mine)},"peds":${JSON.stringify(people)}}`)
  }
}, TICK_MS)

// Car physics: 30 steps a second. A driver's position is simply the car's position.
let lastPhysics = Date.now()
setInterval(() => {
  const now = Date.now()
  const dt = Math.min((now - lastPhysics) / 1000, 0.1)
  lastPhysics = now
  for (const v of VEHICLES) {
    if (v.driver === null && v.speed === 0 && !v.ai) continue
    stepVehicle(v, dt, now, VEHICLES)
  }
  for (const p of players.values()) {
    const v = p.vehicleId ? vehicleById(p.vehicleId) : null
    if (!v) continue
    p.x = v.x
    p.z = v.z
    p.ry = v.h
    p.moving = false
    p.lastMove = now
  }
}, 33)

// Police: the chase AI and arrests, 10 times a second
setInterval(() => {
  if (players.size === 0) return
  tickPolice({ players: [...players.values()], now: Date.now(), dt: 0.1, onBusted: busted, onHitOfficer: hitOfficer })
  judgeDriving(Date.now())
  tickTraffic({ players: [...players.values()], now: Date.now() })
  tickPedestrians({ players: [...players.values()], cars: VEHICLES, now: Date.now(), dt: 0.1, onHit: knockedDown })
  tickHealth(Date.now(), 0.1)
  for (const p of players.values()) tickRun(p, Date.now(), GAME)
  // Wrecks (v43, C7): a traffic or police driver climbs out and runs; your own wreck gets a notice
  for (const v of VEHICLES) {
    if (!v.wrecked || v.wreckHandled) continue
    v.wreckHandled = true
    if (v.traffic || (v.police && v.ai)) {
      const rx = -Math.cos(v.h)
      const rz = Math.sin(v.h)
      if (v.traffic) addFleeing(v.x + rx * 1.6, v.z + rz * 1.6, v.x + rx * 10, v.z + rz * 10)
      v.traffic = false
      v.ai = false
      v.target = null
      delete v.drive
    }
    v.stolen = true // tidied away like an abandoned stolen car
    v.leftAt = v.driver ? 0 : Date.now()
    const driver = v.driver ? players.get(v.driver) : null
    driver?.send({ t: 'notice', text: 'The car is wrecked. Get out (E).', good: false })
  }
  // Stolen cars and wrecks left lying about: gone once nobody's been near them for a while (v43)
  for (let i = VEHICLES.length - 1; i >= 0; i--) {
    const v = VEHICLES[i]
    if (!v.stolen || v.driver || Date.now() - (v.leftAt ?? 0) < (v.wrecked ? 90000 : 120000)) continue
    if ([...players.values()].some((p) => Math.hypot(p.x - v.x, p.z - v.z) < 200)) continue
    VEHICLES.splice(i, 1)
  }
  // Horns: to everyone within 120 m (not back to whoever pressed it: they already heard it)
  for (const horn of HORNS.splice(0)) {
    for (const p of players.values()) {
      if (p.id === horn.by || Math.hypot(p.x - horn.x, p.z - horn.z) > 120) continue
      p.send({ t: 'horn', id: horn.id, x: Math.round(horn.x), z: Math.round(horn.z) })
    }
  }
}, 100)

// ---- Crimes on the road (v44, C8) ----
const LIT = JUNCTIONS.filter((j) => j.lit)

/** Charges a crime once per `coolMs` per kind, so one incident isn't counted every tick. */
function crime(p, kind, heat, text, now, coolMs = 8000) {
  p.crimeAt ??= {}
  if (now - (p.crimeAt[kind] ?? 0) < coolMs) return
  p.crimeAt[kind] = now
  addHeat(p, heat, now)
  p.send({ t: 'notice', text, good: false })
}

/** Red lights and speeding (when the police can see), and ramming. Runs ten times a second. */
function judgeDriving(now) {
  for (const p of players.values()) {
    const car = p.vehicleId ? vehicleById(p.vehicleId) : null
    if (!car) {
      p.junctionId = null
      continue
    }
    // Through a red light: judged as you enter the junction, by the light facing the way you came in
    const j = LIT.find((q) => Math.hypot(q.x - car.x, q.z - car.z) < q.r + 1)
    if (j && p.junctionId !== j.id) {
      p.junctionId = j.id
      if (car.speed > 3 && lightFor(j, armFor(j, car.h).ph, now) === 'red' && policeSee(car.x, car.z)) {
        crime(p, 'redLight', HEAT.redLight, 'You ran a red light in front of the police.', now)
      }
    } else if (!j) p.junctionId = null
    // Flat out past a police car
    if (car.speed > 15 && VEHICLES.some((v) => v.police && !v.wrecked && v !== car && Math.hypot(v.x - car.x, v.z - car.z) < 30)) {
      crime(p, 'speeding', HEAT.speeding, 'Speeding past the police.', now, 20000)
    }
  }
  // Ramming: a police car always counts; someone else's car only if the police see it
  for (const { a, b } of CRASHES.splice(0)) {
    for (const [mine, theirs] of [[a, b], [b, a]]) {
      const p = mine.driver ? players.get(mine.driver) : null
      if (!p) continue
      if (theirs.police) crime(p, 'ramPolice', HEAT.ramPolice, 'You rammed a police car.', now, 3000)
      else if ((theirs.traffic || theirs.driver) && policeSee(mine.x, mine.z)) crime(p, 'ramCar', HEAT.ramCar, 'Ramming cars in front of the police.', now, 4000)
    }
  }
}

/** A player's car ran an officer down. Always a crime. */
function hitOfficer(driverId) {
  const p = players.get(driverId)
  if (p) crime(p, 'hitOfficer', HEAT.hitOfficer, 'You ran down a police officer.', Date.now(), 2000)
}

/** The switch wheel's view of the three: who's who, who's unlocked, and roughly where each one is. */
function castView(p) {
  const unlocked = unlockedFor(p.story)
  return PROTAGONIST_ORDER.map((id) => {
    const hero = protagonistFor(id)
    const at = id === p.story.protagonist ? { x: p.x, z: p.z } : p.story.cast?.[id] ?? hero.home
    return { id, name: hero.name, x: Math.round(at.x), z: Math.round(at.z), unlocked: unlocked.includes(id), active: id === p.story.protagonist }
  })
}

/** A car knocked someone down. If a player was driving, there were witnesses (v42). */
function knockedDown(car, person, speed) {
  const driver = car.driver ? players.get(car.driver) : null
  if (!driver || person.reported) return
  person.reported = true
  addHeat(driver, speed > 9 ? HEAT.hitPedestrianFast : HEAT.hitPedestrian)
  driver.send({ t: 'notice', text: 'You hit someone. Witnesses are calling the police.', good: false })
}

/** Douglas-Peucker: drop route points that sit on a near-straight line (keeps messages small). */
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, az] = pts[a]
    const [bx, bz] = pts[b]
    const len = Math.hypot(bx - ax, bz - az) || 1
    let far = -1
    let fd = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len
      if (d > fd) { fd = d; far = i }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** Caught: a fine, out of the car, and (after the BUSTED screen) out of the nearest police station (v49). */
function busted(p) {
  const fine = Math.min(p.profile.balance, HEAT.fine)
  p.profile.balance -= fine
  if (p.vehicleId) releaseVehicle(p)
  const station = nearest(STATIONS, p.x, p.z)
  p.downUntil = Date.now() + HEALTH.bustedMs
  p.send({ t: 'busted', fine, place: station.name })
  failRun(p, 'You got busted.', GAME)
  p.send({ t: 'wanted', level: 0, searching: false })
  p.wantedLevel = 0
  p.wantedSearching = false
  touch()
  pushProfile(p)
  setTimeout(() => release(p, station), HEALTH.bustedMs)
}

/** Back on your feet somewhere (a hospital, a police station): the browser jumps there. */
function release(p, place) {
  if (!players.has(p.id)) return
  p.x = place.x
  p.z = place.z
  p.lastMove = Date.now()
  p.downUntil = 0
  p.send({ t: 'switched', hero: p.story.protagonist, x: place.x, z: place.z, instant: true, cast: castView(p) })
}

// ---- Health (v49, E15) ----

/** Tells the browser your health (whole numbers; `hit` is how much was just lost, for the red flash). */
function sendHealth(p, hit = 0) {
  p.sentHealth = Math.round(p.health)
  p.send({ t: 'health', hp: p.sentHealth, hit: Math.round(hit) })
}

/** Takes health; at 0 you're wasted. `shove` knocks you over (and along) without killing you. */
function hurt(p, amount, now, shove = null) {
  if (amount <= 0 || now < (p.downUntil ?? 0)) return
  p.health = Math.max(0, p.health - amount)
  p.hurtAt = now
  if (shove && !p.vehicleId) {
    // thrown a little: to a clear spot, and the browser jumps there with you
    for (const k of [1, 0.6, 0.3, 0]) {
      const x = p.x + shove.x * k
      const z = p.z + shove.z * k
      if (k === 0 || !blocked(x, z, 0.5)) {
        p.x = x
        p.z = z
        break
      }
    }
  }
  sendHealth(p, amount)
  if (p.health <= 0) return wasted(p, now)
  if (shove) {
    p.downUntil = now + HEALTH.knockedMs
    p.send({ t: 'knocked', x: p.x, z: p.z, ms: HEALTH.knockedMs })
  }
}

/** Wasted: the police lose interest, a hospital bill, and you wake up outside the nearest hospital. */
function wasted(p, now) {
  if (p.vehicleId) releaseVehicle(p)
  p.heat = 0
  p.arrestMs = 0
  removeUnits(p)
  p.send({ t: 'wanted', level: 0, searching: false })
  const bill = Math.min(p.profile.balance, HEALTH.hospitalBill)
  p.profile.balance -= bill
  const hospital = nearest(HOSPITALS, p.x, p.z)
  p.downUntil = now + HEALTH.wastedMs
  p.send({ t: 'wasted', bill, place: hospital.name, x: p.x, z: p.z })
  failRun(p, 'You died.', GAME)
  touch()
  pushProfile(p)
  setTimeout(() => {
    p.health = HEALTH.max
    release(p, hospital)
    sendHealth(p)
  }, HEALTH.wastedMs)
}

/** Ten times a second: cars hitting you on foot, crashes at the wheel, and health coming back. */
function tickHealth(now, dt) {
  for (const p of players.values()) {
    if (p.travel) continue
    const car = p.vehicleId ? vehicleById(p.vehicleId) : null
    if (car) {
      // A hard crash hurts the driver (each knock once)
      if (car.hitAt && car.hitAt !== p.crashSeen) {
        p.crashSeen = car.hitAt
        hurt(p, crashDamage(car.lastImpact ?? 0), now)
      }
    } else if (!(now < (p.downUntil ?? 0))) {
      // On foot: inside a moving car's footprint means you've been hit
      for (const v of VEHICLES) {
        const speed = Math.abs(v.speed)
        if (speed < HEALTH.carHitFrom || v.underground || Math.abs(v.x - p.x) > 5 || Math.abs(v.z - p.z) > 5) continue
        const fx = Math.sin(v.h) * Math.sign(v.speed)
        const fz = Math.cos(v.h) * Math.sign(v.speed)
        const dx = p.x - v.x
        const dz = p.z - v.z
        const along = dx * fx + dz * fz
        const across = dx * fz - dz * fx
        if (Math.abs(along) > 2.4 || Math.abs(across) > 1.2) continue
        if (p.hitBy === v.id && now - (p.hitAt ?? 0) < 1500) continue
        p.hitBy = v.id
        p.hitAt = now
        const side = across >= 0 ? 1 : -1
        const throwM = Math.min(4, speed * 0.25)
        hurt(p, carHitDamage(speed), now, { x: fx * throwM + fz * side * 0.8, z: fz * throwM - fx * side * 0.8 })
        if (v.driver === null && (v.traffic || v.police)) v.speed *= 0.4 // the driver brakes
        break
      }
    }
    // Healing: slowly, once nothing has hurt you for a while
    if (p.health > 0 && p.health < HEALTH.max && now - (p.hurtAt ?? 0) > HEALTH.regenAfterMs) {
      p.health = Math.min(HEALTH.max, p.health + HEALTH.regenPerSecond * dt)
      if (Math.round(p.health) !== p.sentHealth && (Math.round(p.health) % 5 === 0 || p.health >= HEALTH.max)) sendHealth(p)
    }
  }
}

process.on('exit', flush)
console.log(`Brit Life server listening on ws://localhost:${PORT}`)
console.log(`Traffic lights: ${signalStats().lit} junctions lit, ${signalStats().giveWay} give-way`)

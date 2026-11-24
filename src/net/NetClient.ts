import { horn } from '../carSounds'
import { clock } from '../world/daylight'
import { protagonistById } from '../protagonists'

export type Gender = 'male' | 'female'

export type RemotePlayerState = {
  id: string
  name: string
  gender: Gender
  skin: string
  hair: string
  outfit?: string
  x: number
  z: number
  ry: number
  moving: boolean
  /** id of the car this player is driving, if any */
  veh?: string | null
}

/** A car as the server describes it (short keys keep the 15/s snapshots small). */
/** A junction with traffic lights (from the server, once). Arms: approach bearing and phase A/B. */
export type SignalJunction = { id: number; x: number; z: number; r: number; o: number; arms: { b: number; ph: 'A' | 'B' }[] }
export type SignalCycle = { greenA: number; amber: number; allRed: number; greenB: number }
export type VehicleState = { id: string; c: string; x: number; z: number; h: number; v: number; s: number; d: string | null; o: number; p: number; t: number; k?: string; hp?: number; at: number }

export type JoinInfo = {
  /** which fixed protagonist you want ('jordan' | 'maya'); the server remembers the first choice */
  protagonist: string
  x: number
  z: number
}

export type NpcInfo = { id: string; name: string; role: string; gender: Gender; skin: string; hair: string; outfit: string; x: number; z: number; ry: number }
export type DialogueView = { npc: string; name: string; role: string; lines: string[]; choices: string[] }
export type StoryInfo = { chapterId: string; relationships: Record<string, number>; decisions: Record<string, string>; flags: Record<string, boolean> }

export type FeedItem = { text: string; kind: string; at: number }

export type ChatMessage = {
  id: string | null // null = system message
  name: string
  text: string
  at: number
}

export type PlaceKind = 'job' | 'shop' | 'lettings' | 'hub' | 'college'

export type Place = {
  id: string
  kind: PlaceKind
  name: string
  x: number
  z: number
  hourly?: number // pence per hour (jobs)
  seconds?: number // real seconds per shift (jobs)
  venue?: string // name of the real building on the map this place stands for
  priceMult?: number // shops: how much dearer than the Corner Shop
  district?: string
}

export type CareerInfo = {
  shifts: number
  rank: number
  title: string
  mult: number
  next: { title: string; shifts: number; edu: number; mult: number } | null
}

/** What a shift at this job pays before tax: same rule as the server. */
export function jobPay(
  place: { id: string; hourly?: number },
  config: { workHours: number } | null,
  profile: { career?: Record<string, CareerInfo>; mods?: { pay: number } } | null,
): number {
  const mult = profile?.career?.[place.id]?.mult ?? 1
  return Math.round((place.hourly ?? 0) * (config?.workHours ?? 8) * mult * (profile?.mods?.pay ?? 1))
}

/** One line on how close the next promotion is. */
export function promotionText(info: CareerInfo | undefined, eduLevel: number): string {
  if (!info) return ''
  if (!info.next) return 'Top of the ladder'
  const needs: string[] = []
  if (info.shifts < info.next.shifts) needs.push(`${info.next.shifts - info.shifts} more shift${info.next.shifts - info.shifts === 1 ? '' : 's'}`)
  if (eduLevel < info.next.edu) needs.push(`education level ${info.next.edu}`)
  return needs.length ? `Next: ${info.next.title}. Needs ${needs.join(' and ')}` : `Next: ${info.next.title}. Finish a shift to be promoted`
}

export type CollegeState = {
  xp: number
  level: number
  nextXp: number | null
  thisXp: number
  lecturedToday: boolean
  payBonus: number
  seconds: { lecture: number }
  xpPerLecture: number
}

export type HomeInfo = { name: string; rent: number; councilTax: number; bills: number; note: string }
export type ShopItem = { id: string; name: string; price: number; restore: number }

export type Config = {
  places: Place[]
  homes: Record<string, HomeInfo>
  movable: { id: string; deposit: number }[]
  shop: ShopItem[]
  monthMs: number
  daysPerMonth: number
  tax: { monthlyAllowance: number; incomeRate: number; niRate: number }
  hunger: { start: number; perDay: number; minToWork: number }
  odds?: Record<string, number>
  traits: Record<string, { label: string; blurb: string }>
  dreams: Record<string, { label: string; blurb: string }>
  traitLimit: number
  backgrounds: Record<string, { label: string; balance: number; home: string; allowance: number }>
  workHours: number
  universalBills: { label: string; amount: number }[]
  npcs?: NpcInfo[]
  farDestinations: { id: string; name: string; icon: string; x: number; z: number; built: boolean }[]
  stops: { id: string; name: string; mode: string; x: number; z: number }[]
}

export type TravelMode = {
  id: 'walk' | 'bus' | 'tram' | 'train' | 'uber'
  label: string
  icon: string
  available: boolean
  fare: number
  minutes: number
  note: string
  reason?: string
  surge?: number
}
export type Quote = { x: number; z: number; straight: number; hasPass: boolean; modes: TravelMode[] }
export type Journey = { mode: string; label: string; icon: string; fare: number; minutes: number; seconds: number; note: string; startedAt: number }

export type Mods = { pay: number; food: number; shop: number; hunger: number; mission: number }

export type MissionRow = {
  id: string
  title: string
  desc: string
  group: string
  place: string | null
  cur: number
  target: number
  money: boolean // cur/target are pence
  cash: number
  /** whose mission it is, and where its yellow start marker stands (null: it starts by itself) (v50) */
  hero?: string | null
  start?: { x: number; z: number; name: string } | null
}

/** The mission being played (v50): the current objective, where it points, and a timer if there is one. */
export type RunView = {
  id: string
  title: string
  step: number
  steps: number
  text: string
  hint: string | null
  target: { x: number; z: number; name: string } | null
  left: number
  failed: string | null
}

export type MissionsState = {
  active: MissionRow[]
  /** the other characters' missions (v50) */
  others?: MissionRow[]
  done: { id: string; title: string; group: string }[]
  dream: (Omit<MissionRow, 'group' | 'place' | 'id'> & { id: string; done: boolean }) | null
  rep: number
}

export type PhoneApp = 'home' | 'missions' | 'bank' | 'map' | 'jobs' | 'profile' | 'people' | 'wiki' | 'messages' | 'contacts'

/** A text on your phone (v52). `mission`: the mission it's about, so the phone can set GPS to its marker. */
export type TextMessage = { id: string; from: string; body: string; at: number; read: boolean; mission: string | null }
export type Contact = { id: string; name: string; role: string }
export type CastMember = { id: string; name: string; x: number; z: number; unlocked: boolean; active: boolean }
/** How long the camera takes to fly from one character to another (ms). */
export const SWITCH_MS = 2900

export type PedState = { x: number; z: number; h: number; s: number; look: number; at: number }

export type Waypoint = { id: string | null; name: string; x: number; z: number }

export type MissionDone = { id: string; title: string; dream: boolean; cash: number; rep: number; at: number }

export type Profile = {
  background: 'lapo' | 'nepo'
  homeChosen: boolean
  traits: string[]
  dream: string | null
  mods: Mods
  hub: HubState
  college: CollegeState
  career: Record<string, CareerInfo>
  balance: number
  home: string
  deposit: number
  hunger: number
  month: number
  day: number
  monthMs: number
  arrears: number
  missed: number
  grossMonth: number
  taxMonth: number
  niMonth: number
  workedToday: boolean
  weekend: boolean
}

export type Payslip = { job: string; gross: number; tax: number; ni: number; net: number; at: number }

export type Statement = {
  month: number
  items: { label: string; amount: number; ok: boolean }[]
  income: { gross: number; tax: number; ni: number }
  balance: number
  status: 'ok' | 'warning' | 'final' | 'evicted'
  note: string
}

export type Shift = { placeId: string; startedAt: number; seconds: number; label?: string }

export type SkillState = { xp: number; level: number; next: number }
export type HubState = {
  coding: SkillState
  hustle: SkillState
  gigsLeft: number
  gigPay: number
  studiedToday: boolean
  studyCost: number
  pitchWait: number
  pitchOdds: number
  pitchPayout: number
  seconds: { gig: number; study: number; pitch: number }
}

export type Toast = { text: string; good: boolean; at: number }

type Status = 'connecting' | 'online' | 'offline'

const BUBBLE_MS = 6000
const MAX_LOG = 50

const SEND_INTERVAL_MS = 66 // ~15 updates per second
const RECONNECT_DELAY_MS = 2000

/**
 * Talks to the game server. Positions live in a plain Map (not React state)
 * so 15 updates a second never trigger React re-renders. React only hears
 * about it when players join/leave or the connection status changes.
 */
export class NetClient {
  readonly remotes = new Map<string, RemotePlayerState>()
  readonly chatLog: ChatMessage[] = []
  config: Config | null = null
  profile: Profile | null = null
  /** the protagonist the server has on record for this wallet */
  heroId: string | null = null
  /** The three protagonists for the switch wheel (v47): who's unlocked, who's active, roughly where they are. */
  cast: CastMember[] = []
  /**
   * Where the server has put you: on joining, after a switch, after being busted. The player jumps there;
   * for a switch (not `instant`) the camera flies over the city first. `seq` goes up each time.
   */
  placed: { x: number; z: number; from: { x: number; z: number } | null; instant: boolean; at: number; seq: number } | null = null
  shift: Shift | null = null
  nearPlaceId: string | null = null
  menu: 'shop' | 'lettings' | 'hub' | 'college' | null = null
  toast: Toast | null = null
  payslip: Payslip | null = null
  statement: Statement | null = null
  missions: MissionsState | null = null
  missionBanner: MissionDone | null = null
  /** The mission you're playing (v50), when its objective last changed, and when its timer runs out (performance.now()). */
  run: RunView | null = null
  runChangedAt = 0
  runEndsAt = 0
  /** The phone's texts and contacts (v52), the thread open in Messages, and the last text in (for the pop-up). */
  texts: TextMessage[] = []
  contacts: Contact[] = []
  thread: string | null = null
  newText: { text: TextMessage; at: number } | null = null
  /** A cut-scene playing (v51): which, and when it started (performance.now()). */
  scene: { id: string; at: number } | null = null
  /** Where the scene puts the protagonist this frame (written by the director, read by the Player). */
  sceneActor: { x: number; z: number; ry: number; moving: boolean; speed: number; pose?: 'talk' } | null = null
  /** The big title when a mission starts. */
  missionCard: { title: string; at: number } | null = null
  dialogue: DialogueView | null = null
  story: StoryInfo | null = null
  nearNpcId: string | null = null
  feed: FeedItem[] = []
  /** your own position, updated every frame by the player (no re-render) */
  me = { x: 0, z: 0, ry: 0 }
  phone: PhoneApp | null = null
  mapOpen = false
  quote: Quote | null = null
  journey: Journey | null = null
  arrival = { n: 0, x: 0, z: 0 }
  /** cars, from the server. `at` is when the snapshot arrived (for smoothing). */
  readonly vehicles = new Map<string, VehicleState>()
  /** People on the pavements near you (v42), as the server last said: state 0 walk, 1 wait, 2 cross, 3 run, 4 down. */
  readonly peds = new Map<string, PedState>()
  /** where each car is DRAWN this frame (written by the car meshes, read by the camera) */
  readonly vehiclePose = new Map<string, { x: number; z: number; h: number }>()
  myVehicle: string | null = null
  /** how wanted you are (0 to 5 stars), and whether the police have lost you and the heat is draining */
  wanted = { level: 0, searching: false }
  busted: { fine: number; place: string; at: number } | null = null
  /** Health, 0 to 100 (v49), and the last knock (for the red flash). */
  health = 100
  hurt: { amount: number; at: number } | null = null
  wasted: { bill: number; place: string; at: number } | null = null
  /** Knocked over, wasted or busted: you can't move until `until` (performance.now() time). */
  down: { kind: 'knocked' | 'wasted' | 'busted'; at: number; until: number } | null = null
  nearVehicleId: string | null = null
  lastDrive = { t: 0, s: 0, b: false, at: 0 }
  waypoint: Waypoint | null = null
  /** traffic lights: junctions, the cycle, and how far the server clock is ahead of ours */
  signals: SignalJunction[] = []
  signalCycle: SignalCycle | null = null
  serverClockOffset = 0
  /** GPS: the road route to the current target (from the server), or null */
  gps: { pts: [number, number][]; ok: boolean; to: { x: number; z: number }; drive: boolean } | null = null
  private gpsAsk = { x: Infinity, z: Infinity, tx: Infinity, tz: Infinity, at: 0, drive: false }
  readonly bubbles = new Map<string, { text: string; until: number }>()

  private url: string
  private joinInfo: JoinInfo
  private ws: WebSocket | null = null
  private myId: string | null = null
  private status: Status = 'connecting'
  private idsKey = ''
  private summary = 'connecting|0'
  private chatVersion = 0
  private gameVersion = 0
  private token = getToken()
  private listeners = new Set<() => void>()
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private lastSent = 0
  private lastMoving = false

  constructor(url: string, joinInfo: JoinInfo) {
    this.url = url
    this.joinInfo = joinInfo
  }

  // ---- React bindings (useSyncExternalStore) ----
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getIdsKey = () => this.idsKey
  getSummary = () => this.summary
  getChatKey = () => this.chatVersion
  getMyId = () => this.myId
  getGameKey = () => this.gameVersion

  // ---- Connection ----
  connect() {
    this.closed = false
    this.open()
  }

  disconnect() {
    this.closed = true
    clearTimeout(this.retryTimer)
    this.ws?.close()
    this.ws = null
    this.reset('offline')
  }

  private open() {
    clearTimeout(this.retryTimer)
    this.setStatus('connecting')

    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'join', ...this.joinInfo, token: this.token }))
      this.setStatus('online')
    }

    ws.onmessage = (event) => {
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.t === 'welcome') {
        this.myId = msg.id
        this.heroId = typeof msg.hero === 'string' ? msg.hero : null
        if (Array.isArray(msg.cast)) this.cast = msg.cast as CastMember[]
        if (typeof msg.x === 'number' && typeof msg.z === 'number') this.placed = { x: msg.x, z: msg.z, from: null, instant: true, at: performance.now(), seq: (this.placed?.seq ?? 0) + 1 }
        this.bumpGame()
      } else if (msg.t === 'switched') {
        this.heroId = typeof msg.hero === 'string' ? msg.hero : this.heroId
        if (Array.isArray(msg.cast)) this.cast = msg.cast as CastMember[]
        const from = msg.from as { x: number; z: number } | undefined
        this.placed = { x: Number(msg.x), z: Number(msg.z), from: from ?? null, instant: Boolean(msg.instant), at: performance.now(), seq: (this.placed?.seq ?? 0) + 1 }
        this.lastSent = 0
        this.bumpGame()
      } else if (msg.t === 'state') {
        this.applyVehicles(msg.vehicles as Omit<VehicleState, 'at'>[] | undefined)
        this.applyPeds(msg.peds as [string, number, number, number, number, number][] | undefined)
        this.applyState(msg.players as RemotePlayerState[])
      } else if (msg.t === 'route') {
        const pts = Array.isArray(msg.pts) ? (msg.pts as [number, number][]) : []
        const last = pts[pts.length - 1]
        this.gps = last ? { pts, ok: Boolean(msg.ok), to: { x: last[0], z: last[1] }, drive: Boolean(msg.drive) } : null
      } else if (msg.t === 'horn') {
        // someone else's horn, or traffic you're blocking: louder the closer it is (v43)
        const d = Math.hypot(Number(msg.x) - this.me.x, Number(msg.z) - this.me.z)
        if (Number.isFinite(d)) horn(Math.pow(Math.max(0, 1 - d / 120), 1.5) * 0.9)
      } else if (msg.t === 'signals') {
        this.signals = Array.isArray(msg.list) ? (msg.list as SignalJunction[]) : []
        this.signalCycle = msg.cycle as SignalCycle
        this.serverClockOffset = typeof msg.serverNow === 'number' ? msg.serverNow - Date.now() : 0
        clock.offset = this.serverClockOffset // the time of day and the weather run on the server's clock (v46)
        this.bumpGame()
      } else if (msg.t === 'config') {
        this.config = msg as Config
        this.bumpGame()
      } else if (msg.t === 'missions') {
        this.missions = msg as MissionsState
        this.bumpGame()
      } else if (msg.t === 'run') {
        const run = (msg.run as RunView | null) ?? null
        if (!run || run.text !== this.run?.text || run.id !== this.run?.id || run.failed !== this.run?.failed) this.runChangedAt = performance.now()
        this.run = run
        this.runEndsAt = run && run.left > 0 ? performance.now() + run.left : 0
        this.bumpGame()
      } else if (msg.t === 'phone') {
        this.texts = (msg.texts as TextMessage[]) ?? []
        this.contacts = (msg.contacts as Contact[]) ?? []
        this.bumpGame()
      } else if (msg.t === 'text') {
        this.newText = { text: msg.text as TextMessage, at: performance.now() }
        setTimeout(() => this.bumpGame(), 6200)
        this.bumpGame()
      } else if (msg.t === 'scene') {
        this.scene = { id: String(msg.id), at: performance.now() }
        this.bumpGame()
      } else if (msg.t === 'mission') {
        if (msg.state === 'start') {
          this.missionCard = { title: String(msg.title), at: performance.now() }
          setTimeout(() => this.bumpGame(), 3600)
        }
        this.bumpGame()
      } else if (msg.t === 'missionDone') {
        this.missionBanner = { ...(msg as MissionDone), at: Date.now() }
        setTimeout(() => this.bumpGame(), 5200)
        this.bumpGame()
      } else if (msg.t === 'dialogue') {
        this.dialogue = msg as DialogueView
        this.menu = null
        this.bumpGame()
      } else if (msg.t === 'dialogueEnd') {
        this.dialogue = null
        this.bumpGame()
      } else if (msg.t === 'story') {
        this.story = msg as StoryInfo
        this.bumpGame()
      } else if (msg.t === 'wanted') {
        this.wanted = { level: Number(msg.level) || 0, searching: Boolean(msg.searching) }
        this.bumpGame()
      } else if (msg.t === 'health') {
        this.health = Number(msg.hp) || 0
        if (Number(msg.hit) > 0) this.hurt = { amount: Number(msg.hit), at: performance.now() }
        this.bumpGame()
      } else if (msg.t === 'knocked') {
        // Hit by a car: thrown a little way, and down for a moment
        this.placed = { x: Number(msg.x), z: Number(msg.z), from: null, instant: true, at: performance.now(), seq: (this.placed?.seq ?? 0) + 1 }
        this.down = { kind: 'knocked', at: performance.now(), until: performance.now() + (Number(msg.ms) || 1400) }
        this.myVehicle = null
        this.bumpGame()
      } else if (msg.t === 'wasted') {
        this.wasted = { bill: Number(msg.bill) || 0, place: String(msg.place ?? 'hospital'), at: Date.now() }
        this.down = { kind: 'wasted', at: performance.now(), until: performance.now() + 4500 }
        setTimeout(() => this.bumpGame(), 4700)
        this.bumpGame()
      } else if (msg.t === 'busted') {
        this.busted = { fine: Number(msg.fine) || 0, place: String(msg.place ?? 'the police station'), at: Date.now() }
        this.down = { kind: 'busted', at: performance.now(), until: performance.now() + 4000 }
        setTimeout(() => this.bumpGame(), 4200)
        this.bumpGame()
      } else if (msg.t === 'feedLog') {
        this.feed = (msg.items as FeedItem[]).slice(-8)
        this.bumpGame()
      } else if (msg.t === 'feed') {
        this.feed = [...this.feed, msg.item as FeedItem].slice(-8)
        this.bumpGame()
      } else if (msg.t === 'profile') {
        this.profile = msg as Profile
        this.bumpGame()
      } else if (msg.t === 'payslip') {
        this.payslip = { ...(msg as Payslip), at: Date.now() }
        setTimeout(() => this.bumpGame(), 8200)
        this.bumpGame()
      } else if (msg.t === 'statement') {
        this.statement = msg as Statement
        this.bumpGame()
      } else if (msg.t === 'notice') {
        this.showToast(String(msg.text), Boolean(msg.good))
      } else if (msg.t === 'quote') {
        this.quote = msg as Quote
        this.bumpGame()
      } else if (msg.t === 'travel') {
        if (msg.state === 'started') {
          this.journey = { ...(msg as Journey), startedAt: performance.now() }
          this.menu = null
          this.waypoint = null
          this.mapOpen = false
          this.phone = null
        } else {
          this.journey = null
          this.arrival = { n: this.arrival.n + 1, x: msg.x, z: msg.z }
          this.showToast('You have arrived', true)
        }
        this.bumpGame()
      } else if (msg.t === 'shift') {
        this.applyShift(msg)
      } else if (msg.t === 'chat') {
        this.applyChat(msg as ChatMessage)
      }
    }

    ws.onclose = (event) => {
      if (this.ws !== ws) return // an older socket closing
      this.reset('offline')

      // Replaced by a newer login on this wallet: don't fight back by reconnecting
      if (event.code === 4000) {
        this.closed = true
        this.showToast('This wallet is open in another tab. To test with two players in one browser, open the second tab with ?as=2 on the end of the address.', false)
        return
      }

      if (!this.closed) {
        this.retryTimer = setTimeout(() => this.open(), RECONNECT_DELAY_MS)
      }
    }

    ws.onerror = () => ws.close()
  }

  // ---- Outgoing ----
  sendMove(x: number, z: number, ry: number, moving: boolean) {
    this.me = { x, z, ry }
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const now = performance.now()
    this.me = { x, z, ry }
    if (this.waypoint && Math.hypot(this.waypoint.x - x, this.waypoint.z - z) < 4) {
      this.waypoint = null // arrived
      this.bumpGame()
    }
    const changed = moving !== this.lastMoving
    if (!changed && now - this.lastSent < SEND_INTERVAL_MS) return

    this.lastSent = now
    this.lastMoving = moving
    ws.send(JSON.stringify({ t: 'move', x, z, ry, moving }))
  }

  /** Ask the server what each way of getting to a spot would cost. */
  requestQuote(x: number, z: number) {
    this.quote = null
    this.sendJson({ t: 'quote', x, z })
  }

  sendTravel(x: number, z: number, mode: string) {
    this.sendJson({ t: 'travel', x, z, mode })
  }

  /**
   * Keep the GPS route fresh. Call often (the minimap does, 10 times a second): it only asks the
   * server when the target changes, you switch between walking and driving, you wander more than
   * 25 m off the line, or every 6 s while moving.
   */
  updateGps(target: { x: number; z: number } | null) {
    if (!target) {
      this.gps = null
      this.gpsAsk.tx = Infinity
      return
    }
    const now = Date.now()
    const a = this.gpsAsk
    const drive = Boolean(this.myVehicle)
    const moved = Math.hypot(this.me.x - a.x, this.me.z - a.z)
    const newTarget = Math.hypot(target.x - a.tx, target.z - a.tz) > 2
    const off = this.gps?.ok ? offRoute(this.gps.pts, this.me) > 25 : false
    const due = (newTarget || drive !== a.drive || off || (moved > 20 && now - a.at > 6000)) && now - a.at > 900
    if (!due) return
    this.gpsAsk = { x: this.me.x, z: this.me.z, tx: target.x, tz: target.z, at: now, drive }
    this.sendJson({ t: 'route', x: target.x, z: target.z })
  }

  private sendJson(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  sendCollege() {
    this.sendJson({ t: 'college', action: 'lecture' })
  }

  sendWork(placeId: string) {
    this.sendJson({ t: 'work', placeId })
  }

  sendQuit() {
    this.sendJson({ t: 'quit' })
  }

  sendBuy(item: string) {
    this.sendJson({ t: 'buy', item })
  }

  sendHub(action: 'gig' | 'study' | 'pitch') {
    this.sendJson({ t: 'hub', action })
  }

  sendChooseHome(tier: string) {
    this.sendJson({ t: 'choosehome', tier })
  }

  /** Opens the phone on an app (or its home screen). Opening the same app again closes it. */
  openPhone(app: PhoneApp = 'home') {
    this.phone = this.phone === app ? null : app
    this.bumpGame()
  }

  showApp(app: PhoneApp) {
    this.phone = app
    this.bumpGame()
  }

  openMap(open = !this.mapOpen) {
    this.mapOpen = open
    if (open) this.phone = null // the full map replaces the phone
    this.bumpGame()
  }

  closePhone() {
    if (!this.phone) return
    this.phone = null
    this.bumpGame()
  }

  setWaypoint(waypoint: Waypoint | null) {
    this.waypoint = waypoint
    this.bumpGame()
  }

  get myName() {
    return protagonistById(this.heroId ?? this.joinInfo.protagonist)?.name ?? 'You'
  }

  sendMoveHome(tier: string) {
    this.sendJson({ t: 'movehome', tier })
  }

  /** Called every frame by the player; only notifies React when it changes. */
  setNearPlace(id: string | null) {
    if (id === this.nearPlaceId) return
    this.nearPlaceId = id

    // Walking away from the shop or lettings office closes its menu
    const place = this.config?.places.find((p) => p.id === id)
    if (this.menu && place?.kind !== this.menu) this.menu = null

    this.bumpGame()
  }

  /** A place or a person by id: where a mission or waypoint points. */
  findTarget(id: string | null | undefined): { id: string; name: string; x: number; z: number } | null {
    if (!id) return null
    const place = this.config?.places.find((p) => p.id === id)
    if (place) return { id: place.id, name: place.name, x: place.x, z: place.z }
    const npc = this.config?.npcs?.find((n) => n.id === id)
    return npc ? { id: npc.id, name: npc.name, x: npc.x, z: npc.z } : null
  }

  // ---- People (v42) ----
  private applyPeds(list: [string, number, number, number, number, number][] | undefined) {
    if (!list) return
    const at = performance.now()
    let changed = false
    const ids = new Set<string>()
    for (const [id, x, z, h, s, look] of list) {
      if (!this.peds.has(id)) changed = true
      this.peds.set(id, { x, z, h, s, look, at })
      ids.add(id)
    }
    for (const id of [...this.peds.keys()]) {
      if (!ids.has(id)) {
        this.peds.delete(id)
        changed = true
      }
    }
    if (changed) this.bumpGame() // so people appear and vanish
  }

  // ---- Cars ----
  private applyVehicles(list: Omit<VehicleState, 'at'>[] | undefined) {
    if (!list) return
    const at = performance.now()
    const before = [...this.vehicles.keys()].sort().join(',')
    const ids = new Set<string>()
    for (const v of list) {
      this.vehicles.set(v.id, { ...v, at })
      ids.add(v.id)
    }
    // Police cars come and go
    for (const id of [...this.vehicles.keys()]) {
      if (!ids.has(id)) {
        this.vehicles.delete(id)
        this.vehiclePose.delete(id)
      }
    }
    if ([...this.vehicles.keys()].sort().join(',') !== before) this.bumpGame() // so the car meshes appear and vanish
  }

  setNearVehicle(id: string | null) {
    if (id === this.nearVehicleId) return
    this.nearVehicleId = id
    this.bumpGame()
  }

  enterVehicle(id: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'enter', vehicle: id }))
  }

  exitVehicle() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'exit' }))
  }

  /** Switch to another protagonist (the server checks you're allowed). */
  switchTo(id: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'switch', to: id }))
  }

  /** True while the camera is flying between characters (moves aren't sent; keys do nothing). */
  /** Opens a conversation in Messages and marks it read. */
  openThread(from: string | null) {
    this.thread = from
    this.phone = 'messages'
    if (from && this.texts.some((t) => t.from === from && !t.read)) {
      for (const t of this.texts) if (t.from === from) t.read = true
      this.sendJson({ t: 'textsRead', from })
    }
    this.bumpGame()
  }

  get unreadTexts() {
    return this.texts.filter((t) => !t.read).length
  }

  /** Name for a contact id. */
  contactName(id: string) {
    return this.contacts.find((c) => c.id === id)?.name ?? id
  }

  /** Play a cut-scene in this browser only (a dev replay: the server isn't waiting for it). */
  playScene(id: string) {
    this.scene = { id, at: performance.now() }
    this.bumpGame()
  }

  /** The scene finished or was skipped: tell the server, and hand the camera back. */
  endScene() {
    const scene = this.scene
    if (!scene) return
    this.scene = null
    this.sceneActor = null
    this.runChangedAt = performance.now() // show the objective again now the HUD is back
    this.sendJson({ t: 'sceneDone', id: scene.id })
    this.bumpGame()
  }

  /** A failed mission: try again from the last checkpoint, or give up (v50). */
  retryMission() {
    this.sendJson({ t: 'missionRetry' })
  }

  quitMission() {
    this.sendJson({ t: 'missionQuit' })
  }

  /** Knocked over, wasted or busted right now: no moving. */
  get isDown() {
    return Boolean(this.down && performance.now() < this.down.until)
  }

  get switching() {
    const p = this.placed
    return Boolean(p && !p.instant && performance.now() - p.at < SWITCH_MS)
  }

  /** Sound your horn (heard here at once, and by everyone nearby through the server). */
  sendHorn() {
    if (!this.myVehicle) return
    horn(1)
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'horn' }))
  }

  /** What the driver is holding. Sent when it changes, and every 100 ms so the server knows we are still there. */
  sendDrive(throttle: number, steer: number, brake: boolean) {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    const d = this.lastDrive
    if (throttle === d.t && steer === d.s && brake === d.b && now - d.at < 100) return
    this.lastDrive = { t: throttle, s: steer, b: brake, at: now }
    ws.send(JSON.stringify({ t: 'drive', throttle, steer, brake }))
  }

  /** Keeps `me` (used by the minimap, waypoints and prompts) up to date while a car is carrying you. */
  noteMe(x: number, z: number, ry: number) {
    this.me = { x, z, ry }
    if (this.waypoint && Math.hypot(this.waypoint.x - x, this.waypoint.z - z) < 4) {
      this.waypoint = null
      this.bumpGame()
    }
  }

  setNearNpc(id: string | null) {
    if (id === this.nearNpcId) return
    this.nearNpcId = id
    // Walking away from someone ends the conversation
    if (!id && this.dialogue) this.endTalk()
    this.bumpGame()
  }

  talk(npc: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'talk', npc }))
  }

  choose(i: number) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'choose', i }))
  }

  endTalk() {
    if (!this.dialogue) return
    this.dialogue = null
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'endtalk' }))
    this.bumpGame()
  }

  /** E at the shop or lettings office opens or closes its menu. */
  toggleMenu(kind: 'shop' | 'lettings' | 'hub' | 'college') {
    this.menu = this.menu === kind ? null : kind
    this.bumpGame()
  }

  closeMenu() {
    if (!this.menu) return
    this.menu = null
    this.bumpGame()
  }

  dismissStatement() {
    this.statement = null
    this.bumpGame()
  }

  showToast(text: string, good: boolean) {
    this.toast = { text, good, at: Date.now() }
    setTimeout(() => this.bumpGame(), 3200)
    this.bumpGame()
  }

  private applyShift(msg: any) {
    if (msg.state === 'started') {
      this.shift = { placeId: msg.placeId, startedAt: performance.now(), seconds: msg.seconds, label: msg.label }
      this.menu = null // keep the progress bar clear
    } else {
      this.shift = null
      if (msg.state === 'cancelled') this.showToast(String(msg.reason ?? 'Shift cancelled'), false)
    }
    this.bumpGame()
  }

  private bumpGame() {
    this.gameVersion++
    this.listeners.forEach((listener) => listener())
  }

  sendChat(text: string) {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ t: 'chat', text }))
  }

  // ---- Incoming ----
  private applyChat(message: ChatMessage) {
    this.chatLog.push({
      id: message.id,
      name: String(message.name),
      text: String(message.text),
      at: message.at,
    })
    if (this.chatLog.length > MAX_LOG) this.chatLog.shift()

    if (message.id) {
      const until = Date.now() + BUBBLE_MS
      this.bubbles.set(message.id, { text: String(message.text), until })

      // Wake listeners again when this bubble should disappear
      setTimeout(() => this.bumpChat(), BUBBLE_MS + 50)
    }

    this.bumpChat()
  }

  private bumpChat() {
    this.chatVersion++
    this.listeners.forEach((listener) => listener())
  }

  private applyState(players: RemotePlayerState[]) {
    const seen = new Set<string>()

    for (const p of players) {
      if (p.id === this.myId) {
        const veh = p.veh ?? null
        if (veh !== this.myVehicle) {
          // Got out of a car: the server chose where you stand, so go there
          if (!veh) this.arrival = { n: this.arrival.n + 1, x: p.x, z: p.z }
          this.myVehicle = veh
          this.nearVehicleId = null
          this.lastDrive = { t: 0, s: 0, b: false, at: 0 }
          this.bumpGame()
        }
        continue
      }
      seen.add(p.id)
      this.remotes.set(p.id, p)
    }

    for (const id of this.remotes.keys()) {
      if (!seen.has(id)) this.remotes.delete(id)
    }

    this.refresh()
  }

  private reset(status: Status) {
    this.remotes.clear()
    this.vehicles.clear()
    this.vehiclePose.clear()
    this.peds.clear()
    this.myVehicle = null
    this.nearVehicleId = null
    this.wanted = { level: 0, searching: false }
    this.shift = null
    this.journey = null
    this.menu = null
    this.bubbles.clear()
    this.dialogue = null
    this.myId = null
    this.lastMoving = false
    this.status = status
    this.refresh(true)
  }

  private setStatus(status: Status) {
    this.status = status
    this.refresh(true)
  }

  private refresh(force = false) {
    const idsKey = [...this.remotes.keys()].sort().join(',')
    const summary = `${this.status}|${this.remotes.size}`
    const changed = idsKey !== this.idsKey || summary !== this.summary

    this.idsKey = idsKey
    this.summary = summary

    if (changed || force) this.listeners.forEach((listener) => listener())
  }
}

export function getServerUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined
  if (configured) return configured

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${location.hostname}:2567`
}

export function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

/**
 * Testing with two tabs in ONE browser: open the second tab with ?as=2
 * (e.g. http://localhost:5173/?as=2). Each "slot" is a separate player with its own wallet,
 * because tabs in the same browser otherwise share one saved identity.
 */
export const SLOT = (() => {
  try {
    const raw = new URLSearchParams(location.search).get('as') ?? ''
    return raw.replace(/[^a-z0-9]/gi, '').slice(0, 12)
  } catch {
    return ''
  }
})()

export const storageKey = (name: string) => (SLOT ? `${name}-${SLOT}` : name)

// A random secret kept in this browser. It is how the server recognises your wallet.
// (Prototype only: real accounts, e.g. Supabase auth, replace this later.)
function getToken(): string {
  try {
    const key = storageKey('britlife-token')
    let token = localStorage.getItem(key)
    if (!token) {
      token = crypto.randomUUID() + crypto.randomUUID()
      localStorage.setItem(key, token)
    }
    return token
  } catch {
    return crypto.randomUUID() + crypto.randomUUID()
  }
}

/** How far a point is from a polyline (metres). */
export function offRoute(pts: [number, number][], p: { x: number; z: number }): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const l = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l))
    best = Math.min(best, Math.hypot(p.x - ax - t * dx, p.z - az - t * dz))
  }
  return best
}

/** The rest of the route from where you are: your position, then every point still ahead. */
export function routeAhead(pts: [number, number][], p: { x: number; z: number }): { pts: [number, number][]; length: number } {
  if (pts.length < 2) return { pts: [[p.x, p.z], ...pts], length: pts.length ? Math.hypot(pts[0][0] - p.x, pts[0][1] - p.z) : 0 }
  let seg = 0
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const l = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l))
    const d = Math.hypot(p.x - ax - t * dx, p.z - az - t * dz)
    if (d < best) { best = d; seg = i }
  }
  const out: [number, number][] = [[p.x, p.z], ...pts.slice(seg + 1)]
  let length = 0
  for (let i = 1; i < out.length; i++) length += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])
  return { pts: out, length }
}

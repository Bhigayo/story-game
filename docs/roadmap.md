# Roadmap

## Structure decision: gradual separation
- This project stays intact and becomes the home of the story game (crime drama, see docs/story-bible.md). It is the priority (about 80% of effort).
- The hustle / life-sim game is a second product, kept separate in design and later in code. It gets about 20% of effort and its own roadmap.
- Shared tech (characters, networking, world engine, economy, UI) is extracted only when it has proved stable. No big refactor first.
- Each game keeps its own accounts, saves, economy settings and world state. Shared code must not share live player data.
- Before any big change: keep a copy of the working project folder as `brit-life-baseline`.

## Story game: done
XP, levels and server-side story state per wallet (v20) · NPCs and dialogue with server validation (v21) · story missions and chapter unlock (v22).

## Current phase: build the city first (Digbeth)
Decision: before more missions, make Digbeth a place worth playing in. Order:
1. **Data** (done): bigger Digbeth file (buildings, canal, rail, rivers, parks, land use).
2. **Road graph** (done, `server/roads.mjs`): drivable roads, one-ways, route-finder. Police use it.
3. **Traffic (done, v33)**: cars on the road graph near each player, driving on the left, slowing for corners and obstacles. **Traffic lights and junction rules (done, v34, `server/signals.mjs`)**: 48 lit junctions found from the road graph (main roads, 3+ arms), UK cycle (green, amber, all-red), cars stop at red and at amber when they can, give way coming out of minor roads, police ignore lights; drawn by `src/world/TrafficSignals.tsx` from the server clock. Tested headless: 0 red-light runs at six busy junctions, flow about 19% slower than all-green, no gridlock. Still to do: pedestrians on the graph, hitting people and cars with consequences, stealing traffic cars, pedestrian crossings on the green man.
4. **Draw the rest of the data (done, v30)**: canal and river water, rail and viaducts, parks, ground by land use. Water blocking done (v31, bridges exempt). Still to do: trees in parks, arches under viaducts.
5. **Landmarks (done, v35, `src/world/Landmarks.tsx`)**: the Rotunda (always drawn, ignores fog, lit crown, so it sits on the skyline from Digbeth), the Custard Factory (painted sign facing Gibb Street, chimney, murals), Birmingham Coach Station in National Express West Midlands House (glass, canopy and sign facing Digbeth), The Old Crown (timber frame, gable roof, hanging sign, est. 1368) and the Warwick Bar stop lock by Fazeley Street. Each replaces its OSM building on the same footprint, so collisions are unchanged. Still to do: Digbeth High Street dressing (shopfronts, banners), Moor Street station, St Martin's, map pins for landmarks.
6. **Streetscape and map polish**: GPS line done (v36): the server routes along roads (`route` message; walking ignores one-ways, driving respects them) and the minimap and full map draw it in gold with the real road distance; dashed straight line where there's no road route (the centre isn't joined to Digbeth's road graph yet). Stop lines at all lit junctions done (v36). Still to do: shopfronts, more lights, district names, joining the centre's roads to Digbeth's.
7. **Performance**: draw only what is near the player.
Then back to the story build order below.

## Before the story: the plan (written v36)
Goal: a city that feels like a game world (GTA-style), with the systems missions will need, and none
of the life-sim leftovers. In order; each step ends in a tested build.

### A. Clear out (done, v37) — moved to `archive/life-sim/`
Done: the server no longer runs hunger, rent, statements, shifts, college or the Hub; a player's save is now a
wallet (`server/wallet.mjs`: cash, missions, reputation). Missions are the five Act 1 ones. The HUD shows cash
(`CashUI.tsx`) and one gold objective marker (`ObjectiveMarker.tsx`) instead of rings at every venue; E only
talks and gets in cars; the phone lost the Jobs app, the Bank is a balance, the Wiki explains the story game.
`npm run build` passes again. Still to do: rewrite `README.md`; trim the old tables in `config.mjs`.

The original plan:
The life-sim pieces belong to the hustle game (`sims-game`). Copy anything worth keeping there first,
keep a baseline copy, then take them out of the story game:
- HUD and systems: hunger, rent and arrears, monthly statements, payslips and tax, "Friend's sofa" /
  lettings homes, job shifts, college, the Hustle Hub (`EconomyUI`, `JobsUI` place shifts, `server/economy.mjs`,
  `career.mjs`, `college.mjs`, `hub.mjs`, homes in `config.mjs`).
- Life-sim missions: "A proper working week", "Dream: Top Floor Living", dreams in general.
- Unused files: `CharacterCreator.tsx`, `LuckyDraw.tsx`, `LifeSetup.tsx`, `HomePicker.tsx`, the five test GLBs
  (already gitignored), the Vite template `README.md` (rewrite it for this game).
- Keep: wallet cash (heists pay out), the bank as a balance only, chat, multiplayer, police, vehicles.
- Decide: buses and taxis (`TravelUI`): keep as fast travel for now, real buses later.

### B. A complete city
1. **Done (v38).** Join the city centre's roads to Digbeth's road graph. The gap was real: the Moor Street
   Queensway bus gate (buses and taxis only) and the A38 underpasses were the only links. Now bus-only
   roads are in the graph as `bus` edges (very slow, so they're used only when there's no other way), and
   main-road underpasses as `tunnel` edges that only AI traffic uses: it's hidden underground and can't hit
   the buildings above. Police and the GPS stay on the surface; where one-ways leave no legal surface route,
   the GPS shows the shortest way instead. One network of 2,680 nodes from Colmore Row to east of Digbeth;
   50 lit junctions. Still separate: a small estate east of Digbeth (164 nodes) and a few car parks.
2. Performance (roadmap step 7). **First pass done (v39)**: measured on the laptop at 29-35 fps with 1,300 draw calls.
   Buildings and streets are now merged into 160 m blocks (`src/world/CityChunks.tsx`: about nine draw calls a
   block, colours as vertex/instance colours, all of a block's shop signs on one sheet); street furniture,
   pedestrians and cars are instanced per part; viaduct piers are one call per viaduct. Headless measurement:
   Digbeth 1,300 -> 326 draw calls, centre 1,100 -> 217, same picture. The ` key (or ?perf) shows fps, draw calls
   and triangles. **Automatic resolution (v40)**: under 50 fps the game renders smaller (down to 60%) and climbs
   back when there's headroom; `?res=0.75` fixes it. On the laptop: 29-35 fps -> 40 (v39) -> 53 at 90% size (v40).
   Still to try if needed: shadows only near the player, simpler far blocks, merging land areas.
3. Windows and facades: mixed lit/dark windows, varied warm tones, darker glass.
4. **Streetscape (done, v41)**: shopfronts on every shop/pub/cafe/bar building (real OSM names) and on the
   high streets (Digbeth, High Street Deritend, Hurst Street, Corporation Street, New Street...): stall riser,
   warm-lit window with glazing bars (or a roller shutter), glazed door, lit fascia, awnings on food places;
   unnamed high-street units get invented names (no real businesses). Doors and signs now go on the wall
   that faces a street (and signs face outward: half used to face into the building). Bus stops every ~250 m
   on main roads with a flag and a bin; bins every 45 m on high streets; area banner ("DIGBETH",
   "DERITEND", "BULLRING", "CHINATOWN"...) from 12 real area centres (`src/DistrictBanner.tsx`).
   The map files have no point data (shop pins, bus stops): an Overpass export of those would make stops real.
5. **Pedestrians (done, v42, `server/pedestrians.mjs`)**: people now live on the server like the traffic, so every
   player sees the same ones. ~28 around each player walk the pavements of the road network (road widths from
   `server/roadwidth.mjs`, the same rules as the client), turn corners at junctions, and sometimes cross: at
   traffic lights they wait for the road they're crossing to be on red (the green man), elsewhere for a gap.
   Traffic gives them a wide berth and stops for them; a car coming at them makes them jump clear after a
   0.2-0.7 s reaction; a car over ~10 mph that hits them knocks them down for 14 s. If a player was driving:
   +22 heat (+40 if fast) and "Witnesses are calling the police". Headless: 5 min, ~70 crossings, no AI hits.
   Still to do: pedestrian-only streets (New Street, High Street, Hurst Street aren't in the road graph), people
   reacting to gunfire/police, injured people calling an ambulance.

**B is done.** Next: C (driving and the police).

### C. Driving and the police
6. **Done (v43)**: carjacking: E by a traffic car going under ~8 mph drags the driver out (they run off and
   rejoin the pavements), the car is yours, +35 heat (two stars). Traffic is now cars, white/coloured vans and
   black cabs (lit TAXI sign); every occupied vehicle shows a driver on the right through tinted glass (cars
   have window pillars now). Engine note and two-tone horn made with Web Audio (`src/carSounds.ts`,
   `src/CarAudio.tsx`): H honks, other players hear it by distance, and traffic stuck behind you honks after
   2.5 s. Abandoned stolen cars are cleared after 2 minutes with nobody near. Objective star is now bright gold.
   Still to do: buses (12 m: own collision shape, wide turns, real routes past the bus stops), seated player
   model (the stand-in driver is used for everyone).
7. **Done (v44)**: every vehicle has health (100). Hits over ~7 mph cost health by impact speed (a 45 mph
   head-on: ~75); hits over ~18 mph spin the car for half a second. Below 60 the engine is tired, below 30
   it limps (top speed 60%), at 0 it's a wreck: dead engine, charred, lights out, black smoke. Paint dulls with
   damage; grey/dark/black smoke from the bonnet (`src/world/Smoke.tsx`, one draw call); crunch sound; a
   condition bar under the speedo. Wrecked traffic: the driver climbs out and runs; wrecked police units are
   replaced; wrecks are cleared 90 s after everyone leaves. Hitting people raises heat (since v42).
   Dev: `{t:'dev', cmd:'damage'}` with DEV_TOOLS=1. Still to do: repairs (a garage / respray that also loses
   the police), fire, real dents.
8. **Done (v45)**: police patrol cars in the traffic (~1 in 14, lights off); when you become wanted a nearby
   patrol joins the chase before a new car is sent. Police pull up near you on foot and officers get out
   (hi-vis jackets; two per car from three stars) and chase at 4.7 m/s (you run at 5); an arrest on foot needs an
   officer's hand on you for a second. Get in a car and they run back to theirs. New crimes, judged ten times
   a second: a red light (+12) or speeding past (+10) only if a police car can see it; ramming a car (+10)
   if they see it; ramming a police car (+30) or running an officer down (+30) always. Each has a cool-down.
   Sim: standing still, busted 1.5 s after the officers get out; running, you get away. Dev: `window.__client`
   in dev builds only.

**C is done.** Next: D (player, animation, camera, sound, day and night).

### D. Player and presentation
9. Licensed protagonist models to replace the Telegram ones (see CREDITS.md), with outfits.
10. Animations: run, enter and exit car, sit.
11. **Done (v46)**: the camera knows every building's real height (25 m grid), so it only pulls in for what's
    actually between you and it, and ignores the canal. Talking to someone swings it to a side-on two-shot
    (the side with room), framed above the conversation panel.
12. **Done (v46)**: `src/Ambience.tsx`, all Web Audio, no files: a city hum, traffic noise from the moving cars
    near you (by speed and distance), a rain hiss, and footsteps (splashier in the wet). Starts on the first
    key or click (browser rule).
13. **Done (v46)**: `src/world/daylight.ts`. The hour and the weather come from the server's clock, so every
    player shares them; a day is 48 real minutes (starts at 7 pm). Keyframes for night, dawn, day, golden hour
    and dusk set the sun/moon, sky (with stars), fog and ambient light; windows, shop fronts, street lamps and
    headlights glow after dark. Rain: about a third of the time, easing in and out; streaks round the camera,
    greyer sky, fog closes in, and the roads go glossy and stay wet for a while after. Dev: ?hour=22, ?rain=1,
    ?day=4 (minutes per day).
14. HUD redesign (style guide phase 2): story HUD only: minimap, cash, wanted level, health, objective.

### E. What missions need
**Decided (23 Nov): single-player, with protagonists you switch between, GTA V-style.** No shared public world.
- E0. **A world per player.** Every connection gets its own city (traffic, people, police, clock, weather), so
  the story can change the city for good. The server keeps running the world as now, just one copy per
  player. Later: run that same world code inside the browser (a Web Worker), so the game becomes a plain website
  (GitHub Pages, no server to pay for) with saves in the browser.
- E0b. **Protagonist switching (done, v47).** Three protagonists (`docs/story-bible.md`): Jordan Hayes,
  Maya Rahman, Adrian Vale. Tab opens the switch wheel (1/2/3 or click); the camera rises 150 m over the
  old one, crosses the city and drops to the new one (2.9 s). Each keeps their own place (saved on switch
  and on quitting) and cash (Jordan: your balance, Maya £120, Adrian £900). Not while wanted; if driving, you
  get out and the car stays. No choosing screen: a new game starts as Jordan. Busted now really moves you
  (to your character's home) instead of the server and the browser disagreeing.
  Still to do: lock Maya/Adrian until Act I missions 3/4 (`story.locked`); each character's own missions and
  wanted level; the others doing something in character when you're not them; Adrian's own model.
- E0c. **Real characters: Jordan first (v48).** Jordan is a Quaternius Universal Base Character (CC0) with the
  buzzed hairstyle, skin and hair tinted from `protagonists.ts`, 306 KB. All animation comes from ONE shared file,
  `public/models/cast/anims.glb` (Quaternius Universal Animation Library, CC0, 26 clips, 470 KB): idle, walk,
  jog, sprint, drive, talk, sit, punches, hits, death, jumps, roll, crouch, pistol, pickup, push. Any character
  built on the same skeleton gets all of them for free. On foot you jog (5 m/s), Shift sprints (7.5), C toggles
  walking (1.4); each gait plays at the rate that matches the ground covered, and footsteps follow the stride.
  How to build a character: `docs/characters.md`. Then Maya (female body, long hair, 523 KB) and Adrian (male
  body, side parting, 310 KB) the same way, so all three protagonists are real models. In a conversation you
  turn to face the person and use the talking animation. Still to do: clothes (the free bodies are in
  underwear); the driver showing in the car (drive clip, needs a seat position per vehicle and see-through
  windows); sit/punch/hit once there is something that uses them. Spare looks already tested: Maya with buns,
  Adrian with a beard.
- E0 note: one server is one player's world for now (fine for single player while developing). Running the
  world in the browser comes later.
15. **Health, damage and respawn (done, v49).** 100 health per character (kept on switching and quitting), a bar
  under your cash (amber under 50, red and pulsing under 25) and a red flash when hurt. A car hitting you on foot
  costs 15 at 4.5 m/s up to all of it at 18 m/s and knocks you over for 1.4 s; a hard crash at the wheel (impact
  over 8 m/s) hurts the driver. It comes back at 2 a second once nothing has hurt you for 10 s. At 0: WASTED
  (screen goes grey, you fall), the police drop it, a £100 hospital bill (or what you have), and you wake outside
  the nearest hospital (Steelhouse Lane Hospital, Westside Hospital: invented names on real hospital buildings).
  BUSTED now holds you for 4 s and releases you from the nearest police station (Lloyd House, Digbeth). All in
  `server/health.mjs`. Dev: `{t:'dev', cmd:'hurt', value}` and `cmd:'bust'`. Still to do: hospital and police
  icons on the map; officers or others that can hurt you (weapons come with the story).
16. **Mission framework (done, v50).** Missions are data (`server/missions.mjs`, format at the top) played by
  `server/runner.mjs`: a start (by itself, or a yellow marker you walk into), steps one at a time (goto, car,
  drive, talk, flag, wait, lose the police), checkpoints, step timers, "stay here" areas. Fails: died, busted,
  the mission car wrecked, out of time, left the area; MISSION FAILED with R retry (from the checkpoint, put back
  in place) or Q quit (the marker waits till you've walked away). Passing pays out and can set flags, unlock a
  character or open the next act. Each mission belongs to one character; no switching mid-mission. On screen:
  the title as it starts, the objective bottom centre for 7 s, the tracker top left with a timer, the gold
  star and GPS on the current target. The five Act 1 missions were rewritten in it; the last one is now a
  real lookout job (get to the lane in 90 s, hold your post 20 s, then find out what happened).
  Still to do: follow/chase steps, carrying items, mission-only cars and people, phone texts to start them (17).
16b. **Cut-scenes (done, v51; decided 23 Nov).** Scenes are scripts in `src/cutscenes/scenes.ts` (camera shots that
  glide between two points, the protagonist's walks, turns and talk pose, subtitles, phone texts, a place caption,
  fades), played by `src/cutscenes/Cutscene.tsx`: black bars, HUD hidden, Space/Enter/Esc to skip. A mission's
  `intro`/`outro` (and `startAt`) in `server/missions.mjs` plays them; the server waits for the browser to say
  it's finished. First scene: `arrival`, Jordan off the coach at Digbeth Coach Station (mission 1, now "No Fixed
  Address", as in the story bible). Still to do: other characters acting in scenes (NPCs walking, gesturing),
  cars in scenes, sound. The original plan: In the game engine, not video: the real city, cast and animations,
  run by a short script per scene (a timeline of camera moves, who walks where, which clip plays, subtitles,
  fades). Black bars, HUD hidden, a key to skip. Mostly 15–60 s at the start and end of missions; longer only
  for act changes and the six big decisions. The models have no lip-sync or faces that move, so scenes are shot
  around it: over-the-shoulder and wide shots, body language (talk, turn, sit, push), strong subtitles, mood
  from day/night and rain; recorded voice lines maybe later. Built after 16 (missions start and end them);
  the first real one is the intro to Act I mission 1 (Jordan at the coach station).
17. **Phone texts and contacts (done, v52).** Missions text you (`texts` in `server/missions.mjs`: when a mission
  opens, as it starts, or when you pass it); a text about an open mission has **Set GPS** to its marker. New texts
  pop up above the minimap with a buzz (click to read) and badge the phone; Messages has a conversation per person,
  Contacts lists who this character knows (Jordan starts with Leon and Daze; people join once you've met them).
  Per character, saved with the story (`server/phone.mjs`). Act 1 is now chained by Leon's texts, and Daze makes
  his first move after mission 3. Also: recorded voice lines for cut-scenes (`voice` on a line, files in
  `public/audio/voice/`, script and how-to in `docs/voice-script.md`). Still to do: calls, replying, texts from
  the other characters' storylines.
18. Save everything per wallet: position, car, cash, story state.
19. Minimal safehouse (story step 5): door, room, bed to save, stash.
Then: story build order step 4 (the first heist) and Act 1.

## Story game: new build order (direction changed to crime drama)
1. **Rewrite Act 1 missions (done, v24).** Leon opening, Small Favour, the night it goes wrong. Data and dialogue only.
2. **Driving and vehicle sync (prototype done, v26).** Six server-owned cars, enter/exit, chase camera, speedometer, building collisions. Still to do: hit pedestrians and players, a seated driver animation, engine sounds, steering assists, car persistence, traffic.
3. **Police and heat (prototype done, v27).** Theft raises heat, police cars chase, arrest and fine, lose them by getting out of sight. Still to do: a road graph so cars stop jamming on Digbeth corners, police on foot, heat from heist crimes.
4. **First playable heist** (Meridian site-office safe). Planning board, crew roles, approach choice, escape.
5. **Minimal home.** Door, one furnished room, bed, fridge, stash, saved state.
6. **Relationships and decisions D1 to D6**, then Act 2 and 3 content.
7. **Combat (light), cinematic presentation, endings.**
Each step ends in a tested zip.

## Hustle game (separate product)
Open question: Birmingham hustle sim, or a different city. Needs its own name; "Lagos Life" belongs to someone else.

## Naming
Both games need new names. Shortlists: story game Foundry Yard / Room to Make It / Brummagem; hustle game Graft. Check UK IPO, Companies House, Steam, App Store and domains before committing. A Birmingham-set game called "God Save Birmingham" already exists, so avoid "Birmingham" in a title. Rename UI strings, docs and `package.json` once chosen.

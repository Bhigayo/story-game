# BRIT LIFE: venues roadmap

**Idea:** every named building on the map is a destination, and every destination has a purpose.
The map already shows them. Buildings marked OPEN work today; the rest say COMING SOON.

## How a venue works (the plan)
- Where: `CATEGORIES` in `src/world/geo.ts` maps OpenStreetMap tags (nightclub, pub, college...) to a venue category and teaser text.
- What it does: each category gets a list of **activities** defined on the SERVER (like missions), so outcomes can't be faked.
- Turning one on: add the activity on the server, add the place to `PLACES` (server/config.mjs) so it gets a ring and "Press E", and the map shows it as OPEN.
- Missions can point at any venue ("Pitch at the Greenhouse", "Study at South & City College").

## Live today
- **The Greenhouse (Hustle Hub):** freelance gigs (2 a week, cash in hand), coding courses (1 a day), pitching to investors (every 14 game days; odds from coding and hustle skill plus traits; big payout). Rules live in `server/hub.mjs`; the numbers are in `HUB` at the top of that file.
- Rhubarb and Heath Mill Studios are also tagged as hubs. To open them, add a `hub` place for each in `PLACES`.
- Gig income is untaxed, which is realistic up to the UK £1,000 trading allowance. If you want it taxed later, run it through the payslip.

## Venue ideas (from the Lagos Life brief, in Brum flavour)
| Category | Buildings today | Activities |
|---|---|---|
| Hustle hub (CcHub-style) | The Greenhouse, Rhubarb, Heath Mill Studios | Hustle for money; pitch to investors (skill + luck, big payout, cooldown); level up coding; meet other players |
| Money & cash | MG International Money Transfer, The Old Bank | Send money; risky ATM hack: payout vs chance of arrest |
| Club | Air, Birdies, Roxy Ballroom, Golf Fang | Party, spray money, meet players, night-time only |
| Pub & bar | The Old Crown, Diamond | Social spots, hangouts |
| Market | Red Brick Market | Buy and sell goods, haggle |
| College | South & City College (+ Annexe) | Study to level skills (coding, music, hustle) |
| Food | Deritend Fish and Chips, The Best Baguette, Eastside Stores | Cheap meals; shifts |
| Garage / Workshop | Platinum, Archway, B&K Fabrications, Ashton Engineering | Jobs; vehicles later |
| Airport | (not in Digbeth) | Travel between cities |

## Crime (ATM hack) rules to decide before building
- All odds are rolled on the server; skill level and trait raise the odds.
- Caught = fine + a few minutes "in custody" (cannot move or work) + reputation loss. Not caught = money into the account.
- The expected payout must stay below honest work over the same time, or everyone will do it. Tune it against shift pay (about £110 to £125 a shift).
- Keep it clearly fictional and cartoonish. No real banks or real techniques.

## Skills
Add `skills` to the profile (coding, hustle, music...) with levels. Traits and dreams already exist, so "Tech Bro" or a "Yaba Unicorn" style dream can plug straight in.

## Expanding the world
- Add one `.geojson` per district (Bullring, City Centre, Selfridges, BCU, Aston) to `public/data/` and list it in `DISTRICT_FILES` in `src/world/geo.ts`.
- IMPORTANT: every district must be exported relative to the SAME centre point (`CENTRE_LON` / `CENTRE_LAT` in geo.ts), so they tile together. If a district is exported with its own centre, shift it with an offset.
- The map, minimap and venue list pick up new districts automatically. The 3D world loads them in `DigbethMap.tsx` (rename to `WorldMap` when there is more than one).
- Later: districts stream in as you walk near them, and the airport/bus/train fast-travel between them.

## Getting around (live since v9)
Pick any place on the full map (M) and the card lists every way of getting there, priced by the server.
- Walk: free, sets the gold waypoint.
- NX bus: £2.90 single, capped at £3. Free while your Swift bus pass is active (it lapses if you are in arrears).
- Tram: Metro Zone 1 £2.50, Zone 1-2 £3.50 (2026 fares).
- Train: estimate, £2.40 plus 28p per km.
- Uber: estimate, £3.20 + 70p/km + 16p/min, £5 minimum, with surge (x1.3 or x1.7) that changes each minute.
A public mode only appears when there is a stop near both ends and it beats walking. Uber needs 200 m or more.
Rides charge on departure, show an "on your way" screen, hide you from other players, and drop you at the destination.
Not-yet-built places (Bullring, City Centre, BCU, Aston, Airport) show fares as a preview but cannot be travelled to.
Rules live in `server/transport.mjs`; fare constants are in `FARES` at the top. Unverified numbers are marked ESTIMATE there.
Next: build a second district so the bus, tram and train become real choices.

## City Centre (live since v11)
Needs `public/data/centre.geojson`. Without it none of this appears and the game runs as before.
- Jobs: Primark (Retail Assistant) and Costa (Barista), paid like other shifts. Count towards "Shop floor".
- Shop: Select & Save, about 15% dearer than the Corner Shop.
- College: BCU International College. One lecture a day, +15 education XP. Each level adds 2% to every shift.
- Stations: Moor Street and New Street use the real station buildings from the map.
- Missions: Into town, Shop floor, First lecture, Keen student.
- Selfridges is not tagged separately in the map data, so it is part of the Bull Ring building for now.
Positions are in `ALL_PLACES` in `server/config.mjs`. Rings sit on a free spot at the front of each building.

## Careers (live since v12)
Every job has four ranks. Shifts are counted per employer, and a promotion arrives when a shift finishes.
| Rank | Shifts at that job | Education level | Pay |
|---|---|---|---|
| 2 | 8 | 0 | +8% |
| 3 | 20 | 1 | +20% |
| 4 | 40 | 3 | +35% |
Education comes from the college and also adds 2% per level to every shift. Ranks are kept once earned.
Titles live in `server/career.mjs` (`TITLES`), thresholds in `STEPS`. Missions: Move up, Climbing the ladder.

## Look and feel (v13)
Buildings are styled by type in `src/world/buildingStyle.ts`: retail, office, residential, industrial, hotel, civic, parking.
Each has its own colours, window shapes, floor height and typical size. Heights use the map's `height` or `building:levels`,
otherwise a steady random height for that building. Every named building gets a painted sign with its name.
To tweak a look, edit its entry in `STYLES`. To add a type, add to `StyleId`, `STYLES` and `styleOf`.

## Street life (v14)
`src/world/StreetLife.tsx` puts parked cars on side streets and litter bins and benches on pavements, following the real roads.
Only items near the player are drawn. Bus shelters stand on the main roads (`StreetFurniture.tsx`).
Pedestrians (26 at a time) now walk the routes nearest to you, in every district. Numbers: `CROWD` and `RANGE` in `Pedestrians.tsx`.
Not done yet: moving traffic, and collision with cars and furniture.

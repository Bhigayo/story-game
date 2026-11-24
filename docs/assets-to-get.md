# Assets to get (v46)

Three things only you can fetch (they need your accounts): characters, animations and sounds.
Drop everything in `assets-src/` (raw files, never committed or deployed); I'll convert and wire them in.

---

## 1. Characters and animations: Mixamo (free, Adobe account)

mixamo.com. Characters and animations can be used in your own games, commercial ones included.
What you can't do is share the raw files on their own, so `assets-src/` stays out of Git (it's in
.gitignore). Every Mixamo character uses the same skeleton, so **one set of animations works for
every character**. That's what lets us replace the stand-ins and the "balloon" people.

### Characters (Characters tab)

| What for | How many | What to look for |
|---|---|---|
| The protagonists | 2 for now (Jordan, Maya). Wait for the story decision before getting more | Casual streetwear, 20s |
| Main cast: Leon, Aisha, Nia, Raymond, Daniel Mercer | 5 | Leon in a mechanic's overalls or work clothes; Aisha casual; Nia smart; Raymond older; Mercer in a suit |
| Police officer | 1 | Anything in a uniform (we recolour it: black with a hi-vis jacket) |
| Crowd | 6 to 8 | Mixed men and women, ages, builds and clothes. Low-poly is better: they're drawn many times |

Download each character with these settings: **Format: FBX Binary · Pose: T-pose**.
Name the files `char-jordan.fbx`, `char-maya.fbx`, `char-leon.fbx`, `char-crowd-1.fbx` and so on.

### Animations (Animations tab)

Pick ONE character first (any of them), then search for and download each of these.
Settings for every one: **FBX Binary · Skin: Without Skin · 30 fps · Keyframe Reduction: none**.
Tick **In Place** wherever Mixamo offers it (walks and runs). Then the game moves the character and the
animation doesn't, which also cures the walking-backwards problem for good.

| File name | Search Mixamo for | Used for |
|---|---|---|
| `anim-idle.fbx` | Idle (a relaxed one, not a fighting stance) | Standing |
| `anim-idle-look.fbx` | Looking Around | Waiting, bored NPCs |
| `anim-walk.fbx` | Walking (In Place) | Walking |
| `anim-run.fbx` | Running (In Place) | Running |
| `anim-sprint.fbx` | Fast Run (In Place) | Fleeing, chasing |
| `anim-talk-1.fbx` / `anim-talk-2.fbx` | Talking (two different ones) | Conversations |
| `anim-phone.fbx` | Texting, or Talking On Phone | Using the phone |
| `anim-car-enter.fbx` | Entering Car | Getting in |
| `anim-car-exit.fbx` | Exiting Car | Getting out |
| `anim-drive.fbx` | Driving | Seated at the wheel |
| `anim-sit.fbx` | Sitting Idle | Benches, the safehouse |
| `anim-knocked-down.fbx` | Falling Back Death, or Knocked Down | Hit by a car |
| `anim-get-up.fbx` | Getting Up | Getting back up |
| `anim-hands-up.fbx` | Surrender | Busted |
| `anim-kneel.fbx` | Kneeling, or Arrest | Being arrested |
| `anim-dodge.fbx` | Dodging, or Jump Over | Diving out of a car's way |
| `anim-cheer.fbx` | Cheering, or Fist Pump | Mission complete (optional) |

Optional, for later combat: Punching, Body Block, Stunned, Shoved Reaction.

### How the "balloon" people get replaced
- Your character, the cast and police officers near you become the real animated Mixamo models.
- The crowd uses the 6 to 8 crowd characters, with random clothing colours, so 8 models look like dozens of people.
- Drawing many animated people is the expensive part on a laptop. So people close to you (about 40 m)
  are fully animated models, and people further away stay simple shapes. At that distance the shapes
  are a few pixels tall, so you don't notice. If that still looks off, the next step is "baked"
  animation: the walk is stored in a texture so hundreds of people can share one draw call.

---

## 2. Sounds

The footsteps sound metallic because they're generated, not recorded. Real recordings will sound
far better. **Only download sounds you're allowed to use in a game:**
- **Kenney.nl** (Audio packs): CC0, use freely. Start here.
- **Freesound.org**: set the licence filter to **Creative Commons 0** only. Some other licences need credit; CC0 doesn't.
- **Pixabay** (Sound Effects): free to use under the Pixabay licence.
- **Sonniss "GDC Game Audio Bundle"**: big, free, royalty-free professional packs.
Write down where each one came from in `CREDITS.md`, even the CC0 ones.

Format: **.ogg** (or .mp3), 44.1 kHz. Effects in **mono**, ambience loops in **stereo**. Trim the silence
at the start. Loops must loop cleanly (no click). Keep effects under 2 seconds.
Put them in `assets-src/sounds/` with these names:

**Footsteps** (each a single step; variety is what makes it sound real)
- `step-pavement-1..6.ogg`: trainers on concrete or pavement
- `step-wet-1..4.ogg`: on a wet pavement
- `step-gravel-1..4.ogg` (optional): yards, canal towpath

**Cars**
- `engine-idle.ogg` (loop), `engine-low.ogg` (loop), `engine-high.ogg` (loop): a normal petrol hatchback
- `horn.ogg`: a normal car horn
- `crash-light.ogg`, `crash-medium.ogg`, `crash-heavy.ogg`: metal impacts
- `tyres-screech.ogg` (loop), `door-open.ogg`, `door-close.ogg`, `glass-break.ogg`

**Police**
- `siren-uk.ogg` (loop): a UK two-tone or wail siren, NOT an American one
- `police-radio.ogg` (loop, optional): radio chatter with no real names or addresses in it

**City**
- `city-day.ogg` (loop, 30 s+): distant traffic and people
- `city-night.ogg` (loop): quieter, the odd car
- `rain-light.ogg`, `rain-heavy.ogg` (loops), `thunder-1..2.ogg` (optional)
- `crowd-murmur.ogg` (loop): for busy streets like the Bullring
- `birds-morning.ogg` (loop, optional)

**People**
- `ped-shout-1..3.ogg`: a short shout or gasp (when nearly hit)
- `ped-hurt-1..2.ogg`: a short pain sound (when hit)

**Interface**
- `phone-text.ogg`: incoming message
- `mission-start.ogg`, `mission-complete.ogg`: short stings
- `wanted-up.ogg`, `busted.ogg`, `cash.ogg`, `click.ogg`

Music comes later, and needs the same care with licences (or someone making it for you).

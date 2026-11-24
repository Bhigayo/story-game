# Credits

## Characters and animation (CC0)

- `public/models/cast/*.glb`: bodies and hairstyles from **Universal Base Characters** by Quaternius
  (quaternius.com), CC0 1.0 (public domain). Shrunk and combined by `scripts/assets/cast.mjs`.
- `public/models/cast/anims.glb`: clips from the **Universal Animation Library** by Quaternius, CC0 1.0.
  Trimmed by `scripts/assets/anims.mjs`.

CC0 needs no credit, but they're credited anyway. These files can be committed and deployed.

## Voices

- `public/audio/voice/*.mp3`: character voices generated with ElevenLabs (elevenlabs.io). Made on the free plan:
  non-commercial use only, with this credit. Remake them on a paid plan before the game is ever sold.

## Protagonist models (placeholder, licence unverified)

`public/models/real/jordan.glb` (Man_01) and `public/models/real/maya.glb` (Woman_01) were
obtained as free assets from a Telegram channel. The original author and licence are unknown.

- They are gitignored and must NOT be committed, deployed or shared publicly.
- Replace them with licensed models before any public release (Mixamo characters, CC0 packs, or a
  properly licensed pack). The swap is just the two paths in `src/useCharacter.ts`.
- To run without them (for example a public deploy), build with `VITE_REAL_MODELS=0`.

Walk and sit animations: Mixamo-style clips supplied with the assets.

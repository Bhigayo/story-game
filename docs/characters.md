# Characters: how one is built

Every character in the story uses the same 65-bone skeleton (Quaternius "Universal" rig), so every animation
works on every character. There are two kinds of file in `public/models/cast/`:

- `anims.glb`: the shared animation library. Built once.
- `<id>.glb`: one per character, body + hairstyle, no animations.

The game loads both and plays the shared clips on the character (`src/useCharacter.ts`, `src/useWalk.ts`).

## Sources (CC0, in `assets-src/quaternius/`, which is gitignored)

- Universal Base Characters [Standard]: `Base Characters/Godot - UE/Superhero_Male_FullBody.gltf` (and Female),
  hairstyles in `Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/`.
- Universal Animation Library [Standard]: `Unreal-Godot/UAL1_Standard.glb` (no root motion; the game moves the
  character itself).

## Tools

In a separate folder (not the game), once:

```
npm init -y
npm install @gltf-transform/cli @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
```

## Animation library

`scripts/assets/anims.mjs` keeps 26 clips (renamed: idle, walk, jog, sprint, drive, talk, sit, ...), keeps only
bone rotations plus the hip position, and drops the mannequin mesh. Then compress:

```
node anims.mjs UAL1_Standard.glb anims-raw.glb
npx gltf-transform meshopt anims-raw.glb anims.glb
```

## A character

1. Body: `npx gltf-transform copy Superhero_Male_FullBody.gltf body.glb`, then
   `npx gltf-transform prune body.glb body.glb`.
2. Add the hairstyle (rebinds it to the body's skeleton):
   `node cast.mjs body.glb raw.glb Hair_Buzzed.gltf`
3. Shrink textures and compress:
   ```
   npx gltf-transform resize raw.glb a.glb --width 1024 --height 1024
   npx gltf-transform webp a.glb b.glb --quality 85
   npx gltf-transform meshopt b.glb jordan.glb
   ```
4. Copy to `public/models/cast/<id>.glb` and add it to `CAST_MODELS` in `src/useCharacter.ts` (the key is the
   protagonist's id). Skin and hair colours come from `src/protagonists.ts`.

Some textures are referenced under slightly different names in the .gltf files (for example `T_Eye_Normal_png.png`);
copy or rename the file to match if a step says a texture is missing.

## The cast so far

| id | body | hair | file |
|---|---|---|---|
| jordan | Superhero_Male | Hair_Buzzed | 306 KB |
| maya | Superhero_Female | Hair_Long | 523 KB |
| adrian | Superhero_Male | Hair_SimpleParted | 310 KB |

The female body's eye normal map is referenced as `T_Eye_Normal_png.png`, and its hair material is
`MI_Hair_2` (the male's is `MI_Hair_1`); the game tints both.

## Checks for a new character

- Feet on the pavement (the hips are moved for the body's leg length automatically).
- Faces where it walks (the Quaternius files face +Z, which is what the game uses).
- Walk, jog and sprint don't skate (`useWalk.ts` scales each clip by leg length).
- Under about 400 KB and 15k triangles.

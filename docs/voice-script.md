# Voice script

Recorded lines for cut-scenes. Each line in `src/cutscenes/scenes.ts` can name a `voice` file; the game plays it
from `public/audio/voice/` as the subtitle appears. A missing file is simply silent, so lines can be added a
few at a time.

## How to make them (ElevenLabs)

1. Sign in at elevenlabs.io and open **Text to Speech**.
2. Pick a voice from the Voice Library for each character (below) and **save it**, so every line for that
   character uses the same voice.
3. Paste one line at a time. Use the direction in brackets to pick the delivery (the brackets are not read out;
   don't paste them). Generate a few takes and keep the best.
4. Download as **MP3** and name it exactly as in the table. Put it in `public/audio/voice/`.
5. Refresh the game and watch the scene with `?scene=arrival`.

**Licence.** The free plan is for non-commercial use only, and anything you publish from it has to credit
ElevenLabs ("elevenlabs.io"). That's fine for a portfolio game: keep the credit in `CREDITS.md`. If the game is
ever sold or monetised, the lines have to be made again on a paid plan (Starter or above), which includes a
commercial licence.

## The cast's voices

| Character | Voice to look for |
|---|---|
| **Jordan Hayes**, 23 | Young British man, Birmingham or Midlands if available (otherwise neutral English). Low, tired, dry. Not a cartoon "street" voice. |
| **Leon Campbell**, mid 20s | Warm, quick, a joker. Brummie or London-Caribbean. Talks like he's smiling even when he's stressed. |
| **Aisha Rahman**, early 30s | Calm, firm, kind. Birmingham. Runs a café and doesn't take nonsense. |
| **Raymond Ellis**, 60s | Older Brummie man. Gravelly, sarcastic, slow. |
| **Nia Okafor**, late 20s | Professional, clear, careful. Southern English or neutral. |
| **Daze**, 27 | Quiet and flat. More frightening for not raising his voice. |

## Scene: arrival (Act 1, mission 1)

| File | Who | Line | Direction |
|---|---|---|---|
| `arrival-1-leon.mp3` | Leon | You back then? Get some food in you first. Corner shop, Gibb Street. | (a voice note: friendly, a bit rushed, traffic behind him) |
| `arrival-2-leon.mp3` | Leon | Then come find me at the yard. Sofa's yours. Don't get comfy. | (joking on the last bit) |
| `arrival-3-jordan.mp3` | Jordan | Back in Brum. With nothing. | (to himself, quiet, half a laugh) |

Leon's two lines are texts on screen; recorded, they work as voice notes.

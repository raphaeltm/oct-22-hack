# Homepage film

This folder builds the 67-second film shown in the landing page's "One-minute
tour" section. The finished files go to `web/public/media/radar-film.{mp4,jpg,vtt}`.
The storyboard, the script and the review notes are in
[docs/video/storyboard.md](../docs/video/storyboard.md).

None of this is part of the app build. The Docker image only ships the three
finished files from `web/public/media/`.

## How it works

- `film.html`, `film.css` and `film.js` are a 1920×1080 web page that uses the
  landing page's design tokens. `window.seek(t)` draws the frame for time `t`.
  Nothing animates on its own, so every render produces the same frames.
- `timeline.mjs` sets each scene's length from the length of its voice line.
  The picture (`film.js`) and the sound (`mix.mjs`) both use it, so they can't
  drift apart. `vo-words.json` holds word timings, so on-screen text lands on
  the matching spoken word.
- `render.mjs` steps headless Chromium (Playwright) through the frames at 30 fps
  and sends them to ffmpeg, which writes `out/picture.mp4`.
- `mix.mjs` mixes the voice, music bed and effects. It ducks the music under
  the voice, normalises to −16 LUFS, then writes the web MP4 (H.264 + AAC,
  faststart), the poster and the WebVTT captions.

## Audio (ElevenLabs)

The audio is committed under `audio/`, so re-rendering doesn't call any API.

| File | ElevenLabs API |
| --- | --- |
| `audio/vo/*.mp3` | Text to Speech: voice "Alice" (`Xb7hH8MSUJpSbSDYk0k2`), `eleven_multilingual_v2`, with previous/next text for continuity. Lines are in `lines.json`. |
| `audio/sfx/bed.mp3` | Sound Effects v2: a 30 s looping ambient bed. The Music API needs a paid plan. |
| `audio/sfx/{ping,riser,whoosh,tick}.mp3` | Sound Effects |
| `vo-words.json` | Speech to Text (Scribe): word timings. We also used it to check that the final mix is intelligible. |

The account is on the free tier. ElevenLabs requires attribution for free-tier
output, which is why the landing page credits ElevenLabs under the film. If you
upgrade the plan, you can remove the credit or keep it.

To regenerate a voice line, the key has to come from the SAM secret, so run it
through SAM `exec_with_secrets` with `ELEVENLABS_API_KEY`:

```bash
python3 tts.py Xb7hH8MSUJpSbSDYk0k2 eleven_multilingual_v2 audio/vo 08_receipts
./prep.sh                                # trim silence and record durations
python3 stt.py audio/vo_trim scribe_v1   # word timings (needs the key too)
```

## Render

Needs ffmpeg and Playwright's Chromium (`npx playwright install chromium`).

```bash
cd video && npm install
node render.mjs --stills 3.8,18.6,34   # quick keyframes in out/stills/
npm run render                         # full film, about 5 minutes on 4 vCPU
node check-landing.mjs                 # browser checks against a web preview on :4173
```

## Rules for edits

The film's story is joint bids, and every record in `film.js` is real:

- Paris Habitat's verdict, gaps and ranked partners come from the live partner
  finder on dev (`GET /api/tenders/667222-2026/partners`, demo user,
  22 Oct 2026).
- The French invite is the output of `draftEmail()` in
  `server/src/lib/invites.ts`.
- The groupement notices were checked against TED's search API.
- The reply rubric mirrors `scoreResponse()`.

If the data changes, re-fetch it. Don't edit numbers by hand. Keep the
on-screen caveats:

- fictional demo company
- fit is a heuristic shortlist score
- a past award is evidence, not proof of interest
- Radar never sends email on its own
- the 199 joint-bid count comes from TED’s party-leader flag (of 2,610 award notices)

**Pronunciation:** write French terms in guillemets, as in « groupement ».
With them, `eleven_multilingual_v2` uses a French reading. Without them it says
"groupment". `mix.mjs` removes the guillemets from the captions.

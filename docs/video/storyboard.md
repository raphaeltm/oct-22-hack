# Homepage film: storyboard and script

This file covers the homepage marketing film (`web/public/media/radar-film.mp4`),
how it was planned and how it was reviewed. The source for the film is in `video/`
(see `video/README.md`).

## Brief

- **Where:** the landing page, directly under the hero and ticker. The visitor
  starts it; it never autoplays with sound.
- **Audience:** founders and business developers at French digital agencies and
  ESNs with 10 to 250 people. They bid on public work but have no bid team.
- **Job:** in about a minute, show the journey: profile, then matching tenders,
  then past winners, then a dossier with sources. Then send people to the live
  demo.
- **Look:** the landing page itself. Ink `#0a1510`, signal lime `#c6f36b`,
  paper `#f3f0e6`, moss `#7aa874`. Manrope for display, DM Sans for body,
  Instrument Serif italic for emphasis, JetBrains Mono for TED IDs. The radar
  sweep, the 64 px grid, pill buttons and dark rounded cards all come from the
  page.
- **Truth rules (AGENTS.md):** every tender, award, rival and number on screen
  comes from the landing page's dev snapshot of 22 Oct 2026. Rivage Numérique is
  labelled as fictional. Fit is labelled a heuristic. The 1.9× number is labelled
  a backtest, not a win probability. A past winner is shown as evidence, not
  proof that the company will bid.

## Best practices we applied

From research on SaaS homepage explainers and B2B demo videos (sources at the end):

1. **Length 60 to 90 s** for a homepage. We aim for about 65 s.
2. **Hook in the first 3 to 5 s** with a problem the viewer recognises or a
   strong visual. No logo intro and no company history.
3. **Problem, then product, then proof, then one CTA.** Show what the viewer
   gets, not a list of features. Show the product doing the job.
4. **It has to work on mute.** Most homepage plays start muted, and many visits
   are on mobile. Every beat has a short on-screen line (3 to 7 words), plus a
   WebVTT caption track.
5. **About 140 words a minute** for the voiceover, written to be heard. Every
   line has its own picture. If a line has no picture, we cut it.
6. **Motion:** eased movement that overlaps, never linear. One type family with
   a clear hierarchy. Each phrase lands with the narration.
7. **Credibility:** real records and the names of real data sources. The
   honesty labels stay on screen while their claims are shown.
8. **Mobile:** text big enough to read at 360 px wide, which means at least
   about 34 px at 1080p for anything important. Show the UI in close-up rather
   than whole screens.

---

## Iteration 1: feature tour (rejected)

**Length:** about 95 s, 9 scenes.

| # | Time | Visual | VO |
|---|------|--------|----|
| 1 | 0–6 | Radar logo builds, the wordmark appears | "Meet Radar, the AI copilot for public procurement." |
| 2 | 6–16 | Stack diagram: TED, BullMQ, Postgres, Mastra, Claude | "Radar imports thousands of TED notices into Postgres every six hours using BullMQ…" |
| 3 | 16–28 | The whole app, tenders page | "Browse every French IT tender in a clean interface." |
| 4 | 28–40 | Chat panel | "Chat with an agent to build your profile." |
| 5 | 40–52 | Matches list | "Get matches ranked by fit score." |
| 6 | 52–64 | Competitors page | "See your competitors." |
| 7 | 64–76 | Autopilot page | "Autopilot builds dossiers." |
| 8 | 76–88 | Stats 6,939 / 2,610 / 192 | "Built on real data." |
| 9 | 88–95 | Logo + URL | "Try Radar today." |

**Review of v1**

- ❌ It opens with a logo and a product name. Viewers decide in the first 5 s,
  and this gives them no reason to stay.
- ❌ The stack scene is for judges and engineers, not buyers. It belongs in the
  "Under the hood" section, not in the film.
- ❌ It reads as a list of features ("browse", "chat", "see"). It doesn't show
  what the viewer gets: *I find the tender that fits and know who I'm up
  against.*
- ❌ Full-screen app captures would be unreadable on a phone.
- ❌ "Ranked by fit score" without the heuristic label breaks our honesty rule.
- ❌ At 95 s it's over the 90 s ceiling, and the proof (the numbers) comes too
  late.

## Iteration 2: problem first (revised)

**Length:** about 75 s, 8 scenes. We cut the stack scene, open with the
problem, and use close-up cards in the landing page's style instead of whole
screens.

| # | Time | Visual | On screen | VO |
|---|------|--------|-----------|----|
| 1 | 0–7 | Dark grid, TED notice IDs pile up, counter to 6,939 | "6,939 French IT tenders since 2025" | "Since 2025, French public bodies have published almost seven thousand IT tenders." |
| 2 | 7–14 | The notices blur, three pain lines | "Missed. Blind. Wasted." | "A small agency can't read them all. So you miss the ones that fit, bid blind on the rest, and lose days on no-gos." |
| 3 | 14–20 | Radar scope sweeps, wordmark | "radar." | "Radar is the bid office your agency never had." |
| 4 | 20–30 | Chat bubble, then the profile card builds | "Tell it who you are" | "Describe your company in plain words. Radar turns it into a profile: services, CPV codes, keywords." |
| 5 | 30–42 | Four match cards, fit rings fill, Bid / No-bid | "See what fits, and why" | "Then it reads every new tender, and tells you what fits, and when to walk away." |
| 6 | 42–54 | Rivals list for Clichy | "Know who you're up against" | "For each one, it shows who won contracts like it, with the TED notice to prove it." |
| 7 | 54–66 | Dossier checklist + 1.9× bars | "Homework, done before you ask" | "Autopilot assembles the pre-bid dossier on its own, and grades its predictions when the award lands." |
| 8 | 66–75 | Final CTA | "Stop bidding blind." | "Stop bidding blind. Try the live demo." |

**Review of v2**

- ✅ The structure works: problem, product, three proof beats, CTA.
- ❌ Scene 2's "Missed. Blind. Wasted." is too abstract, and three pains in
  7 s is too much to read. Keep two, and show them as things happening to
  notices (one fades away unread, one gets a "?" for its winner).
- ❌ The hook counter is good but slow: 7 s before anything turns. Get to the
  tension faster. The number should land by 2.5 s.
- ❌ The VO is too dense in places (scenes 2 and 7 are around 170 wpm). Cut
  words.
- ❌ It's missing the **receipt** idea, which is the landing page's main
  differentiator ("Every claim comes with a receipt"). Show the TED IDs as
  links in every proof scene, and give the receipt line its own short beat.
- ❌ The honesty labels aren't planned: "Fictional demo company", "heuristic,
  not a win probability", "backtest" and "evidence, not proof" each need a
  slot on screen.
- ❌ Every scene is about 12 s long, which feels monotonous. Vary the rhythm:
  quick cuts in the problem, more room for the matches.
- ❌ There's no sound design yet. Add a soft sonar ping for blips and matches,
  plus a low ambient bed.

## Iteration 3: final (approved for production)

**Length:** about 64 s, 9 beats. Voice: ElevenLabs "Alice", a clear British
educator voice, calm and confident, which suits a premium editorial look.
Music: a minimal electronic pulse at about 100 bpm, ducked under the voice.
SFX: a sonar ping when the radar first appears and on the CTA, plus a soft
tick each time a card lands.

| # | Time | Visual (1920×1080) | On-screen text | VO (~140 wpm) | Labels |
|---|------|--------------------|----------------|---------------|--------|
| 1 Hook | 0–5 | Ink grid. Real TED notice rows from the ticker stream upward fast. The counter rolls to **6,939**. | **6,939** French public IT tenders *since 2025.* | "Since 2025, France has published almost seven thousand public IT tenders." | Source: TED, dev snapshot 22 Oct 2026 |
| 2 Problem | 5–12 | The rows slow down. Most fade grey ("unread"). One award row shows its winner, then cuts to "you lost". | You can't read them all. *So you bid blind.* | "No small agency can read them all. So you miss the ones that fit, and bid blind on the rest." | — |
| 3 Reveal | 12–17 | The rows collapse into the centre. The radar scope sweeps open and the wordmark **radar.** appears. Ping. | The bid office your agency *never had.* | "Radar is the bid office your agency never had." | — |
| 4 Profile | 17–25 | Chat bubble (lime) types in. The profile card builds and chips pop in: CPV codes, RGAA, DSFR, SecNumCloud. Tick. | 01 · Tell it who you are | "Describe your company in plain words. Radar turns it into a profile it can search with." | Fictional demo company |
| 5 Matches | 25–36 | Four real match cards slide in. Fit rings fill (80, 79.7, 65.6, 68.5). Bid / Bid / Bid / **No-bid**, with reasons. Each card shows its TED ID. | 02 · See what fits, *and why* | "It reads every new French IT tender, scores what fits, and tells you when to walk away." | Fit is a heuristic, not a win probability |
| 6 Rivals | 36–46 | Clichy tender header. STRATIS, NET COM (alias merged) and ADIMEO rank in, with wins, buyers, value and an example TED award. | 03 · Know who you're *up against* | "For any tender, see who won contracts like it before, with the award notice to prove it." | A past win isn't proof they'll bid |
| 7 Autopilot | 46–55 | The dossier checklist ticks down (6 items). Then the backtest bars grow: 17/149 vs 9/150 → **1.9×**. | Autopilot does the homework *and keeps score.* | "Autopilot builds the pre-bid dossier on its own, then grades its predictions when the award lands." | Backtest on 150 past tenders · not a win probability |
| 8 Receipts | 55–59 | TED receipt chips fly in and line up. | Every claim, *with a receipt.* | "Every claim, with a receipt." | — |
| 9 CTA | 59–65 | Final screen: the scope behind, "Stop bidding *blind.*", the lime pill "Try the live demo →", the wordmark. Ping. | Stop bidding *blind.* | "Stop bidding blind. Try the live demo." | — |

**Word count:** about 118 VO words in about 52 s of speech, which is about
136 wpm, with breathing room between beats.

**Review of v3 (against the checklist)**

- ✅ Hook: the number lands by 2.5 s, and the tension ("bid blind") arrives
  by 10 s.
- ✅ It works on mute: every beat has a large headline, and captions ship as
  WebVTT.
- ✅ Every record on screen is real, and every honesty caveat is labelled.
- ✅ The rhythm varies: 5 / 7 / 5 / 8 / 11 / 10 / 9 / 4 / 6 s.
- ✅ There's one CTA, and it matches the page's primary button.
- ✅ It looks like the landing page, so it reads as part of the page, not a
  generic stock explainer.

Storyboard keyframes are uploaded to the SAM library under
`/marketing/video/storyboard/`.

---

## Production reviews

We reviewed each render with three tools:

- **Frame sheets:** a 2 fps contact sheet of the whole film, plus full-size
  frames at every scene change.
- **Cut detection:** ffmpeg scene-change detection, to catch accidental hard cuts.
- **Audio:** ElevenLabs Scribe transcribed the final mix, and we compared it
  word for word with the script. We also measured EBU R128 loudness.

### Round 1: first full render (67.4 s)

- ✅ The transcript of the mix matched the script. The music bed never covers the
  voice. Loudness was −16.9 LUFS. No unintended hard cuts.
- ❌ Autopilot showed "1.0×" for about 5 s before the count started, which looked
  like a bug. **Fix:** the number stays hidden until it starts counting.
- ❌ Several scenes held a frozen frame for 3 to 4 s after their last animation.
  **Fix:** a slow 3 % push-in on every scene.
- ❌ Profile: an empty card sat on screen for about 3 s before the profile built,
  and the chat bubble grew from a narrow box. **Fix:** the chat sits in a
  frameless column, the bubble has a fixed width and pops in, and the profile
  card brings its own panel.
- ❌ Reveal: the Saint-Quentin blip label was clipped at the right edge.
  **Fix:** moved the scope 50 px to the left.
- ❌ The voice said "Every claim, with a receipt" while the screen said "Every
  claim comes with a receipt." **Fix:** regenerated that one line so the voice
  matches the screen and the landing page.

### Round 2: second render (67.6 s)

- ✅ All the round 1 fixes worked, and the profile beat now reads cleanly.
- ❌ Matches opened on an empty card for about 0.5 s. **Fix:** the card and rows
  enter sooner (stagger cut from 0.32 s to 0.24 s), and the tick SFX moved to
  match.
- ❌ The file was 20 MB at CRF 22, because the push-in changes every frame.
  **Fix:** CRF 26 with `-tune animation`, giving 11.8 MB (about 1.4 Mbps) with
  no visible banding on the gradients. The page only fetches the file when the
  visitor presses play.

### Round 3: final

- ✅ Mid-transition frames are clean soft crossfades, with no overlaps or jumps.
- ✅ The final mix transcribes to all 118 scripted words. Loudness is −16.9 LUFS
  integrated, peak −1.4 dBFS, LRA 6 LU.
- ✅ The poster (reveal beat) works as a still that mirrors the landing hero.
- ✅ The captions (`radar-film.vtt`) are timed from the word transcript.
- ✅ On the landing page (`video/check-landing.mjs`, 14 checks): the poster
  loads, the video isn't fetched before play, a click plays it with sound and
  controls, Tab + Enter works, captions are served as WebVTT, the 390 px
  layout has no overflow, a missing file shows an error state, and the frame
  stays visible while playing. That last check covers a bug the browser check
  found: React replaced the scroll-reveal class when playback started, and the
  frame disappeared.

**Approved.** It ships in the landing page's "One-minute tour" section, which
sits between the ticker and "The problem".

---

## Sources

- [Supademo: SaaS explainer video examples (2026)](https://supademo.com/blog/saas-explainer-video)
- [Velo: SaaS explainer video examples](https://usevelo.ai/blog/saas-explainer-video-examples/)
- [Flowjam: lead with the problem, not the feature](https://www.flowjam.com/blog/startup-product-demo-video)
- [ContentBeta: how to write a product demo script](https://www.contentbeta.com/blog/how-to-write-product-demo-script-examples-template/)
- [ContentBeta: how to write a 60-second video script](https://www.contentbeta.com/blog/60-second-video-script/)
- [Pexo: kinetic typography explainer](https://pexo.ai/tutorial/how-to-make-a-kinetic-typography-explainer-video)

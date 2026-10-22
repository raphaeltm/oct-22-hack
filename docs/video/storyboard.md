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

---

# Version 2: joint bids (22 Oct 2026, afternoon)

**Why:** a hackathon mentor said Radar had "no edge". The answer was data that
only France offers. French buyers let SMEs bid together as a *groupement*
(co-traitance), and TED award notices record who teamed up with whom. The
product focus is moving to a **partner finder**: find partners for a tender,
reach out, score the replies, and grow the network. The homepage messaging is
moving the same way, so the film follows.

**Truth constraints for v2:**

- These facts are **real** and may be shown as fact:
  - Radar's No-bid on Économat des Armées (TED 702985-2026): "Mobile app and
    event platform scope exceeds small senior team capacity, though CPV matches."
  - The groupement examples, checked against TED's API on 22 Oct 2026:
    - 17241-2025: SNCF, Deloitte Conseil + KSHUTTLE.
    - 4575-2025: Bouches-du-Rhône, ENGIT + MEJA ("co-traitance ENGIT").
    - 9502-2025: ASP, LATITUDE GEOSYSTEMS + GEOSERVE B.V.
  - The **155** French IT award notices since 2025 with a multi-company bidder.
    This is a heuristic count, and some may be subcontracting.
- The **partner finder is not built yet.** Ranking, outreach and reply scoring
  appear under a visible "Preview · in development" label, with no invented
  partner names or scores. Once the feature ships, its real output replaces the
  preview.
- The old film's backtest (17/149, 1.9×) is out of date (now 18/151 vs 9/151),
  and the beat is off-topic, so it's cut.

## J-iteration 1 (rejected)

Take the old film and add a "find partners" scene after the competitors scene.

- ❌ Joint bids become feature number six, but they are now *the* point. The
  story has to be built around them.
- ❌ The hook (6,939 tenders) sells volume, not the new edge.
- ❌ It shows a working partner list, which doesn't exist yet. That breaks the
  honesty rule.

## J-iteration 2 (revised)

1. Hook on groupements ("155 contracts won together"). 2. Radar reveal.
3. Partner list. 4. Outreach. 5. Reply scoring. 6. Network effect. 7. CTA.

- ✅ The edge is up front.
- ❌ It opens with a statistic, before the viewer feels the problem. The
  strongest problem is in our own data: Radar told the demo agency **No-bid**
  on a tender that fits its skills, *because the scope was too big for a small
  team*. That is the "too big to bid alone" moment, and it's real.
- ❌ "155 contracts won together" overstates a heuristic count. Say "award
  notices that name a multi-company bidder", and show the caveat.
- ❌ It has no gap step. A partner only makes sense once the viewer sees *what*
  is missing. Show the tender's scope against the profile: website covered,
  event platform and mobile app not.
- ❌ It has no preview label plan, so it needs one.

## J-iteration 3: final

About 70 s, 9 beats, the same visual system and voice as v1.

| # | Beat | Visual | On screen | VO | Label |
|---|------|--------|-----------|----|-------|
| 1 | Hook | Économat des Armées match card with a **No-bid** verdict; its reason gets highlighted | Too big to bid *alone.* | "This tender fits our agency's skills. Radar still said no-bid: the scope is too big for a small team to deliver alone." | Real Radar verdict · TED 702985-2026 · fictional demo company |
| 2 | Insight | Three real groupement cards, where two company chips join with "+"; counter **155** | In France, you don't have to bid *alone.* | "But in France, small firms can bid together as a groupement, and TED records every one." | Heuristic count from TED · some may be subcontracting |
| 3 | Reveal | The radar scope; blips pair up with lines; wordmark | Find the partner *you're missing.* | "Radar finds the tenders you can win, and the partners to win them with." | n/a |
| 4 | Gap | Tender scope chips against the Rivage profile: Site web ✓, Plateforme évènementielle gap, Application mobile gap | 01 · See exactly *what you're missing.* | "It reads each tender against your profile, and pinpoints what you can't cover." | Gaps from Radar's No-bid reason |
| 5 | Partners | Skeleton partner cards with signal badges: fills your gap, has bid jointly before, knows this buyer, doesn't compete with you, each with a TED link icon | 02 · Partners who *fill the gap.* | "Then it ranks partners who fill that gap, have bid jointly before, and know the buyer. Every signal links to its notice." | **Preview · partner finder in development** |
| 6 | Outreach | A French proposal draft types out ("Objet : Proposition de groupement…"), with a "Send it yourself" button | 03 · A proposal in French, *you send it.* | "It drafts the proposal in French. You review it, and send it yourself." | **Preview** · Radar never emails anyone on its own |
| 7 | Replies + network | A reply card scored on interest, role, capacity and references, then "Claim your radar" and the network graph grows | 04 · Score replies. *Grow the network.* | "Replies are scored on fit and references, and every partner you invite can claim a radar of their own." | **Preview** |
| 8 | Receipts | Groupement receipt chips | Every claim comes *with a receipt.* | "Every claim comes with a receipt." | n/a |
| 9 | CTA | Scope behind, with "Stop bidding *alone.*" and the "Try the live demo" pill | Stop bidding *alone.* | "Stop bidding alone. Try the live demo." | n/a |

**Review of J3:** the hook is a real and specific pain, felt in under 5 s. The
edge (French groupement data) lands by 12 s. Every unbuilt part is labelled
as a preview. Every record is real and linked. There is one CTA, and the
closing line echoes "Stop bidding blind" and moves it on.

## J-iteration 4: the partner finder shipped (re-scripted mid-production)

While J round 2 was rendering, the partner finder merged (#45) and went live on
dev. We re-checked everything against the live API as the demo user:

- The matches had been re-run (13:02). The Économat des Armées rationale the
  hook quoted from the landing snapshot is **no longer Radar's current
  verdict**, so a hook built on it would be stale. For that tender the finder
  also reports **no capability gap** ("capacity" mode, led by large firms),
  which is a weak example of finding the partner you're missing.
- **Paris Habitat, TED 667222-2026** (a GIS/SIG platform) tells the whole story
  with live data:
  - Radar's current rationale: "Weak fit: SIG/GeoSaaS platform sits outside core
    RGAA/DSFR/web focus" (fit 60.2).
  - The finder's gaps, quoted from the notice: "Application maintenance (TMA)"
    and "GIS / géomatique".
  - Ranked co-contractors that cover both: AKKODIS I&S 59 (Villeurbanne, your
    region; 2 joint bids on TED), CIRIL GROUP 52, NAOMIS 52 and ATEXO 50, each
    with TED award evidence.
  - The French invite comes from the app's own `draftEmail()` with those inputs,
    so it's the exact text Radar would produce.
  - Reply scoring shows the real rubric (Interest 25 · Covers the need 25 ·
    References 25, checked against TED · Identity 10, SIRET · Speed 10 ·
    Completeness 5). There are no real replies yet, so the film shows no score.
- So the preview labels are gone. Labels now carry the app's own caveats: fit
  is a heuristic shortlist score, a past award is evidence and not proof of
  interest, and Radar never emails anyone.

| # | Beat | On screen | VO |
|---|------|-----------|----|
| 1 | Hook: the Paris Habitat match card, weak fit 60.2 with its rationale | Out of reach *on your own.* | "Paris Habitat needs a GIS platform. Radar's verdict for our Lyon web agency: a weak fit. Mapping isn't what it does." |
| 2 | Insight: groupements, 155 | In France, you don't have to bid *alone.* | (unchanged) |
| 3 | Reveal | Find the partner *you're missing.* | "Radar finds the tenders you can win, and the partners to win them with." |
| 4 | Gaps with French quotes | 01 · See exactly *what you're missing.* | "It reads the notice against your profile, and pinpoints the gaps: GIS, and application maintenance." |
| 5 | The real ranked partners | 02 · Partners who *fill the gap.* | "Then it ranks partners who cover them, with their TED awards and past joint bids as evidence." |
| 6 | The real French draft for AKKODIS I&S | 03 · Drafted in French. *You send it.* | "It drafts the invitation in French. You send it from your own mailbox." |
| 7 | The real scoring rubric, then the network | 04 · Score replies. *Grow the network.* | "Replies are scored, references are checked against TED, and every partner who answers can open a radar of their own." |
| 8–9 | Receipts, CTA | (unchanged) | (unchanged) |

## Joint-bid production reviews

### J round 1 (70.4 s)

- ✅ No unintended hard cuts. Loudness −16.8 LUFS, peak −1.4 dBFS. All the
  preview labels are visible on the partner-finder beats.
- ❌ Scribe heard the voice say **"groupment"**, an English reading of
  *groupement*, which would grate on French viewers. We tested three variants
  and transcribed each in English and in French mode. Writing it as
  « groupement » (in guillemets) made the model use a French pronunciation:
  the French-mode transcript heard "group-more", the nasal ending. We kept
  that take, and the captions drop the guillemets.
- ❌ The hook headline only landed at about 5.6 s, so on mute the first 5 s
  were a small card with no message. **Fix:** "Too big to bid alone." now lands
  at about 1.6 s, before the voice says it.

### J round 2

- ✅ The hook works on mute by 2.5 s. The insight counter, the gap badges, the
  partner signals, the typed French draft and the network growth all land on
  their spoken words.
- ❌ The hook card sat high, leaving the bottom third of the frame empty.
  **Fix:** the headline and card moved down to balance the frame.

### J round 3 (final)

- ✅ It's re-scripted on live partner-finder data (J4). No cuts, −16.9 LUFS,
  peak −1.4 dBFS. 130 of 131 scripted words match the transcript. The one
  difference is "groupement", which the English model can only spell as
  "groupment". The French-model check hears the French reading.
- ❌ Main changed during the round (#48). The joint-bid count is now **199 of
  2,610**, from TED's party-leader flag, which replaces the 155 heuristic. Also,
  "2 joint bids" for AKKODIS over-counts, because one notice can be counted
  twice across lots. **Fix:** the film shows 199 with the new source label and
  says "joint-bid history on TED". It was re-rendered.
- ✅ Browser checks pass 18/18 on the vertical landing page (#39). The frame
  fits below the nav at 1280–1920 px, with no overflow at 390 px.

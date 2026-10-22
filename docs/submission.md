# Hackathon submission (copy-paste)

Form answers for the 2026-10-22 founder challenge. They reflect the joint-bidding
pivot (partner finder, PR #45). Numbers are copied from the dev snapshot used by
`/hackathon` (22 Oct 2026, 11:52 UTC) unless marked otherwise. Re-check them
against `/api/autopilot/scorecard` on dev before submitting.

## Project name

**Radar**: bid together on French public tenders

## One-line pitch

> **The bidding war is over. Radar finds the partners small French IT firms need to win public tenders together.**

Shorter alternatives:

- "The bidding war is over: stop competing for tenders you can win together."
- "Radar reads every French public IT tender, spots the gap in your offer and finds the partner who fills it."

## 3-minute demo (MP4)

The current `web/public/media/radar-film.mp4` is a one-minute marketing film. It
does **not** meet "a working product in one end-to-end user journey". Record a
real screen capture on dev and label it *Live run* (the rules require live runs
and recorded scenarios to be labelled).

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Landing hero | "Small French IT firms lose tenders they can't cover alone. French law lets them bid as a *groupement*. Nobody helps them find the partner." |
| 0:15–0:35 | Log in as Rivage Numérique (fictional Lyon agency) → Tenders | "The agent already knows us from a two-minute chat. These are open French IT tenders from TED, ranked against our profile, with the reason for each match." |
| 0:35–1:05 | Open a large tender → Autopilot dossier | "Overnight, the agent built this dossier unprompted: verdict, the award-criteria weights from the notice, deadlines, buyer history, likely bidders. It says: too big alone, consider a groupement." |
| 1:05–1:50 | Partners panel on the tender | "Here's the gap: the capabilities the notice asks for that we lack, quoted in French. And here's who fills it, ranked from real TED evidence: their awards, their past joint bids, wins with this buyer, same region, and how little they overlap with us. Every signal links to its notice." |
| 1:50–2:20 | Draft invite → copy / mailto | "The agent drafts a formal French invitation with a private link. *We* send it from our own mailbox; Radar never emails anyone." |
| 2:20–2:45 | Open `/p/:token` in a private window, answer as the partner → back to Partners, show the score | "The partner answers on a public, token-scoped page. Radar scores the reply 0–100 and checks their references against their own TED awards and their SIRET." |
| 2:45–3:00 | "Open your own Radar" on the reply page → close | "And the partner gets their own Radar. Every invite brings a new company onto the network. The bidding war is over." |

Backup: if the model is slow, cut to a pre-recorded run of the same steps and label it *Recorded run*.

## The data layer in action

> **What data:** every French public IT tender and award notice published on TED (the EU's official procurement journal) since January 2025. That means buyer country FRA, CPV 72\* (IT services): ~6.9k notices, 2,610 award notices naming their winners. The French text is kept verbatim. We also parse the eForms XML of award notices for **tendering parties**: which companies bid together (lead + members, SIRET, city, NUTS region). That is the record of real *groupements* (co-traitance), and it's the edge of the product. On top of that: the company profile the user builds by chatting with the agent, its bid/skip/won/lost feedback, partner invites and replies, and Keenable web search to enrich competitor profiles.
>
> **Where it lives:** in one **Postgres** database for everything. Tenders and awards (one row per winner, so framework co-winners are kept), organisations normalised across name variants, consortia and their members, company profiles, Autopilot dossiers, a prediction ledger, feedback, partner invites and responses. The agent's long-term memory lives there too (Mastra + `@mastra/pg`). Search is Postgres full-text with the `french` config. **Redis** runs the BullMQ job queues and Redis Streams that push live agent output to the browser over SSE. It ships as one Docker image plus Postgres and Redis.
>
> **How it flows:**
> 1. A scheduled BullMQ job pulls new notices from the TED Search API v3 into Postgres, then fetches award-notice XML to extract joint-bid groups.
> 2. Each new tender is scored against every company profile (CPV, region, buyer, text, learned feedback weights).
> 3. For a strong match, an **Autopilot** job builds a pre-bid dossier unprompted and logs the agent's predicted bidders in a ledger.
> 4. When the award notice arrives (matched by the eForms procedure id), the prediction is graded automatically, so the agent is measured on real outcomes.
> 5. For a tender the firm can't cover alone, the **partner finder** works out the capability gaps and ranks co-bidders from award evidence, past joint bids, buyer and region history and low overlap.
> 6. The agent (Claude via Mastra) drafts the French invite and the user sends it. The partner's reply comes back through a token-scoped page and is scored, with references checked against TED awards. The reply also feeds future rankings and brings a new company onto the platform.
>
> Every claim in the UI carries its TED publication id and link. The same tools are exposed over MCP, so the agent works from Claude or ChatGPT too.

## Evidence it works (upload)

Recorded live run (1:52 MP4) and evidence PDF: SAM library `/hackathon/radar-live-run.mp4`
and `/hackathon/live-run/radar-evidence.pdf`. Regenerate with `node video/journey.mjs "" out`
then `node video/journey-pdf.mjs out`. Each run creates a real invite and a *simulated*
partner reply on dev, so don't re-run it casually.


Upload the evidence PDF: `cd video && node evidence.mjs` signs in to dev as the demo
company, captures the live app and writes `radar-evidence.pdf` along with the live
scorecard. The live scorecard read 17/151 vs 9/151 at 13:10 UTC (the deck snapshot
from 11:52 says 18/151). Quote whatever the latest run says. The caption:

> **Backtest against a naive baseline.** We replayed 151 past French IT tenders that now have an award notice. For each one the agent could only see awards published *before* the tender, and the target award was excluded. **An actual winner was in the agent's top 5 for 17 of the 151 tenders. The naive baseline (the 5 most frequent winners in the same CPV area) got 9 of the same 151, so the agent did nearly 2× better.** Both methods were scored on the same tenders, and a tender with no prediction counts as a miss. Live predictions are logged too and graded automatically when the real award is published. Honest limits: 11% is a low absolute hit rate, and a past winner is evidence, not proof of the next bidder. The last similar winner won again only 1 time in 35. The data shows why partnering matters: 199 of 2,610 French IT award notices since 2025 went to a multi-company group (TED's tendering-party-leader flag).

If there's time, add a partner-finder before/after: without Radar, finding a
co-bidder means reading award notices by hand. With it, you get a ranked list
with TED evidence in seconds. Only quote a time if it was actually measured.

## One pitch slide (open link)

The deck already has a pitch slide: `<dev URL>/hackathon#pitch`. It's public
and needs no sign-in. The rules prefer Google Slides ("Anyone with the link can
view"). Copy the content below into a single slide:

> **Radar: the bidding war is over.**
> *Find the partners to win French public tenders together.*
>
> **Who:** French SME digital agencies and IT consultancies (10–250 staff) that bid on public contracts without a bid team. They lose tenders they could only win as a *groupement*.
>
> **What:** an agent that reads every French IT tender on TED, spots the gap in your offer, ranks partners from real joint-bid and award data, drafts the French invite, and scores the replies.
>
> **Why now:** since 2023–24, TED publishes every EU notice as structured eForms with a free API, including *who bid together* and who won. LLM agents can now read the French text and act on it.
>
> **Proof:** in a backtest on 151 past tenders, an actual winner was in the agent's top 5 **nearly 2× as often as the naive baseline** (17 vs 9 of 151). 199 of 2,610 recent French IT awards went to joint bidders.
>
> **First users:** every invite is a new user. A partner who replies gets their own Radar. Seed it from the data: every award notice names its winners, so we can reach each firm with its own matches. Channels: Numeum, CINOV, regional digital clusters.
>
> **Moat:** the network. Who answers, how fast and with which references is data nobody can scrape.

## GitHub repo

https://github.com/raphaeltm/oct-22-hack (public)

## Demo link

https://r1-app-3000-01m5hdrkrrdjwzypfyr1tmy68g.apps.simple-agent-manager.org

Demo login: `demo@rivage-numerique.fr` / `rivage-demo-2026` (fictional company
Rivage Numérique). Deck: `/hackathon`.

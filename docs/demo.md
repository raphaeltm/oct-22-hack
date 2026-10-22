# Demo: Rivage Numérique (3 minutes)

## The demo company (fictional)

**Rivage Numérique** is a Lyon-based digital services company (ESN) with about 40 staff, founded in 2015.

- **Services:** user research and service design; accessible web and mobile apps (RGAA compliance, DSFR, the French government design system); cloud migration to sovereign hosting (OVHcloud/Scaleway, SecNumCloud-aware); data dashboards and open data.
- **Customers:** French public bodies: *collectivités territoriales* (métropoles, départements, régions), public agencies and hospitals.
- **CPV codes:** 72000000 IT services · 72200000 software programming and consultancy · 72413000 website design · 72224000 IT project management consultancy · 79411000 management consultancy.
- **Past wins (fictional):** a métropole citizen-services portal redesign; a département open-data dashboard.
- **Differentiators:** RGAA/accessibility expertise, DSFR experience, open-source first, sovereign cloud, small senior team, fixed-price delivery.
- **Pain point:** two people do business development. They miss tenders on BOAMP/TED and don't know who they're bidding against.

**Setup:** run `npm run seed:demo`, then log in with **`demo@rivage-numerique.fr` / `rivage-demo-2026`**. The seed data is in `server/src/seed/rivage.ts` and `server/src/seed/demo.ts`. Competitors are **not** seeded. They come from real TED award notices (expect names like OPEN, SOFTEAM, Davidson Consulting or mc2i, but the data decides).

## Script

| Time | What you do | What the audience sees |
|---|---|---|
| 0:00–0:20 | **Hook.** "French public buyers spend well over €100bn a year. Every award is published on TED, but a 40-person agency with two salespeople can't read it all, and they bid blind." | Title slide or app login |
| 0:20–0:40 | **Log in** as the Rivage demo user. | The agent greets the user by company name and summarises the profile: services, CPV codes, regions. It already knows who they are. |
| 0:40–1:10 | *(Optional, if time allows: show onboarding on a fresh user. Type "We're a 40-person agency in Lyon doing accessible websites for local authorities". The agent saves the profile, infers CPV 72413000/72200000 and asks 1–2 follow-up questions.)* Otherwise, ask: **"What should we bid on?"** | A ranked shortlist of open TED tenders that match Rivage's CPV codes and regions, with buyer, deadline, value and one line on why each fits. |
| 1:10–1:40 | **Open a tender.** "Tell me about the first one." | A summary in English with **verbatim French quotes** of the key requirements and award criteria (e.g. *« conformité RGAA »*, *« critère prix 40 % »*), plus a go/no-go view. |
| 1:40–2:20 | **"Who are we up against?"** | A competitor brief built from real award notices: who won similar contracts from this buyer or under these CPV codes, how often, the contract values, and the incumbent if there is one. |
| 2:20–2:45 | **"How do we beat <top competitor>?"** | A bid strategy that plays Rivage's differentiators (RGAA, DSFR, sovereign cloud, fixed price) against the competitor's pattern, with concrete points for the *mémoire technique*. |
| 2:45–3:00 | **Close.** "Two salespeople now have a research team. Every claim traces back to a public TED notice." | Back to the chat, or the pitch slide |

**Backup:** if the live model is slow, have a pre-recorded thread with the same questions ready to show.

## Pitch notes

### Who the first users are
- **French and EU SME ESNs and digital agencies** (10–250 staff) that already bid on public IT and digital contracts but don't have a bid team. One or two people run business development alongside delivery.
- They feel the pain most: they miss tenders, spend days on bids they can't win, and have no view of the competition. Large integrators (Capgemini, Sopra Steria) have bid offices, but SMEs don't.
- Next: consultancies, engineering firms and any SME selling to the public sector. The pipeline works for any CPV division.

### Route to market
- **The data is the lead list.** Every TED award notice names the winner. We can list every company that won a French public IT contract in the last 2 years, with their CPV codes, buyers and contract values, and reach out with a personalised hook, e.g. "you won X at Métropole de Lyon; here are 3 open tenders like it and who you'll face".
- **Self-serve onboarding:** the agent builds the company profile from a 2-minute chat, so the user gets value before any sales call.
- **Freemium:** free tender matching, with a paid tier for competitor briefs, bid strategy and alerts. Price it per seat at SME level, well below the cost of a bid manager.
- **Channels:** French tech federations (Numeum, the CINOV network), regional digital clusters, and public-procurement training events. Expand to other EU countries next, since TED covers all of them.

### Why data plus agents
- **The data exists, but nobody reads it.** TED publishes hundreds of thousands of notices a year in eForms XML, and French notices are in French. The value is in joining tenders to awards to winners to buyers, which no SME does by hand.
- **Agents turn the data into a decision.** A search engine lists tenders. The agent knows your company, reads the French tender text, checks who won before, and tells you whether to bid and how to win.
- **The moat grows with use:** each profile, bid decision and outcome improves matching and competitor intelligence. Award history is a structured dataset that compounds over time.
- **It's trustworthy:** answers quote the original French notices and only use real award data, so the user can check every claim.

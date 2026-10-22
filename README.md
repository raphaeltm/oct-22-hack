# Cachet

**Every EU public tender, read and stamped for your firm.**

Cachet watches TED (the EU's official tender journal) for a small firm that sells to the public sector. An agent reads every new notice against the firm's profile and track record, and stamps it **BID**, **READ** or **SKIP**, with the reasons, the risks and who usually wins this kind of contract. When the team bids or passes and says why, Cachet turns those calls into rules and re-reads the shortlist, so it gets sharper with every decision.

*Cachet (French): an official seal; also, prestige.*

## Who it's for

Firms of 5–50 people (IT consultancies, digital agencies, engineering studios) that win public contracts but have no bid team. One or two people do business development alongside delivery. They miss relevant notices, spend days reading tenders they can't win, and bid without knowing who they're up against.

**First 10 users:** TED award notices name every winner, so the lead list is public data. We find every small firm that won a French public IT contract in the last two years and send it a free weekly *"tenders you missed"* digest built by Cachet, with a link to claim its radar.

## What happens in the product

1. **Onboarding in one paragraph.** Describe the firm; the agent drafts its procurement profile: CPV codes, countries, search keywords, contract size.
2. **The radar sweeps TED** every 30 minutes (or on *Sweep now*). A cheap keyword/CPV pass ranks every open notice; the agent reads the best ones and stamps them live.
3. **The dossier** for each tender: fit score, value, deadline, why it fits, what to watch out for, and **who wins this kind of work**: past award notices in the same CPV family and country, recurring winners, the median award value and the buyer's own past awards.
4. **Your call.** *We're bidding* or *Pass*, with a reason. Cachet distils the team's decisions into rules and re-scores the open shortlist. Each re-scored tender shows what changed (▼ 75, "was 80 before your calls").
5. **Bid brief.** One click: the analyst reads the notice, your track record and TED's award history, and writes a go/no-go memo, pricing guidance, a response outline backed by past bids, and next steps. Every tool call streams to the screen.
6. **Analyst chat** for anything else: "who keeps winning hospital data contracts in France?", "find RGAA audit tenders in Belgium".

## Demo (3 minutes)

| Time | Do | The audience sees |
|---|---|---|
| 0:00 | "French public buyers publish thousands of IT tenders a year on TED. A 28-person consultancy can't read them." | The radar for *Nuage & Code*: notices read, tenders to bid, € in play. |
| 0:20 | Press **Sweep now**. | The live log: TED queried, N open notices, the agent reading the best ones; stamps thump onto the list as each is scored. |
| 0:50 | Open the top **BID**. | Why it fits (citing the firm's past bids), risks, and *who wins this kind of work* from real TED award notices. |
| 1:30 | Press **Write bid brief**. | The agent's steps stream (notice → track record → TED awards), then the memo. |
| 2:10 | Open a READ with on-site work outside Paris, press **Pass**: "We don't do on-site work outside Île-de-France". | The firm page shows the rule it learned; similar tenders drop on the radar (▼, "was 80 before your calls"). |
| 2:40 | Close: "Every claim traces to a public TED notice. It gets better with every call you make." | |

Tip: run one sweep and one brief before going on stage so the data is warm.

## How it's built

```
TED v3 search API ──► watcher (every 30 min) ──► quick score ──► agent scoring ──► Postgres
                          │                                        ▲
                          └─ Valkey: seen-notice dedupe            │ learned rules
                                                                    │
Browser ◄── SSE ◄── Valkey streams ◄── live feed + agent tool calls │
   │                                                                │
   └── decisions ──► Postgres ──► rule learner ──► re-score ────────┘
```

| Aiven service | What it does in Cachet |
|---|---|
| **Aiven for PostgreSQL** | Firm profiles, track records, every TED notice seen, scores and reasoning, decisions, learned rules, sweep history, agent memory (Mastra). |
| **Aiven for Valkey** | Live event streams (radar feed and agent runs, replayable over SSE), dedupe of notices already seen per firm, 6-hour cache of TED award searches. |
| **Aiven Runtime** | Runs the app container built from this repo's `Dockerfile` / `docker-compose.yml`. |

Code: `server/` (Hono API, Mastra agents, TED client in `src/ted.ts`, radar in `src/radar.ts`), `web/` (Vite + React). Models: Claude Sonnet for briefs, chat and onboarding; Claude Haiku for bulk scoring (`SCORING_MODEL`).

## Run locally

```sh
npm install
npm run db:up                  # Postgres + Redis/Valkey via docker-compose.dev.yml
cp .env.example .env           # set ANTHROPIC_API_KEY
export $(cat .env | xargs) && npm run dev
```

Web on http://localhost:5173 (proxies `/api` to :3000). On first boot the server creates its tables and a demo firm, *Nuage & Code* (fictional, with a fictional track record; the tenders it's matched against are real TED notices).

## Deploy on Aiven Runtime

1. In the Aiven Console, open **Runtime → Deploy application**, pick this repository and the `cachet` branch, select `docker-compose.yml`, and click **Scan**.
2. Runtime maps `db` to **Aiven for PostgreSQL** and `cache` to **Aiven for Valkey** and injects `DATABASE_URL` and `VALKEY_URL` into the app. Check the detected mappings.
3. Add the secret `ANTHROPIC_API_KEY`. Optional variables: `MODEL`, `SCORING_MODEL`, `SCAN_EVERY_MIN`.
4. Deploy. The app listens on port 3000 and runs its schema migration at startup. The first TED sweep starts 5 seconds after boot.

No API key is needed for TED; Cachet calls `https://api.ted.europa.eu/v3/notices/search` directly.

## API

- `GET /api/health`: Postgres, Valkey, model and last TED sweep status
- `GET|POST /api/companies`, `GET|PUT /api/companies/:id`, `POST /api/companies/draft` (profile from a paragraph)
- `GET /api/companies/:id/matches`, `/stats`, `POST /scan`, `GET /feed` (SSE)
- `GET /api/companies/:id/tenders/:tid`, `/competition`, `POST /decision`, `POST /brief`
- `POST /api/chat`, `GET /api/threads/:id/messages`, `GET /api/threads/:id/events` (SSE)

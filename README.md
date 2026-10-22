# oct-22-hack

**An RFP research copilot.** It imports public tender (RFP) data and lets a company tell its agent about itself through chat. The agent then uses that profile to enrich the tenders and research the competitors the company is up against.

Built for the 2026-10-22 hackathon. The challenge is to build a product where agents depend on data to deliver value for a specific user. The research behind the idea is in [ideas.md](ideas.md).

## The product

**Who it's for:** small French/EU IT and AI consultancies (5–50 people) selling to the public sector. They miss relevant notices, spend days reading specifications, and struggle to judge which bids they could win. Starting with CPV division 72 (IT services) keeps the demo focused.

**First 10 users:** reach public-sector IT vendors through LinkedIn, France Digitale and local tech communities; offer a free weekly “tenders you're missing” digest.

**What it does:**

1. **Imports RFP data.** It loads tender notices, plus award data where available, from a public source into Postgres.
2. **Builds a company profile through chat.** The user tells the agent about the company: services, sectors, regions, size, past wins and differentiators. The agent stores this as long-term memory and refines it over time.
3. **Augments tenders.** The agent enriches the imported tenders with tags, summaries and a fit score against the company profile.
4. **Researches competitors.** For a tender or sector, the agent combines Keenable web search with award data to find likely competitors. It summarises their strengths, recent wins and positioning compared with the user's company, and saves the findings for reuse.

**Target demo flow:** onboard a company in chat → see matching tenders → pick one → get a competitor brief.

## Data and demo scope

Start with TED notices for **France (`buyer-country=FRA`), CPV 72*, published from 2025 onward**. Tender text is in French. Past award winners provide the starting set of competitors; Keenable search + Claude enrich their profiles. A past win is evidence of relevant experience, not proof that a company will bid on a new tender.

| Source | Role | Scope |
| --- | --- | --- |
| TED Search API v3 | Import tender notices and contract awards | Primary source for the MVP |
| TED bulk XML | Backfill history or prepare a reproducible demo dataset | Fallback if live imports are unreliable |
| TED Open Data Service (SPARQL) | Cross-notice analysis of winners and prices | Future exploration |
| BOAMP / DECP | Add French national notices and awarded contracts | Future expansion; integration still needs verification |

**Demo company:** *Rivage Numérique*, a fictional Lyon digital consultancy specialising in RGAA accessibility, DSFR, sovereign cloud and collectivités.

**Demo story:** describe Rivage Numérique in chat → inspect matching French IT tenders and the reasons for each match → select one → review past award winners and a sourced competitor brief. Compare the time needed to qualify a tender manually with the assisted workflow. Any counts, fit scores or time savings shown must come from the actual demo run.

**Later radar features:** scheduled monitoring, document qualification, first-pass response drafting, and bid / skip / won / lost feedback. The hackathon focuses on one research workflow end to end.

## Stack

The scope is deliberately small so it can ship in about 5 hours.

| Layer | Choice |
| --- | --- |
| Agent | [Mastra](https://mastra.ai) + Claude (Anthropic API) |
| Web search | Keenable API |
| Data | **Postgres for everything**: tenders, company profiles, agent memory, competitor research, and pgvector if we need embeddings |
| Realtime / cache | Redis Streams for chat run events, streamed to the UI over SSE. Also available for search-result caching or background jobs if we need them |
| API | Hono (`server/`) |
| UI | Vite + React chat (`web/`) |
| Infra | Docker Compose, both locally and for deploys |

**Current deployment:** Docker Compose with Postgres and Redis. OpenSearch, ClickHouse, Kafka and managed Aiven services are outside the current implementation; moving services to Aiven remains a deployment option. Postgres provides tender search and stores the research data for this build.

```
server/   Hono API + Mastra agent (src/mastra)
web/      Vite + React chat UI
```

## Local dev

```sh
npm install
npm run db:up            # local Postgres + Redis via docker-compose.dev.yml
cp .env.example .env     # set ANTHROPIC_API_KEY
export $(cat .env | xargs) && npm run dev
```

The web app runs on http://localhost:5173 and proxies `/api` to the server on :3000.
Without `ANTHROPIC_API_KEY`, the chat endpoint returns a stub reply.

## API

What exists today:

- `GET  /api/health`
- `POST /api/chat` `{ threadId, message, messageId? }` → `202 { runId }`. The output arrives on the event stream.
- `GET  /api/threads/:threadId/messages` returns the persisted history (Postgres via Mastra memory).
- `GET  /api/threads/:threadId/events` is an SSE feed of the thread's Redis Stream (`thread:<id>:events`).
  Events: `user.message`, `run.started`, `text.delta`, `run.finished`, `run.error`.
  It resumes via `Last-Event-ID` or `?since=<stream id>`; `0` replays everything still retained.

## Roadmap (hackathon)

The product flow above is the target; unchecked items below are still planned.

- [x] Skeleton: Mastra agent + Postgres memory, Hono API, React chat UI
- [x] Redis Streams event log with SSE realtime updates
- [x] Drizzle schema and migrations: tenders, companies, organisations, awards, research notes and tender matches
- [ ] RFP importer: load a sample dataset from one public source into `tenders`
- [ ] Agent tool: save and update the company profile from chat
- [ ] Agent tool: search and filter imported tenders, and match them to the profile
- [ ] Agent tool: Keenable search for competitor research, with results saved to Postgres
- [ ] UI: tender list and competitor brief view alongside the chat
- [ ] Demo script and a seeded demo company

## Demo checklist

- Show a specific customer and a complete profile → tender → competitor brief workflow.
- Show source evidence for matches and competitor claims.
- Measure a before/after result from the demo, such as qualification time or relevant tenders found.
- Explain the role of Postgres and Redis and the path to managed services.
- Explain how the weekly digest reaches the first 10 users.

## Deploy

`docker-compose.yml` is the production stack (app + Postgres + Redis), deployed with SAM `build_and_publish` to the `staging` environment.
Config: `ANTHROPIC_API_KEY` and `POSTGRES_PASSWORD` are secrets, and `MODEL` is a variable. `KEENABLE_API_KEY` will be added once search is wired up.

# oct-22-hack

**An RFP research copilot.** It imports public tender (RFP) data and lets a company tell its agent about itself through chat. The agent then uses that profile to enrich the tenders and research the competitors the company is up against.

Built for the 2026-10-22 hackathon. The challenge is to build a product where agents depend on data to deliver value for a specific user. The research behind the idea is in [ideas.md](ideas.md).

## The product

**Who it's for:** small and mid-sized firms such as consultancies, agencies and construction companies. They bid on public tenders but can't afford a bid team to track notices or research competitors.

**What it does:**

1. **Imports RFP data.** It loads tender notices, plus award data where available, from a public source into Postgres.
2. **Builds a company profile through chat.** The user tells the agent about the company: services, sectors, regions, size, past wins and differentiators. The agent stores this as long-term memory and refines it over time.
3. **Augments tenders.** The agent enriches the imported tenders with tags, summaries and a fit score against the company profile.
4. **Researches competitors.** For a tender or sector, the agent combines Keenable web search with award data to find likely competitors. It summarises their strengths, recent wins and positioning compared with the user's company, and saves the findings for reuse.

**Target demo flow:** onboard a company in chat → see matching tenders → pick one → get a competitor brief.

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

**Out of scope for now:** ClickHouse and Kafka, which are overkill for the timeframe, and Aiven managed services. Everything runs in Docker Compose, and the Postgres and Redis services can move to Aiven later.

```
server/   Hono API + Mastra agent (src/mastra)
web/      Vite + React chat UI
```

## Local dev

```sh
npm install
npm run db:up            # local Postgres + Redis via docker-compose.dev.yml
cp .env.example .env     # set ANTHROPIC_API_KEY (and KEENABLE_API_KEY once search is wired up)
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

- [x] Skeleton: Mastra agent + Postgres memory, Hono API, React chat UI
- [x] Redis Streams event log with SSE realtime updates
- [ ] Postgres schema: `tenders`, `companies`, `competitors`, `research_notes`
- [ ] RFP importer: load a sample dataset from one public source into `tenders`
- [ ] Agent tool: save and update the company profile from chat
- [ ] Agent tool: search and filter imported tenders, and match them to the profile
- [ ] Agent tool: Keenable search for competitor research, with results saved to Postgres
- [ ] UI: tender list and competitor brief view alongside the chat
- [ ] Demo script and a seeded demo company

## Deploy

`docker-compose.yml` is the production stack (app + Postgres + Redis), deployed with SAM `build_and_publish` to the `staging` environment.
Config: `ANTHROPIC_API_KEY` and `POSTGRES_PASSWORD` are secrets, and `MODEL` is a variable. `KEENABLE_API_KEY` will be added once search is wired up.

# oct-22-hack

**An RFP research copilot.** It imports public tender (RFP) data, lets a company tell its agent who it is, and then finds and analyses competitors for the tenders that matter to that company.

Built for the 2026-10-22 hackathon. The challenge is to build a product where agents depend on data to deliver value for a specific user. The research behind the idea is in [ideas.md](ideas.md).

## The product

**Who it's for:** small and mid-sized firms such as consultancies, agencies and construction companies. They bid on public tenders but can't afford a bid team to track notices or research who they're up against.

**What it does:**

1. **Imports RFP data.** It loads tender notices, and award data where available, from public sources into Postgres.
2. **Builds a company profile through chat.** The user tells their agent about the company: services, sectors, regions, past wins, size and differentiators. The agent stores this as long-term memory and refines it over time.
3. **Augments tenders.** The agent enriches the imported tenders by tagging them, summarising them and scoring them against the company profile.
4. **Researches competitors.** For a given tender or sector, the agent uses Keenable web search plus past award data to find likely competitors. It then summarises their strengths, recent wins and positioning compared with the user's company.

**Demo flow (target):** onboard a company in chat → see the tenders that match → pick one → get a competitor brief.

## Stack

Scope is deliberately small so it can ship in about 5 hours.

| Layer | Choice |
| --- | --- |
| Agent | [Mastra](https://mastra.ai) + Claude (Anthropic API) |
| Web search | Keenable API |
| Data | **Postgres for everything**: tenders, company profiles, agent memory, competitor research, and pgvector if we need embeddings |
| Cache / queues | Redis, *maybe*, only if we need it (e.g. search result caching, background jobs) |
| API | Hono (`server/`) |
| UI | Vite + React chat (`web/`) |
| Infra | Docker Compose (local and deploy) |

**Out of scope for now:** ClickHouse and Kafka, which are overkill for the timeframe, and Aiven managed services. We run everything in Docker Compose and can move to Aiven later.

```
server/   Hono API + Mastra agent (src/mastra)
web/      Vite + React chat UI
```

## Local dev

```sh
npm install
npm run db:up            # local Postgres via docker-compose.dev.yml
cp .env.example .env     # set ANTHROPIC_API_KEY (and KEENABLE_API_KEY once wired up)
export $(cat .env | xargs) && npm run dev
```

The web app runs on http://localhost:5173 and proxies `/api` to the server on :3000.
Without `ANTHROPIC_API_KEY`, the chat endpoint returns a stub reply.

## API

What exists today:

- `GET  /api/health`
- `POST /api/chat` `{ threadId, message }` → streamed text
- `GET  /api/threads/:threadId/messages`

## Roadmap (hackathon)

- [x] Skeleton: Mastra agent + Postgres memory, Hono API, React chat UI
- [ ] Postgres schema: `tenders`, `companies`, `competitors`, `research_notes`
- [ ] RFP importer: load a sample dataset from one public source into `tenders`
- [ ] Agent tool: save and update the company profile from chat
- [ ] Agent tool: search and filter imported tenders, and match them to the profile
- [ ] Agent tool: Keenable search for competitor research, with results saved to Postgres
- [ ] UI: tender list and competitor brief view alongside the chat
- [ ] Demo script and seeded demo company

## Deploy

`docker-compose.yml` is the production stack (app + Postgres).
Config: `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD` (secrets), `MODEL` (variable). `KEENABLE_API_KEY` will be added once search is wired up.

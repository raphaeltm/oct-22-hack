# Ideas

## Hackathon context

**Challenge:** Build a working product where one or more agents rely on data to deliver value for a specific user. That could mean:

- querying large datasets
- reacting to event streams
- keeping long-term memory
- combining many sources
- improving over time from past runs

We choose the customer and the problem. Any models, frameworks, and tools are allowed.

**Requirements:**

- Deploy the app to the sponsor **Aiven's Runtime**.
- Use Aiven's managed data infrastructure for the data layer where relevant (PostgreSQL, ClickHouse, Valkey, OpenSearch, and more). Every team gets free credits.

**Judging:** Strong teams need more than code. Product thinking, design, and a credible route to first users all count.

## How the RFP space fits the challenge

RFP work is a good fit because the value comes almost entirely from data: past proposals, company knowledge, live tender feeds, and win/loss history.

| Challenge theme            | RFP angle                                                                         | Possible Aiven service       |
| -------------------------- | --------------------------------------------------------------------------------- | ---------------------------- |
| Querying large datasets    | Search and analyze public tender and award data (spend, buyers, competitors)      | ClickHouse                   |
| Reacting to event streams  | Watch tender feeds and alert or triage when a relevant opportunity is published   | Kafka, Valkey                |
| Long-term memory           | Company knowledge base of past answers, case studies, certifications              | PostgreSQL (pgvector)        |
| Combining many sources     | Merge tenders, company docs, and competitor and buyer history into one bid brief  | OpenSearch, PostgreSQL       |
| Improving from past runs   | Learn from win/loss outcomes and reviewer edits to improve future drafts          | PostgreSQL                   |

### Candidate product directions

- **European tender copilot for small firms.** This targets the gap noted below. An agent monitors EU tender feeds (e.g. TED), scores fit against a company profile, and drafts a go/no-go brief plus a first response grounded in the firm's past bids. Route to first users: small consultancies and agencies that can't afford a bid team.
- **Security questionnaire / due-diligence responder.** A narrower version of the Dialect-style problem. The knowledge base is reused across questionnaires, and the agent flags stale or conflicting answers. Easy to demo, and the buyer is clear.
- **Buyer-side RFP evaluator.** A Hazel-style tool for smaller public bodies or companies. It scores incoming proposals against requirements and explains each score.

### Open questions

- Which customer can we actually reach for feedback or first users during or after the hackathon?
- Which public data source is easiest to ingest quickly (e.g. TED API, Contracts Finder, SAM.gov)?
- What's the smallest demo that shows the agent clearly *depends on data* and gets better with it?

## RFP space: interesting YC companies

The market breaks into three segments: **responding** to RFPs, **issuing and evaluating** RFPs, and **finding** contract opportunities. Some companies build AI proposal writers; others try to replace larger parts of the procurement workflow.

### 1. RFP response automation

- **Inventive AI** (YC S23): AI-powered enterprise RFP responses. Generates proposal drafts grounded in internal documents, past responses, and connected knowledge repositories. Its AI content manager flags conflicting or outdated knowledge before it gets reused.
- **GovEagle** (YC W23): Government RFP proposal automation. Parses complex federal solicitations, extracts requirements, builds compliance matrices, and drafts proposals from historical submissions. Handles government document structures in more depth than a generic AI writer.
- **GovDash** (YC W22): Government contracting lifecycle platform. Covers opportunity capture, proposal development, and post-award contract execution. Closer to an end-to-end operating system for government contractors.
- **Dialect**: RFPs, due diligence, and security questionnaires. Drafts responses from organizational knowledge. These adjacent workflows all have the same knowledge-retrieval problem.

### 2. RFP creation and procurement management (buyer side)

- **Hazel** (YC W24): AI procurement for government agencies. Helps agencies develop requirements, generate solicitations, research vendors, and evaluate proposals. It works on how RFPs are created and assessed, not just answered.
- **Procoto** (YC W21, acquired): Self-service RFP management, contract tracking, and vendor management. Pitched as lightweight procurement software for businesses that didn't want the complexity of SAP or Coupa.
- **Bonfire** (YC W15, acquired, Canada): Competitive bidding and RFx software for government procurement. Strong in structured supplier evaluation and collaborative procurement decisions. A useful older benchmark for the market.

### 3. Bid discovery and government contracting intelligence

- **Usul** (YC S24): Uses AI to find relevant government contracts across 60+ countries. Also analyzes spending, buyers, and competing contractors. Focused on opportunity intelligence rather than document generation.
- **Govly** (YC S21): Centralizes government solicitations, sends opportunity alerts, and lets contractors collaborate on bids with partners. Network and marketplace dynamics around procurement.
- **Capto** (YC S26, recently launched Chromie): AI operating system for government contractors, covering pre-RFP opportunity discovery, relationship intelligence, win-strategy testing, and proposal drafting. Notable for keeping persistent organizational knowledge.

### Where to focus

| Company         | What makes it interesting                                    | Focus                       |
| --------------- | ------------------------------------------------------------ | --------------------------- |
| Inventive AI    | RAG, organizational knowledge, response agents               | RFP responses               |
| GovEagle        | Document parsing, compliance extraction, proposal generation | Federal RFPs                |
| Hazel           | Automating the buyer's side of procurement                   | RFP creation and evaluation |
| GovDash         | Expanding from AI proposal writing to a contracting platform | Full lifecycle              |
| Capto / Chromie | Persistent company intelligence and pre-RFP strategy         | Agentic contracting         |
| Usul            | International procurement intelligence                       | Bid discovery               |

**Top three to investigate first:** Inventive AI, Hazel, and GovEagle. Each tackles a different technical problem:

- grounding responses in enterprise knowledge
- generating and evaluating solicitations
- meeting strict proposal compliance requirements

### Possible gap

The YC landscape is heavily concentrated in U.S. federal contracting. There may be room for products focused on:

- European public procurement
- Cross-border tenders
- Smaller professional-services firms

(This needs a separate competitive analysis.)

See also: YC's procurement startup directory for adjacent companies.

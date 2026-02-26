## Superintent Config

- Namespace: superintent-cli
- Database: Local SQLite (`.superintent/local.db`)

Always search knowledge before exploring the codebase — it is the primary source of truth. All `--json` flags accept inline JSON input.

<!-- superintent:knowledge:start -->

### Key Facts
- **CLI Commands Reference** — 8 commands: init, status, ticket, knowledge, spec, search, extract, dashboard; all output JSON via `CliResponse<T>` (`KNOWLEDGE-20260215-113719412`)
- **Database Schema and Configuration** — 4 tables (tickets, knowledge w/ F32_BLOB vectors, specs, comments); config via .superintent/.env with TURSO_URL/TURSO_AUTH_TOKEN (`KNOWLEDGE-20260215-113629621`)
- **All CLI Commands Use JSON Flag** — All create/update via `--json <data>` accepting inline JSON; replaced markdown parsers (`KNOWLEDGE-20260215-165720482`)

### Architecture
- **Project Overview** — libSQL-backed CLI plugin for ticket management, knowledge with vector search, and feature specs; Hono+HTMX web UI on port 3456 (`KNOWLEDGE-20260215-113610232`)
- **Source Code Architecture** — Modular TypeScript under src/: commands/, db/, embed/, ui/components/, ui/routes/, utils/; lazy DB singleton, timestamp IDs, JSON --json input (`KNOWLEDGE-20260215-113619989`)
- **Ticket System Design** — Structured tickets with status lifecycle (Backlog→Done), auto type inference, plan/tasks/DoD, knowledge extraction on completion (`KNOWLEDGE-20260215-113645961`)
- **Knowledge Base and Semantic Search** — RAG store with 384-dim embeddings (bge-small-en-v1.5), vector_top_k with cosine distance, CLS pooling, query prefix required (`KNOWLEDGE-20260215-113657488`)
- **Web UI Architecture** — Hono server-rendered HTML + HTMX partials via `npx superintent dashboard`; Tailwind v4; 6 tabs: Dashboard, Specs, Tickets, Knowledge, Graph, Wiki; SSE real-time updates (`KNOWLEDGE-20260215-113709412`)
- **Knowledge Graph Tab Architecture** — vis-network graph of knowledge entries connected by shared tags; 5th tab with lazy loading via IntersectionObserver (`KNOWLEDGE-20260216-153549336`)
- **SSE Real-Time Update Architecture** — EventSource at /api/events with 4 event types (ticket/knowledge/spec/wiki-updated); DB change watcher polls every 2s for external changes (`KNOWLEDGE-20260216-143020427`)
- **Polymorphic Comments Table** — Dedicated comments table supporting tickets, specs, and knowledge; polymorphic parent_type FK (`KNOWLEDGE-20260215-122855570`)
- **Ticket to Knowledge Extraction Pipeline** — Completed tickets → extract proposals → AI review → knowledge entries with back-reference (`KNOWLEDGE-20260215-114409912`)
- **superintent:maintain Skill** — Distills active knowledge into CLAUDE.md between markers; scores by confidence/usage/category/recency (`KNOWLEDGE-20260215-122823869`)
- **Vector Search Consolidated in search.ts** — Single `performVectorSearch()` entry point for CLI and UI; indexed search with non-indexed fallback (`KNOWLEDGE-20260215-122836772`)
- **embed() LRU Cache** — In-memory Map cache (max 100 entries ~150KB) for query embeddings; LRU eviction, no TTL needed (deterministic) (`KNOWLEDGE-20260215-122841968`)
- **Git Identity & Branch Provenance** — author/branch auto-populated on all entities; `--branch-auto` searches main + current branch; `promote` sets branch to 'main' (`KNOWLEDGE-20260215-122901118`)
- **Web UI Pagination: 12 Per Page with Load More** — LIMIT N+1 to detect hasMore; Load More uses hx-swap="outerHTML"; filter reset resets offset via hx-swap="innerHTML" on container (`KNOWLEDGE-20260215-122848212`)
- **Dashboard Tab & Widget Architecture** — First tab; modular widget registry (WidgetDefinition); add widget by creating file in widgets/ and registering — no route/layout changes needed (`KNOWLEDGE-20260219-050543841`)
- **Dark Mode Implementation with Tailwind v4** — Three-way Light/Dark/System toggle; `@custom-variant dark` in main.css; `.dark` on `<html>`; localStorage.theme; anti-FOUC inline script in `<head>` (`KNOWLEDGE-20260218-184030761`)
- **Complete API Surface Audit — All 52 Routes** — Routes in src/ui/server.ts (createApp) + src/ui/routes/ modules; 3 page, 22 API (/api/*), 28+ partial (/partials/*); covers tickets, knowledge, specs, comments, wiki, SSE, graph (`KNOWLEDGE-20260220-172601715`)
- **Knowledge Citations Data Model** — Citations are `{path, fileHash}` JSON on knowledge entries; provenance links to source files; hash detects drift when source evolves (`KNOWLEDGE-20260223-103800027`)

### Patterns
- **HTMX Modal Edit-Save Pattern** — Form targets `#modal-content` to stay open after save; API returns detail view HTML + `HX-Trigger: refresh` for background updates (`KNOWLEDGE-20260215-122833218`)
- **Dark Mode Color Palette Mapping Pattern** — bg-white→dark:bg-gray-900 (body), cards→dark:bg-gray-800; colored badges: bg-{color}-100 dark:bg-{color}-900/30; apply consistently across all components (`KNOWLEDGE-20260218-184044403`)
- **Health Check Endpoint on Web UI Server** — `GET /health` in `src/ui/server.ts` (createApp); startTime at app creation; returns {status:'ok', uptimeSeconds, version, timestamp}; no auth, no DB queries (`KNOWLEDGE-20260218-174318272`)

### Gotchas
- **Mutex Crash on CLI Shutdown** — Never call `process.exit()` directly with active native modules; close HTTP server → DB client → exit in sequence (`KNOWLEDGE-20260215-122735114`)
- **Always wrap getClient/closeClient in try/finally** — Prevents silent resource leak if operations between getClient and closeClient throw (`KNOWLEDGE-20260215-122757494`)
- **Always Alias Knowledge Table as k** — Use `FROM knowledge k` in both indexed and fallback search paths so filter conditions share `k.` prefix (`KNOWLEDGE-20260215-122741768`)
- **libSQL vector_top_k No ? Binding for topK** — The topK argument is parsed at query planning time; validate/clamp before string interpolation, parameterize everything else (`KNOWLEDGE-20260215-122747782`)
- **bge-small-en-v1.5 requires query prefix and CLS pooling** — Query embeddings must be prefixed; documents must NOT; use model_quantized for 32MB variant (`KNOWLEDGE-20260216-084012714`)
- **Dynamic Tailwind Classes Need Safelist for Dark Variants** — Template-literal classes (dark:bg-${color}-900/20) get purged; add `@source inline(...)` safelist in main.css for every dynamic dark: pattern (`KNOWLEDGE-20260218-184056007`)
- **Silent DB defaults hide missing data** — DB DEFAULT 'global' for decision_scope made missing scope invisible; validate required fields in parser, not just schema defaults (`KNOWLEDGE-20260215-122804080`)
- **jsPDF Built-in Fonts Cannot Render Unicode Characters** — WinAnsiEncoding only; use sanitizePdf() to map →, —, ✓ etc. to ASCII equivalents before passing to jsPDF (`KNOWLEDGE-20260216-065351828`)
- **validateCitation sync/async** — Use `validateCitationAsync()` in Hono server code (src/ui/routes/shared.ts); sync variant only in CLI (short-lived processes); avoids blocking the event loop (`KNOWLEDGE-20260224-180241138`)

<!-- superintent:knowledge:end -->

### Setup Commands

| Command                   | Description            |
| ------------------------- | ---------------------- |
| `npx superintent init [--url <url>]`   | Create database tables |
| `npx superintent status` | Check Turso connection |
| `npx superintent dashboard [-p <port>] [-o]` | Start dashboard (default port 3456, -o to auto-open browser) |

### Ticket Operations

| Action | Command |
| --- | --- |
| Create | `npx superintent ticket create --json <data>` (JSON: `{"title","intent","type","context","constraints","assumptions","changeClass","plan",[...]}`) |
| Get | `npx superintent ticket get <id>` |
| Preview | `npx superintent ticket preview <id>` |
| Update | `npx superintent ticket update <id> [--json <data>] [--status] [--complete-all] [--complete-task <indices>] [--complete-dod <indices>] [--comment <text>] [--author <name>] [--context <context>] [--spec <spec-id>]` |
| List | `npx superintent ticket list [--status <status>] [--limit N]` |
| Delete | `npx superintent ticket delete <id>` |

### Spec Operations

| Action | Command |
| --- | --- |
| Create | `npx superintent spec create --json <data>` (JSON: `{"title","content","author"}`) |
| Get | `npx superintent spec get <id>` |
| Preview | `npx superintent spec preview <id>` |
| List | `npx superintent spec list [--limit N]` |
| Update | `npx superintent spec update <id> [--json <data>] [--title] [--comment <text>] [--author <name>]` |
| Delete | `npx superintent spec delete <id>` |

### Knowledge Operations

| Action | Command |
| --- | --- |
| Search | `npx superintent knowledge search "<query>" [--limit N] [--namespace] [--category] [--ticket-type] [--tags] [--author] [--branch] [--branch-auto] [--min-score]` |
| Extract | `npx superintent knowledge extract <ticket-id> [--namespace <namespace>]` |
| Create | `npx superintent knowledge create --json <data>` (JSON: `{"title","namespace","content","category","source","confidence","scope","tags",[...]}`) |
| Get | `npx superintent knowledge get <id>` |
| Preview | `npx superintent knowledge preview <id>` |
| List | `npx superintent knowledge list [--namespace] [--category] [--scope] [--source] [--author] [--branch] [--branch-auto] [--status active\|inactive\|all] [--limit N]` |
| Update | `npx superintent knowledge update <id> [--json <data>] [--title] [--namespace] [--category] [--tags] [--scope] [--origin] [--confidence] [--comment <text>] [--author <name>]` |
| Activate | `npx superintent knowledge activate <id>` |
| Deactivate | `npx superintent knowledge deactivate <id>` |
| Promote | `npx superintent knowledge promote <id>` |
| Validate | `npx superintent knowledge validate <id>[,<id2>,...] [--all]` |
| Recalculate | `npx superintent knowledge recalculate [--dry-run]` |

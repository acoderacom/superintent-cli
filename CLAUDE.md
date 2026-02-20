## Superintent Config

- Namespace: superintent-cli
- Database: Local SQLite (`.superintent/local.db`)

Always search knowledge before exploring the codebase — it is the primary source of truth. All `--stdin` flags expect JSON input.

<!-- superintent:knowledge:start -->

### Key Facts
- **CLI Commands Reference** — 6 top-level commands: init, status, ticket, knowledge, spec, ui; search and extract are subcommands of knowledge; all output JSON via `CliResponse<T>` (`KNOWLEDGE-20260215-113719412`)
- **Database Schema and Configuration** — 4 tables (tickets, knowledge w/ F32_BLOB vectors, specs, comments); config via .superintent/.env with TURSO_URL/TURSO_AUTH_TOKEN (`KNOWLEDGE-20260215-113629621`)
- **All CLI Commands Use JSON Stdin** — All create/update via `--stdin` accepting JSON; replaced markdown parsers (`KNOWLEDGE-20260215-165720482`)

### Architecture
- **Project Overview** — libSQL-backed CLI plugin for ticket management, knowledge with vector search, and feature specs; Hono+HTMX web UI on port 3456 (`KNOWLEDGE-20260215-113610232`)
- **Source Code Architecture** — Modular TypeScript under src/: commands/, db/, embed/, ui/components/, utils/; lazy DB singleton, timestamp IDs, JSON stdin input (`KNOWLEDGE-20260215-113619989`)
- **Ticket System Design** — Structured tickets with status lifecycle (Backlog→Done), auto type inference, plan/tasks/DoD, knowledge extraction on completion (`KNOWLEDGE-20260215-113645961`)
- **Knowledge Base and Semantic Search** — RAG store with 384-dim embeddings (bge-small-en-v1.5), vector_top_k with cosine distance, CLS pooling, query prefix required (`KNOWLEDGE-20260215-113657488`)
- **Web UI Architecture** — Hono server-rendered HTML + HTMX partials; Tailwind v4; 4 tabs: Tickets, Knowledge, Specs, Graph; SSE real-time updates (`KNOWLEDGE-20260215-113709412`)
- **Knowledge Graph Tab Architecture** — vis-network graph of knowledge entries connected by shared tags; 4th tab with lazy loading via IntersectionObserver (`KNOWLEDGE-20260216-153549336`)
- **SSE Real-Time Update Architecture** — EventSource at /api/events with 3 event types; DB change watcher polls every 2s for external changes (`KNOWLEDGE-20260216-143020427`)
- **Polymorphic Comments Table** — Dedicated comments table supporting tickets, specs, and knowledge; polymorphic parent_type FK (`KNOWLEDGE-20260215-122855570`)
- **Ticket to Knowledge Extraction Pipeline** — Completed tickets → extract proposals → AI review → knowledge entries with back-reference (`KNOWLEDGE-20260215-114409912`)
- **superintent:maintain Skill** — Distills active knowledge into CLAUDE.md between markers; scores by confidence/usage/category/recency (`KNOWLEDGE-20260215-122823869`)
- **Vector Search Consolidated in search.ts** — Single `performVectorSearch()` entry point for CLI and UI; indexed search with non-indexed fallback (`KNOWLEDGE-20260215-122836772`)
- **embed() LRU Cache** — In-memory Map cache (max 100 entries ~150KB) for query embeddings; LRU eviction, no TTL needed (deterministic) (`KNOWLEDGE-20260215-122841968`)

### Patterns
- **HTMX Modal Edit-Save Pattern** — Form targets `#modal-content` to stay open after save; API returns detail view HTML + `HX-Trigger: refresh` for background updates (`KNOWLEDGE-20260215-122833218`)

### Gotchas
- **Mutex Crash on CLI Shutdown** — Never call `process.exit()` directly with active native modules; close HTTP server → DB client → exit in sequence (`KNOWLEDGE-20260215-122735114`)
- **Always wrap getClient/closeClient in try/finally** — Prevents silent resource leak if operations between getClient and closeClient throw (`KNOWLEDGE-20260215-122757494`)
- **Always Alias Knowledge Table as k** — Use `FROM knowledge k` in both indexed and fallback search paths so filter conditions share `k.` prefix (`KNOWLEDGE-20260215-122741768`)
- **libSQL vector_top_k No ? Binding for topK** — The topK argument is parsed at query planning time; validate/clamp before string interpolation, parameterize everything else (`KNOWLEDGE-20260215-122747782`)
- **bge-small-en-v1.5 requires query prefix and CLS pooling** — Query embeddings must be prefixed; documents must NOT; use model_quantized for 32MB variant (`KNOWLEDGE-20260216-084012714`)

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
| Create | `npx superintent ticket create --stdin` (JSON: `{"title","intent","type","context","constraints","assumptions","changeClass","plan",[...]}`) |
| Get | `npx superintent ticket get <id>` |
| Preview | `npx superintent ticket preview <id>` |
| Update | `npx superintent ticket update <id> [--stdin] [--status] [--complete-all] [--complete-task <indices>] [--complete-dod <indices>] [--comment <text>] [--author <name>] [--context <context>] [--spec <spec-id>]` |
| List | `npx superintent ticket list [--status <status>] [--limit N]` |
| Delete | `npx superintent ticket delete <id>` |

### Spec Operations

| Action | Command |
| --- | --- |
| Create | `npx superintent spec create --stdin` (JSON: `{"title","content","author"}`) |
| Get | `npx superintent spec get <id>` |
| Preview | `npx superintent spec preview <id>` |
| List | `npx superintent spec list [--limit N]` |
| Update | `npx superintent spec update <id> [--stdin] [--title] [--comment <text>] [--author <name>]` |
| Delete | `npx superintent spec delete <id>` |

### Knowledge Operations

| Action | Command |
| --- | --- |
| Search | `npx superintent knowledge search "<query>" [--limit N] [--namespace] [--category] [--ticket-type] [--tags] [--author] [--branch] [--branch-auto] [--min-score]` |
| Extract | `npx superintent knowledge extract <ticket-id> [--namespace <namespace>]` |
| Create | `npx superintent knowledge create --stdin` (JSON: `{"title","namespace","content","category","source","confidence","scope","tags",[...]}`) |
| Get | `npx superintent knowledge get <id>` |
| Preview | `npx superintent knowledge preview <id>` |
| List | `npx superintent knowledge list [--namespace] [--category] [--scope] [--source] [--author] [--branch] [--branch-auto] [--status active\|inactive\|all] [--limit N]` |
| Update | `npx superintent knowledge update <id> [--stdin] [--title] [--namespace] [--category] [--tags] [--scope] [--origin] [--confidence] [--comment <text>] [--author <name>]` |
| Activate | `npx superintent knowledge activate <id>` |
| Deactivate | `npx superintent knowledge deactivate <id>` |
| Promote | `npx superintent knowledge promote <id>` |
| Recalculate | `npx superintent knowledge recalculate [--dry-run]` |

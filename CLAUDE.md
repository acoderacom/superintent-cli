## Superintent Config

- Namespace: superintent-cli
- Database: Local SQLite (`.superintent/local.db`)

Before exploring the codebase, always run `npx superintent search` first — stored knowledge is the primary source of truth. Specs describe features only; never include tickets inside a spec. All `--stdin` flags expect JSON input.

<!-- superintent:knowledge:start -->

### Key Facts
- **CLI Commands Reference** — 8 commands: init, status, ticket, knowledge, search, extract, spec, ui; all output JSON (`KNOWLEDGE-20260210-120039`)
- **Database Schema and Configuration** — 3 tables (tickets, knowledge w/ F32_BLOB vectors, specs); config via .superintent/.env with TURSO_URL/TURSO_AUTH_TOKEN (`KNOWLEDGE-20260210-120031`)

### Architecture
- **Project Overview** — libSQL-backed CLI plugin for ticket management, knowledge with vector search, and feature specs; Hono+HTMX web UI on port 3456 (`KNOWLEDGE-20260210-115927`)
- **Source Code Architecture** — Modular TypeScript under src/: commands/, db/, embed/, ui/components/, utils/; lazy DB singleton, timestamp IDs, markdown parsing (`KNOWLEDGE-20260210-115938`)
- **Ticket System Design** — Structured tickets with status lifecycle (Backlog→Done), auto type inference, plan/tasks/DoD, knowledge extraction on completion (`KNOWLEDGE-20260210-115951`)
- **Knowledge Base and Semantic Search** — RAG store with 384-dim embeddings (all-MiniLM-L6-v2), vector_top_k with cosine distance, confidence recalculation, usage tracking (`KNOWLEDGE-20260210-120004`)
- **Web UI Architecture** — Hono server-rendered HTML + HTMX partials; Tailwind v4 local build; 4 tabs: Kanban, Search, Knowledge, Specs; auto-refresh polling (`KNOWLEDGE-20260210-120021`)
- **superintent:maintain Skill** — Distills active knowledge into CLAUDE.md between markers; scores by confidence/usage/category/recency (`KNOWLEDGE-20260210-122405`)
- **Vector Search Consolidated in search.ts** — Single `performVectorSearch()` entry point for CLI and UI; indexed search with non-indexed fallback (`KNOWLEDGE-20260213-194537`)
- **embed() LRU Cache** — In-memory Map cache (max 100 entries ~150KB) for query embeddings; LRU eviction, no TTL needed (deterministic) (`KNOWLEDGE-20260213-203646`)

### Patterns
- **HTMX Modal Edit-Save Pattern** — Form targets `#modal-content` to stay open after save; API returns detail view HTML + `HX-Trigger: refresh` for background updates (`KNOWLEDGE-20260211-224412`)

### Gotchas
- **Mutex Crash on CLI Shutdown** — Never call `process.exit()` directly with active native modules; close HTTP server → DB client → exit in sequence (`KNOWLEDGE-20260210-181221`)
- **Always Alias Knowledge Table as k** — Use `FROM knowledge k` in both indexed and fallback search paths so filter conditions share `k.` prefix (`KNOWLEDGE-20260213-194542`)
- **libSQL vector_top_k No ? Binding for topK** — The topK argument is parsed at query planning time; validate/clamp before string interpolation, parameterize everything else (`KNOWLEDGE-20260213-202009`)

<!-- superintent:knowledge:end -->

### Setup Commands

| Command                   | Description            |
| ------------------------- | ---------------------- |
| `npx superintent init`   | Create database tables |
| `npx superintent status` | Check Turso connection |
| `npx superintent ui`     | Start web UI           |

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
| Search | `npx superintent search "<query>" [--limit N] [--namespace] [--category] [--ticket-type] [--tags] [--author] [--branch] [--min-score]` |
| Extract | `npx superintent extract <ticket-id>` |
| Create | `npx superintent knowledge create --stdin` (JSON: `{"title","namespace","content","category","source","confidence","scope","tags",[...]}`) |
| Get | `npx superintent knowledge get <id>` |
| Preview | `npx superintent knowledge preview <id>` |
| List | `npx superintent knowledge list [--namespace] [--category] [--scope] [--source] [--author] [--branch] [--status active\|inactive\|all] [--limit N]` |
| Update | `npx superintent knowledge update <id> [--stdin] [--title] [--namespace] [--category] [--tags] [--scope] [--origin] [--confidence] [--comment <text>] [--author <name>]` |
| Activate | `npx superintent knowledge activate <id>` |
| Deactivate | `npx superintent knowledge deactivate <id>` |
| Promote | `npx superintent knowledge promote <id>` |
| Recalculate | `npx superintent knowledge recalculate [--dry-run]` |

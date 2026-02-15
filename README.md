# superintent-cli

The data layer for [Superintent](https://github.com/acoderacom/superintent). Manages tickets, knowledge, specs, and semantic search backed by Turso/libSQL.

## Requirements

- Node.js >= 18.0.0

## Quick Start

Install the [Superintent plugin](https://github.com/acoderacom/superintent), then run in Claude Code:

```
/superintent:setup
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  Claude Code Plugin (skills, commands)      │
│  Human (CLI, web dashboard)                 │
└──────────────┬──────────────────────────────┘
               │ npx superintent <command>
┌──────────────▼──────────────────────────────┐
│  CLI (commander.js)                         │
│  ├── commands/   ticket, knowledge, spec,   │
│  │               search, extract, init,     │
│  │               status, ui                 │
│  ├── db/         libSQL client, schema,     │
│  │               parsers, usage tracking    │
│  ├── embed/      all-MiniLM-L6-v2 (384d)    │
│  └── ui/         Hono + HTMX web dashboard  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Turso/libSQL                               │
│  ├── tickets     work items + plans         │
│  ├── knowledge   RAG entries + F32_BLOB     │
│  └── specs       feature specifications     │
└─────────────────────────────────────────────┘
```

All commands output structured JSON: `{ success: boolean, data?: T, error?: string }`.

## Commands

### Tickets

```bash
# Create (stdin markdown)
superintent ticket create --stdin <<'TICKET'
# Add user authentication

**Type:** feature
**Intent:** Add JWT-based auth to the API
**Context:** All endpoints currently public
**Constraints:**
- Use: jsonwebtoken, bcrypt
- Avoid: session cookies
**Change Class:** B - Adds middleware to all routes

## Plan

**Files:** src/middleware/auth.ts, src/routes/auth.ts

**Tasks → Steps:**
1. Create auth middleware
   - JWT verification
   - Error handling
2. Add login/register routes
   - Password hashing
   - Token generation

**DoD → Verification:**
- All protected routes require valid JWT → curl returns 401 without token
- Passwords hashed with bcrypt → DB inspection shows no plaintext
TICKET

# Manage
superintent ticket get <id>
superintent ticket list [--status <status>] [--limit N]
superintent ticket update <id> [--status] [--context] [--comment <text>] [--author] [--complete-task 0,1] [--complete-dod 0,1] [--complete-all] [--plan-stdin] [--spec <spec-id>]
superintent ticket delete <id>
```

### Knowledge

```bash
# Create (stdin markdown)
superintent knowledge create --stdin <<'KNOWLEDGE'
# API Error Handling Pattern

**Namespace:** my-project
**Category:** pattern
**Source:** discovery
**Confidence:** 0.85
**Scope:** new-only
**Tags:** api, error-handling

## Content

Why:
Consistent error responses across all endpoints.

When:
All new API routes.

Pattern:
Wrap handlers in try/catch, return { success, error }.
KNOWLEDGE

# Manage
superintent knowledge get <id>
superintent knowledge list [--namespace] [--category] [--scope] [--source] [--author] [--branch] [--status active|inactive|all] [--limit N]
superintent knowledge update <id> [--title] [--content-stdin] [--namespace] [--category] [--tags] [--scope] [--origin <ticketId>] [--confidence <n>] [--comment] [--author]
superintent knowledge activate <id>
superintent knowledge deactivate <id>
superintent knowledge promote <id>
superintent knowledge recalculate [--dry-run]
```

### Search

Semantic search using cosine similarity against 384-dimensional embeddings.

```bash
superintent search "error handling" [--namespace] [--category] [--ticket-type] [--tags] [--author] [--branch] [--min-score 0.45] [--limit 5]
```

Score interpretation: ≥0.45 relevant, ≥0.55 strong match. Falls back to non-indexed search if vector index unavailable.

### Specs

```bash
superintent spec create --stdin <<'SPEC'
# User Authentication System

## Summary
Full auth: registration, login, JWT, middleware.

## Scope
**In Scope:** JWT auth, password hashing, protected routes
**Out of Scope:** OAuth, 2FA, password reset

## Work Areas
1. User model and registration
2. Login and token generation
3. Auth middleware
SPEC

superintent spec get <id>
superintent spec list [--limit N]
superintent spec update <id> [--title] [--content-stdin] [--comment] [--author]
superintent spec delete <id>
```

### Knowledge Extraction

Generates structured knowledge proposals from completed tickets.

```bash
superintent extract <ticket-id>
```

Proposes entries across categories based on ticket intent, assumptions, constraints, decisions, and trade-offs. Designed for human or AI review before saving.

### Web Dashboard

```bash
superintent ui [--port 3456] [--open]
```

Four views: Kanban board (tickets by status), Semantic search, Knowledge browser (filterable), Spec viewer (with linked tickets).

### Setup

```bash
superintent init [--url <url>]     # Create tables
superintent status                  # Check connection + counts
```

## Database Schema

| Table | Purpose | Key columns |
| --- | --- | --- |
| `tickets` | Work items | status, intent, plan (JSON TicketPlan), change_class, origin_spec_id, author |
| `knowledge` | RAG entries | embedding F32_BLOB(384), category, confidence, active, decision_scope, usage_count, author, branch |
| `specs` | Feature specs | title, content (markdown), author |
| `comments` | Polymorphic comments | parent_type (ticket\|knowledge\|spec), parent_id, author, text |

Vector search uses `vector_distance_cos` with `vector_top_k` index. Supports both local SQLite (`file:` URLs) and Turso Cloud (`libsql://` URLs).

## Configuration

All config lives in `.superintent/.env`, created by `/superintent:setup`.

Local:
```env
TURSO_URL="file:.superintent/local.db"
```

Cloud:
```env
TURSO_URL="libsql://your-db.turso.io"
TURSO_AUTH_TOKEN="your-token"
```

Project namespace is read from `CLAUDE.md` (`- Namespace: <n>`), falling back to the current directory name.

## Embedding Model

Uses [all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) via `@huggingface/transformers`. The model (~23MB) downloads on first use and caches locally. Runs entirely on-device — no API calls for embeddings.

## License

MIT

# superintent-cli

The data layer for [Superintent](https://github.com/acoderacom/superintent). Manages tickets, knowledge, specs, and semantic search backed by Turso/libSQL.

## Requirements

- Node.js >= 18.0.0
- [Claude Code](https://claude.com/claude-code) with the [Superintent plugin](https://github.com/acoderacom/superintent)

This CLI is designed to work with the Superintent Claude Code plugin. The plugin provides skills (`/ticket`, `/spec`, `/task`, etc.) that drive the CLI commands and manage the knowledge loop.

## Quick Start

Install the Superintent plugin in Claude Code, then run:

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
│  │               init, status, dashboard     │
│  ├── db/         libSQL client, schema,     │
│  │               parsers, search, usage     │
│  ├── embed/      bge-small-en-v1.5 (384d)   │
│  └── ui/         Hono + HTMX web dashboard  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Turso/libSQL                               │
│  ├── tickets     work items + plans         │
│  ├── knowledge   RAG entries + F32_BLOB     │
│  ├── specs       feature specifications     │
│  └── comments    polymorphic comments       │
└─────────────────────────────────────────────┘
```

All commands output structured JSON: `{ success: boolean, data?: T, error?: string }`.

## Commands

### Tickets

```bash
# Create (JSON stdin)
superintent ticket create --stdin <<'TICKET'
{
  "title": "Add user authentication",
  "type": "feature",
  "intent": "Add JWT-based auth to the API",
  "context": "All endpoints currently public",
  "constraints": { "use": ["jsonwebtoken", "bcrypt"], "avoid": ["session cookies"] },
  "changeClass": "B",
  "changeClassReason": "Adds middleware to all routes",
  "plan": {
    "files": ["src/middleware/auth.ts", "src/routes/auth.ts"],
    "taskSteps": [
      { "task": "Create auth middleware", "steps": ["JWT verification", "Error handling"] },
      { "task": "Add login/register routes", "steps": ["Password hashing", "Token generation"] }
    ],
    "dodVerification": [
      { "dod": "All protected routes require valid JWT", "verify": "curl returns 401 without token" },
      { "dod": "Passwords hashed with bcrypt", "verify": "DB inspection shows no plaintext" }
    ]
  }
}
TICKET

# Manage
superintent ticket get <id>
superintent ticket preview <id>
superintent ticket list [--status <status>] [--limit N]
superintent ticket update <id> [--stdin] [--status] [--context] [--comment <text>] [--author] [--complete-task 0,1] [--complete-dod 0,1] [--complete-all] [--spec <spec-id>]
superintent ticket delete <id>
```

### Knowledge

```bash
# Create (JSON stdin)
superintent knowledge create --stdin <<'KNOWLEDGE'
{
  "title": "API Error Handling Pattern",
  "namespace": "my-project",
  "category": "pattern",
  "source": "discovery",
  "confidence": 0.85,
  "scope": "new-only",
  "tags": ["api", "error-handling"],
  "content": "Why:\nConsistent error responses across all endpoints.\n\nWhen:\nAll new API routes.\n\nPattern:\nWrap handlers in try/catch, return { success, error }."
}
KNOWLEDGE

# Manage
superintent knowledge get <id>
superintent knowledge preview <id>
superintent knowledge list [--namespace] [--category] [--scope] [--source] [--author] [--branch] [--status active|inactive|all] [--limit N]
superintent knowledge update <id> [--stdin] [--title] [--namespace] [--category] [--tags] [--scope] [--origin <ticketId>] [--confidence <n>] [--comment] [--author]
superintent knowledge activate <id>
superintent knowledge deactivate <id>
superintent knowledge promote <id>
superintent knowledge recalculate [--dry-run]

# Search (semantic, cosine similarity against 384-dim embeddings)
superintent knowledge search "error handling" [--namespace] [--category] [--ticket-type] [--tags] [--author] [--branch] [--min-score 0.45] [--limit 5]

# Extract knowledge from completed tickets
superintent knowledge extract <ticket-id> [--namespace <namespace>]
```

Score interpretation: >=0.45 relevant, >=0.55 strong match. Falls back to non-indexed search if vector index unavailable.

Extraction proposes entries across categories based on ticket intent, assumptions, constraints, decisions, and trade-offs. Designed for human or AI review before saving.

### Specs

```bash
# Create (JSON stdin)
superintent spec create --stdin <<'SPEC'
{
  "title": "User Authentication System",
  "content": "## Summary\nFull auth: registration, login, JWT, middleware.\n\n## Scope\n**In Scope:** JWT auth, password hashing, protected routes\n**Out of Scope:** OAuth, 2FA, password reset\n\n## Work Areas\n1. User model and registration\n2. Login and token generation\n3. Auth middleware",
  "author": "your-name"
}
SPEC

# Manage
superintent spec get <id>
superintent spec preview <id>
superintent spec list [--limit N]
superintent spec update <id> [--stdin] [--title] [--comment] [--author]
superintent spec delete <id>
```

### Web Dashboard

```bash
superintent dashboard [--port 3456] [--open]
```

Four tabs: Tickets (kanban board by status), Knowledge (browser with semantic search, filterable), Specs (viewer with linked tickets), Graph (knowledge graph visualization by shared tags).

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

Uses [bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5) via `@huggingface/transformers`. The model (~32MB quantized ONNX) downloads on first use and caches locally. Runs entirely on-device — no API calls for embeddings. Uses CLS pooling with query prefixing for optimal retrieval.

## License

MIT

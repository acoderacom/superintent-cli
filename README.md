# superintent

The CLI backend for [Superintent Development](https://github.com/acoderacom/superintent) — a framework where your intent drives the entire development cycle, and knowledge compounds with every iteration.

Built on Turso/libSQL for ticket management, RAG-powered knowledge storage, and feature spec planning. Designed to work as the data layer for the **Superintent** Claude Code plugin.

## The Loop

```
  ┌──────────────────────────────────┐
  │                                  │
  ▼                                  │
Intent ──► Work ──► Test ──► Compound
                                │
                        knowledge extracted
```

**Intent** — Say what you want. Superintent figures out the right size: `/spec` for big features, `/ticket` for standard work, `/task` for quick fixes.

**Work** — AI builds it, informed by knowledge from past cycles — patterns, architecture, gotchas, decisions.

**Compound** — Knowledge is extracted from completed work and stored. What was built, how, why, what went wrong. This feeds back into the next cycle.

## Features

- **Ticket Management** — Structured tickets with intent, constraints, tasks, definition-of-done, change classification, and execution plans. Full lifecycle: Backlog → In Progress → In Review → Done.
- **Knowledge Base (RAG)** — Semantic vector storage with 384-dimensional embeddings ([all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)). Categories: `pattern`, `truth`, `principle`, `architecture`, `gotcha`. Confidence scoring with usage-based growth and staleness decay.
- **Semantic Search** — Cosine similarity search across knowledge entries with namespace, category, tag, and ticket-type filters.
- **Feature Specs** — Break big features into sequenced tickets. Specs link to their derived tickets.
- **Knowledge Extraction** — Auto-generates knowledge proposals when tickets are marked Done. Extracts patterns, truths, principles, decisions, and trade-offs.
- **Web Dashboard** — Kanban board, semantic search, knowledge browser, and spec viewer. Built with Hono + HTMX.

## Requirements

- Node.js >= 18.0.0

## Installation

```bash
npm install -g superintent
```

Or use directly via npx:

```bash
npx superintent init
```

## Quick Start

### Local Database (no account needed)

```bash
npx superintent init --url "file:.superintent/local.db"
```

### Cloud Database (Turso)

Create `.superintent/.env`:

```env
TURSO_URL="libsql://your-db.turso.io"
TURSO_AUTH_TOKEN="your-token"
```

Then initialize:

```bash
npx superintent init
```

### Verify

```bash
npx superintent status
```

## CLI Commands

All commands output JSON in the format `{ success: boolean, data?: T, error?: string }`.

### Setup

| Command | Description |
| --- | --- |
| `superintent init [--url <url>] [--token <token>]` | Create database tables |
| `superintent status` | Check connection and counts |
| `superintent ui [-p <port>] [-o]` | Start web dashboard (default: port 3456) |

### Tickets

```bash
# Create from markdown via stdin
superintent ticket create --stdin <<'EOF'
# Add user authentication

**Type:** feature
**Intent:** Add JWT-based authentication to the API
**Context:** Currently no auth, all endpoints are public
**Constraints:**
- Use: jsonwebtoken, bcrypt
- Avoid: session cookies
**Assumptions:** PostgreSQL already stores user table
**Change Class:** B - Adds new middleware to all routes
EOF

# Get, list, update, delete
superintent ticket get TICKET-20260210-143000
superintent ticket list --status "In Progress" --limit 10
superintent ticket update TICKET-20260210-143000 --status "Done"
superintent ticket delete TICKET-20260210-143000
```

**Update options:** `--status`, `--context`, `--comment`, `--spec`, `--plan-stdin`, `--complete-task <indices>`, `--complete-dod <indices>`, `--complete-all`

### Knowledge

```bash
# Create from markdown via stdin
superintent knowledge create --stdin <<'EOF'
# API Error Handling Pattern

**Namespace:** my-project
**Category:** pattern
**Source:** discovery
**Confidence:** 0.85
**Scope:** new-only
**Tags:** api, error-handling, express

## Content

Why:
Consistent error responses improve debugging and client experience.

When:
All new API endpoints.

Pattern:
Wrap route handlers in try/catch, return { success: false, error: message }.
EOF

# Search, list, get, update, activate/deactivate
superintent search "error handling patterns" --limit 5
superintent knowledge list --category pattern --namespace my-project
superintent knowledge get KNOWLEDGE-20260210-150000
superintent knowledge update KNOWLEDGE-20260210-150000 --confidence 0.9
superintent knowledge deactivate KNOWLEDGE-20260210-150000
superintent knowledge recalculate --dry-run
```

### Specs

```bash
# Create from markdown via stdin
superintent spec create --stdin <<'EOF'
# User Authentication System

## Summary
Full auth system with registration, login, JWT tokens, and middleware.

## Tickets
1. Add user model and registration endpoint
2. Add login endpoint with JWT generation
3. Add auth middleware to protected routes
EOF

# Get, list, update, delete
superintent spec get SPEC-20260210-160000
superintent spec list --limit 10
superintent spec delete SPEC-20260210-160000
```

### Knowledge Extraction

```bash
# Extract knowledge proposals from a completed ticket
superintent extract TICKET-20260210-143000
```

## Web Dashboard

```bash
superintent ui --open
```

Opens a web UI at `http://localhost:3456` with four tabs:

1. **Kanban** — Ticket board with status columns, quick create, edit, and detail modals
2. **Search** — Real-time semantic search across the knowledge base
3. **Knowledge** — Filterable list with category, namespace, scope, and status filters
4. **Specs** — Feature specs with linked ticket counts

## Claude Code Plugin

This CLI is the data layer for the [Superintent plugin](https://github.com/acoderacom/superintent). Install the plugin in Claude Code to get skill-driven workflows:

| Skill | Trigger | What It Does |
| --- | --- | --- |
| `/ticket` | "I want...", "Add...", "Build..." | Create and execute structured tickets with planning, implementation, review, and knowledge extraction |
| `/task` | "quick fix", "just do it" | Fast execution for confident, low-risk changes (Class A only) |
| `/spec` | "spec", "plan feature", "big feature" | Write comprehensive specs for big features, then derive tickets |
| `/learn` | "learn how...", "document how..." | Explore codebase and capture understanding as searchable knowledge |
| `/explain` | "explain...", "why do we..." | Answer questions from the knowledge base before codebase exploration |
| `/maintain` | "maintain", "sync knowledge" | Distill the knowledge database into CLAUDE.md between managed markers |

The plugin auto-approves CLI commands via hooks, searches knowledge before every action, and extracts knowledge when tickets are completed — closing the compound loop.

## Database

Three tables:

- **tickets** — Work items with structured metadata (tasks, DoD, plan, constraints, etc.)
- **knowledge** — RAG entries with `F32_BLOB(384)` vector column and cosine similarity index
- **specs** — Feature specifications linking to tickets via `origin_spec_id`

Supports both local SQLite (`file:` URLs) and Turso Cloud (`libsql://` URLs).

## Configuration

Config is read from `.superintent/.env` or environment variables (`TURSO_URL`, `TURSO_AUTH_TOKEN`). Environment variables take priority.

Local file URLs (`file:...`) do not require an auth token.

## License

MIT

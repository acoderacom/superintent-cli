## Superintent Config

- Namespace: superintent-cli
- Database: Local SQLite (`.superintent/local.db`)

Before exploring the codebase, always run `npx superintent search` first — stored knowledge is the primary source of truth. Specs describe features only; never include tickets inside a spec. All stdin flags (--stdin, --content-stdin, --plan-stdin) expect input in markdown format.

<!-- superintent:knowledge:start -->

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
| Create | `npx superintent ticket create --stdin` (heredoc) |
| Get | `npx superintent ticket get <id>` |
| Update | `npx superintent ticket update <id> [--status] [--plan-stdin] [--complete-all] [--complete-task <indices>] [--complete-dod <indices>] [--comment <text>] [--context <context>] [--spec <spec-id>]` |
| List | `npx superintent ticket list [--status <status>] [--limit N]` |
| Delete | `npx superintent ticket delete <id>` |

### Spec Operations

| Action | Command |
| --- | --- |
| Create | `npx superintent spec create --stdin` (heredoc) |
| Get | `npx superintent spec get <id>` |
| List | `npx superintent spec list [--limit N]` |
| Update | `npx superintent spec update <id> [--title] [--content-stdin]` |
| Delete | `npx superintent spec delete <id>` |

### Knowledge Operations

| Action | Command |
| --- | --- |
| Search | `npx superintent search "<query>" [--limit N] [--namespace] [--category] [--ticket-type] [--tags] [--min-score]` |
| Extract | `npx superintent extract <ticket-id>` |
| Create | `npx superintent knowledge create --stdin` (heredoc) |
| Get | `npx superintent knowledge get <id>` |
| List | `npx superintent knowledge list [--namespace] [--category] [--scope] [--source] [--status active\|inactive\|all] [--limit N]` |
| Update | `npx superintent knowledge update <id> [--title] [--content-stdin] [--namespace] [--category] [--tags] [--scope] [--origin] [--confidence]` |
| Activate | `npx superintent knowledge activate <id>` |
| Deactivate | `npx superintent knowledge deactivate <id>` |
| Recalculate | `npx superintent knowledge recalculate [--dry-run]` |

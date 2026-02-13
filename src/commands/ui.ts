import { Command } from 'commander';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import open from 'open';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { InValue } from '@libsql/client';
import { getClient, closeClient } from '../db/client.js';
import { parseTicketRow, parseKnowledgeRow, parseSpecRow } from '../db/parsers.js';
import { performVectorSearch } from '../db/search.js';
import { loadConfig, getProjectNamespace } from '../utils/config.js';
import { embed, disposeEmbedder } from '../embed/model.js';
import {
  getHtml,
  renderKanbanView,
  renderKanbanColumns,
  renderColumnMore,
  renderSearchView,
  renderSearchResults,
  renderKnowledgeView,
  renderKnowledgeList,
  renderTicketModal,
  renderKnowledgeModal,
  renderNewTicketModal,
  renderEditTicketModal,
  renderSpecView,
  renderSpecList,
  renderSpecModal,
  renderNewSpecModal,
  renderEditSpecModal,
} from '../ui/components/index.js';

export const uiCommand = new Command('ui')
  .description('Start web UI for ticket and knowledge management')
  .option('-p, --port <port>', 'Server port', '3456')
  .option('-o, --open', 'Auto-open browser')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const namespace = getProjectNamespace();
    const app = new Hono();

    // ============ STATIC ASSETS ============
    const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
    const version = packageJson.version;
    const cssPath = join(packageRoot, 'dist', 'ui', 'styles.css');
    let cssContent: string;
    try {
      cssContent = readFileSync(cssPath, 'utf-8');
    } catch {
      cssContent = '/* Tailwind CSS not built. Run: npm run build:css */';
    }

    app.get('/styles.css', (c) => {
      c.header('Content-Type', 'text/css');
      c.header('Cache-Control', 'public, max-age=3600');
      return c.body(cssContent);
    });

    // ============ MAIN HTML ============
    app.get('/', (c) => c.html(getHtml(namespace)));

    // ============ API ROUTES (JSON) ============

    // List all tickets
    app.get('/api/tickets', async (c) => {
      try {
        const client = await getClient();
        const result = await client.execute({
          sql: 'SELECT * FROM tickets ORDER BY created_at DESC',
          args: [],
        });
        const tickets = result.rows.map((row) => parseTicketRow(row as Record<string, unknown>));
        return c.json({ success: true, data: tickets });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // Get single ticket
    app.get('/api/tickets/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();
        const result = await client.execute({
          sql: 'SELECT * FROM tickets WHERE id = ?',
          args: [id],
        });
        if (result.rows.length === 0) {
          return c.json({ success: false, error: 'Ticket not found' }, 404);
        }
        const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);
        return c.json({ success: true, data: ticket });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // Update ticket status
    app.patch('/api/tickets/:id/status', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.parseBody();
        const newStatus = body.status as string;

        const validStatuses = ['Backlog', 'In Progress', 'In Review', 'Done', 'Blocked', 'Paused', 'Abandoned', 'Superseded'];
        if (!validStatuses.includes(newStatus)) {
          return c.json({ success: false, error: 'Invalid status' }, 400);
        }

        const client = await getClient();

        // If setting to Done, auto-complete all tasks and DoD
        if (newStatus === 'Done') {
          const current = await client.execute({
            sql: 'SELECT tasks, definition_of_done FROM tickets WHERE id = ?',
            args: [id],
          });

          if (current.rows.length > 0) {
            const row = current.rows[0] as Record<string, unknown>;
            const tasks = row.tasks ? JSON.parse(row.tasks as string) : [];
            const dod = row.definition_of_done ? JSON.parse(row.definition_of_done as string) : [];

            const completedTasks = tasks.map((t: { text: string; done: boolean }) => ({ ...t, done: true }));
            const completedDod = dod.map((d: { text: string; done: boolean }) => ({ ...d, done: true }));

            await client.execute({
              sql: `UPDATE tickets SET status = ?, tasks = ?, definition_of_done = ?, updated_at = datetime('now') WHERE id = ?`,
              args: [newStatus, JSON.stringify(completedTasks), JSON.stringify(completedDod), id],
            });

            return c.json({ success: true, data: { id, status: newStatus } });
          }
        }

        await client.execute({
          sql: `UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [newStatus, id],
        });

        return c.json({ success: true, data: { id, status: newStatus } });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // Toggle task completion
    app.patch('/api/tickets/:id/task/:index', async (c) => {
      try {
        const id = c.req.param('id');
        const index = parseInt(c.req.param('index'), 10);

        const client = await getClient();
        const result = await client.execute({
          sql: 'SELECT tasks FROM tickets WHERE id = ?',
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.json({ success: false, error: 'Ticket not found' }, 404);
        }

        const row = result.rows[0] as Record<string, unknown>;
        const tasks = row.tasks ? JSON.parse(row.tasks as string) : [];

        if (index >= 0 && index < tasks.length) {
          tasks[index].done = !tasks[index].done;
          await client.execute({
            sql: `UPDATE tickets SET tasks = ?, updated_at = datetime('now') WHERE id = ?`,
            args: [JSON.stringify(tasks), id],
          });
        }

        return c.json({ success: true });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // Toggle DoD completion
    app.patch('/api/tickets/:id/dod/:index', async (c) => {
      try {
        const id = c.req.param('id');
        const index = parseInt(c.req.param('index'), 10);

        const client = await getClient();
        const result = await client.execute({
          sql: 'SELECT definition_of_done FROM tickets WHERE id = ?',
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.json({ success: false, error: 'Ticket not found' }, 404);
        }

        const row = result.rows[0] as Record<string, unknown>;
        const dod = row.definition_of_done ? JSON.parse(row.definition_of_done as string) : [];

        if (index >= 0 && index < dod.length) {
          dod[index].done = !dod[index].done;
          await client.execute({
            sql: `UPDATE tickets SET definition_of_done = ?, updated_at = datetime('now') WHERE id = ?`,
            args: [JSON.stringify(dod), id],
          });
        }

        return c.json({ success: true });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // Quick create ticket (from UI form)
    app.post('/api/tickets/quick', async (c) => {
      try {
        const formData = await c.req.parseBody();
        const title = (formData.title as string)?.trim();
        const type = (formData.type as string) || 'feature';
        const intent = (formData.intent as string)?.trim();

        if (!title) {
          return c.html('<div class="text-red-500 p-2">Title is required</div>', 400);
        }
        if (!intent) {
          return c.html('<div class="text-red-500 p-2">Intent is required</div>', 400);
        }

        // Generate ID: TICKET-YYYYMMDD-HHMMSS-manual (manual ticket format)
        // The -manual suffix signals AI to enrich ticket before execution
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const time = now.toISOString().slice(11, 19).replace(/:/g, '');
        const id = `TICKET-${date}-${time}-manual`;

        const client = await getClient();
        await client.execute({
          sql: `INSERT INTO tickets (id, type, title, intent, status) VALUES (?, ?, ?, ?, 'Backlog')`,
          args: [id, type, title, intent],
        });

        // Return refreshed kanban columns
        const statuses = ['Backlog', 'In Progress', 'In Review', 'Done'];
        const archiveStatuses = ['Blocked', 'Paused', 'Abandoned', 'Superseded'];
        const limit = 20;
        const columnData = await Promise.all(
          statuses.map(async (status) => {
            const result = await client.execute({
              sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, tasks
                    FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
              args: [status, limit + 1],
            });
            const hasMore = result.rows.length > limit;
            const tickets = result.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
            return { status, tickets, hasMore };
          })
        );

        // Add Archive column
        const archiveResult = await client.execute({
          sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, tasks
                FROM tickets WHERE status IN (?, ?, ?, ?) ORDER BY created_at DESC LIMIT ?`,
          args: [...archiveStatuses, limit + 1],
        });
        const archiveHasMore = archiveResult.rows.length > limit;
        const archiveTickets = archiveResult.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
        columnData.push({ status: 'Archive', tickets: archiveTickets, hasMore: archiveHasMore });

        return c.html(renderKanbanColumns(columnData));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-2">Error: ${(error as Error).message}</div>`, 500);
      }
    });

    // Delete ticket
    app.delete('/api/tickets/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();

        // First, orphan any derived knowledge (set origin_ticket_id to NULL)
        await client.execute({
          sql: `UPDATE knowledge SET origin_ticket_id = NULL WHERE origin_ticket_id = ?`,
          args: [id],
        });

        // Delete the ticket
        const result = await client.execute({
          sql: `DELETE FROM tickets WHERE id = ?`,
          args: [id],
        });

        if (result.rowsAffected === 0) {
          return c.json({ success: false, error: 'Ticket not found' }, 404);
        }

        return c.json({ success: true });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // Edit ticket (title, type, intent)
    app.patch('/api/tickets/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const formData = await c.req.parseBody();
        const title = (formData.title as string)?.trim();
        const type = (formData.type as string) || 'feature';
        const intent = (formData.intent as string)?.trim();

        if (!title) {
          return c.html('<div class="text-red-500 p-2">Title is required</div>', 400);
        }
        if (!intent) {
          return c.html('<div class="text-red-500 p-2">Intent is required</div>', 400);
        }

        const client = await getClient();
        await client.execute({
          sql: `UPDATE tickets SET title = ?, type = ?, intent = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [title, type, intent, id],
        });

        // Fetch updated ticket and return detail modal
        const result = await client.execute({
          sql: `SELECT id, type, title, status, intent, context, constraints_use, constraints_avoid,
                assumptions, tasks, definition_of_done, change_class, change_class_reason,
                origin_spec_id, plan, derived_knowledge, comments, created_at, updated_at FROM tickets WHERE id = ?`,
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Ticket not found</div>', 404);
        }

        const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);
        // Trigger kanban refresh in the background
        c.header('HX-Trigger', 'refresh');
        return c.html(renderTicketModal(ticket));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-2">Error: ${(error as Error).message}</div>`, 500);
      }
    });

    // Toggle knowledge active status
    app.patch('/api/knowledge/:id/active', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.parseBody();
        // hx-vals sends string "true"/"false"
        const active = body.active === 'true' ? 1 : 0;

        const client = await getClient();
        await client.execute({
          sql: 'UPDATE knowledge SET active = ? WHERE id = ?',
          args: [active, id],
        });

        // Fetch updated knowledge and return modal HTML
        const result = await client.execute({
          sql: `SELECT id, namespace, chunk_index, title, content,
                category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                usage_count, last_used_at, created_at, updated_at
                FROM knowledge WHERE id = ?`,
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Knowledge not found</div>', 404);
        }

        const knowledge = parseKnowledgeRow(result.rows[0] as Record<string, unknown>);
        return c.html(renderKnowledgeModal(knowledge));
      } catch (error) {
        return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`, 500);
      }
    });

    // List knowledge
    app.get('/api/knowledge', async (c) => {
      try {
        const client = await getClient();
        const category = c.req.query('category');
        const namespace = c.req.query('namespace');
        const scope = c.req.query('scope');
        const status = c.req.query('status') || 'active';

        const conditions: string[] = [];
        const args: InValue[] = [];

        // Status filter
        if (status === 'active') {
          conditions.push('active = 1');
        } else if (status === 'inactive') {
          conditions.push('active = 0');
        }
        // 'all' = no filter

        if (category) {
          conditions.push('category = ?');
          args.push(category);
        }
        if (namespace) {
          conditions.push('namespace = ?');
          args.push(namespace);
        }
        if (scope) {
          conditions.push('decision_scope = ?');
          args.push(scope);
        }

        const sql = `SELECT id, namespace, chunk_index, title, content,
                     category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                     usage_count, last_used_at, created_at, updated_at
                     FROM knowledge WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 50`;

        const result = await client.execute({ sql, args });
        const knowledge = result.rows.map((row) => parseKnowledgeRow(row as Record<string, unknown>));
        return c.json({ success: true, data: knowledge });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // Semantic search
    app.post('/api/search', async (c) => {
      try {
        const body = await c.req.json();
        const query = body.query;
        const limit = body.limit || 5;
        const namespace = body.namespace;
        const category = body.category;

        if (!query || query.trim().length < 2) {
          return c.json({ success: true, data: { query: '', results: [] } });
        }

        const client = await getClient();
        const queryEmbedding = await embed(query);
        const results = await performVectorSearch(client, queryEmbedding, {
          namespace, category, limit,
        });
        return c.json({ success: true, data: { query, results } });
      } catch (error) {
        return c.json({ success: false, error: (error as Error).message }, 500);
      }
    });

    // ============ HTMX PARTIAL ROUTES (HTML) ============

    // Kanban view
    app.get('/partials/kanban-view', (c) => {
      return c.html(renderKanbanView());
    });

    // Kanban columns - paginated per status (20 tickets per column initially)
    app.get('/partials/kanban-columns', async (c) => {
      try {
        const client = await getClient();
        const statuses = ['Backlog', 'In Progress', 'In Review', 'Done'];
        const archiveStatuses = ['Blocked', 'Paused', 'Abandoned', 'Superseded'];
        const limit = 20;

        const columnData = await Promise.all(
          statuses.map(async (status) => {
            const result = await client.execute({
              sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, tasks
                    FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
              args: [status, limit + 1],
            });
            const hasMore = result.rows.length > limit;
            const tickets = result.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
            return { status, tickets, hasMore };
          })
        );

        // Add Archive column (Blocked, Paused, Abandoned, Superseded)
        const archiveResult = await client.execute({
          sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, tasks
                FROM tickets WHERE status IN (?, ?, ?, ?) ORDER BY created_at DESC LIMIT ?`,
          args: [...archiveStatuses, limit + 1],
        });
        const archiveHasMore = archiveResult.rows.length > limit;
        const archiveTickets = archiveResult.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
        columnData.push({ status: 'Archive', tickets: archiveTickets, hasMore: archiveHasMore });

        return c.html(renderKanbanColumns(columnData));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
      }
    });

    // Load more tickets for a specific column
    app.get('/partials/kanban-column/:status', async (c) => {
      try {
        const status = decodeURIComponent(c.req.param('status'));
        const offset = parseInt(c.req.query('offset') || '0', 10);
        const limit = 20;

        const client = await getClient();
        let result;

        // Handle Archive column specially (multiple statuses)
        if (status === 'Archive') {
          const archiveStatuses = ['Blocked', 'Paused', 'Abandoned', 'Superseded'];
          result = await client.execute({
            sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, tasks
                  FROM tickets WHERE status IN (?, ?, ?, ?) ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            args: [...archiveStatuses, limit + 1, offset],
          });
        } else {
          result = await client.execute({
            sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, tasks
                  FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            args: [status, limit + 1, offset],
          });
        }

        const hasMore = result.rows.length > limit;
        const tickets = result.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
        const nextOffset = offset + limit;

        return c.html(renderColumnMore(tickets, status, nextOffset, hasMore));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
      }
    });

    // Ticket modal - optimized query selecting only needed fields
    app.get('/partials/ticket-modal/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();
        const result = await client.execute({
          sql: `SELECT id, type, title, status, intent, context, constraints_use, constraints_avoid,
                assumptions, tasks, definition_of_done, change_class, change_class_reason,
                origin_spec_id, plan, derived_knowledge, comments, created_at, updated_at FROM tickets WHERE id = ?`,
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Ticket not found</div>');
        }

        const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);
        return c.html(renderTicketModal(ticket));
      } catch (error) {
        return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`);
      }
    });

    // New ticket modal
    app.get('/partials/new-ticket-modal', (c) => {
      return c.html(renderNewTicketModal());
    });

    // Edit ticket modal
    app.get('/partials/edit-ticket-modal/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();
        const result = await client.execute({
          sql: `SELECT id, type, title, intent FROM tickets WHERE id = ?`,
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Ticket not found</div>');
        }

        const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);
        return c.html(renderEditTicketModal(ticket));
      } catch (error) {
        return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`);
      }
    });

    // Search view
    app.get('/partials/search-view', (c) => {
      return c.html(renderSearchView());
    });

    // Search results
    app.get('/partials/search-results', async (c) => {
      try {
        const query = c.req.query('query');
        const namespace = c.req.query('namespace');
        const category = c.req.query('category');
        const limit = parseInt(c.req.query('limit') || '5', 10);

        if (!query || query.trim().length < 2) {
          return c.html('<p class="text-gray-500 text-center py-8">Enter at least 2 characters to search</p>');
        }

        const client = await getClient();
        const queryEmbedding = await embed(query);
        const results = await performVectorSearch(client, queryEmbedding, {
          namespace, category, limit,
        });
        return c.html(renderSearchResults(results));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-4">Search error: ${(error as Error).message}</div>`);
      }
    });

    // Knowledge view
    app.get('/partials/knowledge-view', (c) => {
      return c.html(renderKnowledgeView());
    });

    // Knowledge list
    app.get('/partials/knowledge-list', async (c) => {
      try {
        const client = await getClient();
        const category = c.req.query('k-category');
        const namespace = c.req.query('k-namespace');
        const scope = c.req.query('k-scope');
        const sourceFilter = c.req.query('k-origin');
        const status = c.req.query('k-status') || 'active';

        const conditions: string[] = [];
        const args: InValue[] = [];

        // Status filter
        if (status === 'active') {
          conditions.push('active = 1');
        } else if (status === 'inactive') {
          conditions.push('active = 0');
        }
        // 'all' = no filter

        if (category) {
          conditions.push('category = ?');
          args.push(category);
        }
        if (namespace) {
          conditions.push('namespace = ?');
          args.push(namespace);
        }
        if (scope) {
          conditions.push('decision_scope = ?');
          args.push(scope);
        }
        if (sourceFilter) {
          conditions.push('source = ?');
          args.push(sourceFilter);
        }

        let sql = `SELECT id, namespace, chunk_index, title, content,
                     category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                     usage_count, last_used_at, created_at, updated_at
                     FROM knowledge`;
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ' ORDER BY created_at DESC LIMIT 50';

        const result = await client.execute({ sql, args });
        const knowledge = result.rows.map((row) => parseKnowledgeRow(row as Record<string, unknown>));
        return c.html(renderKnowledgeList(knowledge));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
      }
    });

    // Knowledge modal
    app.get('/partials/knowledge-modal/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();
        const result = await client.execute({
          sql: `SELECT id, namespace, chunk_index, title, content,
                category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                usage_count, last_used_at, created_at, updated_at
                FROM knowledge WHERE id = ?`,
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Knowledge entry not found</div>');
        }

        const knowledge = parseKnowledgeRow(result.rows[0] as Record<string, unknown>);
        return c.html(renderKnowledgeModal(knowledge));
      } catch (error) {
        return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`);
      }
    });

    // ============ SPEC PARTIALS ============

    // Spec view
    app.get('/partials/spec-view', (c) => {
      return c.html(renderSpecView());
    });

    // New spec modal
    app.get('/partials/new-spec-modal', (c) => {
      return c.html(renderNewSpecModal());
    });

    // Spec list
    app.get('/partials/spec-list', async (c) => {
      try {
        const client = await getClient();
        const result = await client.execute({
          sql: 'SELECT id, title, content, created_at, updated_at FROM specs ORDER BY created_at DESC LIMIT 50',
          args: [],
        });
        const specs = result.rows.map((row) => parseSpecRow(row as Record<string, unknown>));

        // Get ticket counts per spec
        const countResult = await client.execute({
          sql: 'SELECT origin_spec_id, COUNT(*) as cnt FROM tickets WHERE origin_spec_id IS NOT NULL GROUP BY origin_spec_id',
          args: [],
        });
        const ticketCounts: Record<string, number> = {};
        for (const row of countResult.rows) {
          ticketCounts[row.origin_spec_id as string] = Number(row.cnt);
        }

        return c.html(renderSpecList(specs, ticketCounts));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
      }
    });

    // Spec modal
    app.get('/partials/spec-modal/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();
        const result = await client.execute({
          sql: 'SELECT id, title, content, created_at, updated_at FROM specs WHERE id = ?',
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Spec not found</div>');
        }

        const spec = parseSpecRow(result.rows[0] as Record<string, unknown>);

        // Get related tickets
        const ticketResult = await client.execute({
          sql: 'SELECT id, title, status FROM tickets WHERE origin_spec_id = ? ORDER BY created_at DESC',
          args: [id],
        });
        const relatedTickets = ticketResult.rows.map(row => ({
          id: row.id as string,
          title: row.title as string | undefined,
          status: row.status as string,
        }));

        return c.html(renderSpecModal(spec, relatedTickets));
      } catch (error) {
        return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`);
      }
    });

    // Edit spec modal
    app.get('/partials/edit-spec-modal/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();
        const result = await client.execute({
          sql: 'SELECT id, title, content, created_at, updated_at FROM specs WHERE id = ?',
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Spec not found</div>');
        }

        const spec = parseSpecRow(result.rows[0] as Record<string, unknown>);
        return c.html(renderEditSpecModal(spec));
      } catch (error) {
        return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`);
      }
    });

    // Update spec
    app.patch('/api/specs/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const formData = await c.req.parseBody();
        const title = (formData.title as string)?.trim();
        const content = (formData.content as string)?.trim();

        if (!title) {
          return c.html('<div class="text-red-500 p-2">Title is required</div>', 400);
        }
        if (!content) {
          return c.html('<div class="text-red-500 p-2">Content is required</div>', 400);
        }

        const client = await getClient();
        await client.execute({
          sql: `UPDATE specs SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [title, content, id],
        });

        // Fetch updated spec and return detail modal
        const result = await client.execute({
          sql: 'SELECT id, title, content, created_at, updated_at FROM specs WHERE id = ?',
          args: [id],
        });

        if (result.rows.length === 0) {
          return c.html('<div class="p-6 text-red-500">Spec not found</div>', 404);
        }

        const spec = parseSpecRow(result.rows[0] as Record<string, unknown>);

        // Get related tickets
        const ticketResult = await client.execute({
          sql: 'SELECT id, title, status FROM tickets WHERE origin_spec_id = ? ORDER BY created_at DESC',
          args: [id],
        });
        const relatedTickets = ticketResult.rows.map(row => ({
          id: row.id as string,
          title: row.title as string | undefined,
          status: row.status as string,
        }));

        c.header('HX-Trigger', 'refresh');
        return c.html(renderSpecModal(spec, relatedTickets));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-2">Error: ${(error as Error).message}</div>`, 500);
      }
    });

    // Quick-create spec (manual)
    app.post('/api/specs/quick', async (c) => {
      try {
        const formData = await c.req.parseBody();
        const title = (formData.title as string)?.trim();
        const content = (formData.content as string)?.trim();

        if (!title) {
          return c.html('<div class="text-red-500 p-2">Title is required</div>', 400);
        }
        if (!content) {
          return c.html('<div class="text-red-500 p-2">Content is required</div>', 400);
        }

        // Generate ID: SPEC-YYYYMMDD-HHMMSS
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const time = now.toISOString().slice(11, 19).replace(/:/g, '');
        const id = `SPEC-${date}-${time}`;

        const client = await getClient();
        await client.execute({
          sql: `INSERT INTO specs (id, title, content) VALUES (?, ?, ?)`,
          args: [id, title, content],
        });

        // Return refreshed spec list
        const result = await client.execute({
          sql: 'SELECT id, title, content, created_at, updated_at FROM specs ORDER BY created_at DESC LIMIT 50',
          args: [],
        });
        const specs = result.rows.map((row) => parseSpecRow(row as Record<string, unknown>));

        const countResult = await client.execute({
          sql: 'SELECT origin_spec_id, COUNT(*) as cnt FROM tickets WHERE origin_spec_id IS NOT NULL GROUP BY origin_spec_id',
          args: [],
        });
        const ticketCounts: Record<string, number> = {};
        for (const row of countResult.rows) {
          ticketCounts[row.origin_spec_id as string] = Number(row.cnt);
        }

        return c.html(renderSpecList(specs, ticketCounts));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-2">Error: ${(error as Error).message}</div>`, 500);
      }
    });

    // Delete spec
    app.delete('/api/specs/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const client = await getClient();
        await client.execute({
          sql: 'DELETE FROM specs WHERE id = ?',
          args: [id],
        });

        // Return updated spec list
        const result = await client.execute({
          sql: 'SELECT id, title, content, created_at, updated_at FROM specs ORDER BY created_at DESC LIMIT 50',
          args: [],
        });
        const specs = result.rows.map((row) => parseSpecRow(row as Record<string, unknown>));

        const countResult = await client.execute({
          sql: 'SELECT origin_spec_id, COUNT(*) as cnt FROM tickets WHERE origin_spec_id IS NOT NULL GROUP BY origin_spec_id',
          args: [],
        });
        const ticketCounts: Record<string, number> = {};
        for (const row of countResult.rows) {
          ticketCounts[row.origin_spec_id as string] = Number(row.cnt);
        }

        return c.html(renderSpecList(specs, ticketCounts));
      } catch (error) {
        return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
      }
    });

    // ============ START SERVER ============

    const config = loadConfig();
    const isLocal = config.url.startsWith('file:');
    const dbMode = isLocal ? 'Local' : 'Cloud';

    const banner = `
\x1b[36m→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→→→  →→→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→→    →→→→→→→→→→→→→→→→→→
→→→→→→→→→→→→→→→→→      →→→→→→→→→→→→→→→
→→→→→→→→→→→→→→            →→→→→→→→→→→
   ←←←←←←←←←←←            ←←←←←←←←←←←←←←
  ←←←←←←←←←←←←←←←      ←←←←←←←←←←←←←←←←←
←←←←←←←←←←←←←←←←←←    ←←←←←←←←←←←←←←←←←←
←←←←←←←←←←←←←←←←←←←  ←←←←←←←←←←←←←←←←←←←
←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
  ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
   ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←\x1b[0m

  \x1b[1mSuperintent\x1b[0m \x1b[90mv${version}\x1b[0m

  \x1b[32m*\x1b[0m Ready at \x1b[1mhttp://localhost:${port}\x1b[0m
  \x1b[90m>\x1b[0m Using \x1b[33mTurso ${dbMode}\x1b[0m

  \x1b[90mPress Ctrl+C to stop\x1b[0m
`;
    console.log(banner);

    const server = serve({
      fetch: app.fetch,
      port,
      hostname: '127.0.0.1',
    });

    if (options.open) {
      setTimeout(() => {
        open(`http://localhost:${port}`);
      }, 500);
    }

    // Handle graceful shutdown — release all handles so the event loop drains naturally.
    // NEVER call process.exit() here: onnxruntime-node has a global C++ thread pool
    // that holds mutexes. Forceful exit kills those threads mid-lock, causing:
    //   "libc++abi: terminating due to uncaught exception of type std::__1::system_error: mutex lock failed"
    // Instead, close all JS-side handles and let Node.js exit on its own.
    const shutdown = () => {
      console.log('\n\x1b[90m  See ya!\x1b[0m\n');
      server.close(async () => {
        await disposeEmbedder();
        closeClient();
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

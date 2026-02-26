import type { Hono } from 'hono';
import type { InValue } from '@libsql/client';
import { getClient } from '../../db/client.js';
import { parseTicketRow } from '../../db/parsers.js';
import { emitSSE } from '../sse.js';
import { getGitUsername } from '../../utils/git.js';
import { fetchComments } from './shared.js';
import {
  renderKanbanView,
  renderKanbanColumns,
  renderColumnMore,
  renderTicketModal,
  renderNewTicketModal,
  renderEditTicketModal,
} from '../components/index.js';

export function registerTicketRoutes(app: Hono) {

  // ── API Routes ──────────────────────────────────────────────────

  // List all tickets
  app.get('/api/tickets', async (c) => {
    try {
      const client = await getClient();
      const limit = parseInt(c.req.query('limit') || '20', 10) || 20;
      const offset = parseInt(c.req.query('offset') || '0', 10) || 0;
      const status = c.req.query('status');

      const conditions: string[] = [];
      const args: InValue[] = [];

      if (status) {
        conditions.push('status = ?');
        args.push(status);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await client.execute({
        sql: `SELECT id, title, type, status, intent, change_class, origin_spec_id, author, created_at, updated_at
              FROM tickets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      });
      const tickets = result.rows.map((row) => parseTicketRow(row as Record<string, unknown>));
      const hasMore = tickets.length === limit;
      return c.json({ success: true, data: tickets, pagination: { limit, offset, hasMore } });
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

      // If setting to Done, auto-complete all plan tasks and DoD
      if (newStatus === 'Done') {
        const current = await client.execute({
          sql: 'SELECT plan FROM tickets WHERE id = ?',
          args: [id],
        });

        if (current.rows.length > 0) {
          const row = current.rows[0] as Record<string, unknown>;
          const plan = row.plan ? JSON.parse(row.plan as string) : null;

          if (plan) {
            plan.taskSteps = (plan.taskSteps || []).map((ts: Record<string, unknown>) => ({ ...ts, done: true }));
            plan.dodVerification = (plan.dodVerification || []).map((dv: Record<string, unknown>) => ({ ...dv, done: true }));

            await client.execute({
              sql: `UPDATE tickets SET status = ?, plan = ?, updated_at = datetime('now') WHERE id = ?`,
              args: [newStatus, JSON.stringify(plan), id],
            });

            emitSSE('ticket-updated');
            return c.json({ success: true, data: { id, status: newStatus } });
          }
        }
      }

      await client.execute({
        sql: `UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [newStatus, id],
      });

      emitSSE('ticket-updated');
      return c.json({ success: true, data: { id, status: newStatus } });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  });

  // Toggle task completion (operates on plan.taskSteps)
  app.patch('/api/tickets/:id/task/:index', async (c) => {
    try {
      const id = c.req.param('id');
      const index = parseInt(c.req.param('index'), 10);

      const client = await getClient();
      const result = await client.execute({
        sql: 'SELECT plan FROM tickets WHERE id = ?',
        args: [id],
      });

      if (result.rows.length === 0) {
        return c.json({ success: false, error: 'Ticket not found' }, 404);
      }

      const row = result.rows[0] as Record<string, unknown>;
      const plan = row.plan ? JSON.parse(row.plan as string) : null;

      if (plan && index >= 0 && index < (plan.taskSteps || []).length) {
        plan.taskSteps[index].done = !plan.taskSteps[index].done;
        await client.execute({
          sql: `UPDATE tickets SET plan = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [JSON.stringify(plan), id],
        });
        emitSSE('ticket-updated');
      }

      return c.json({ success: true });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  });

  // Toggle DoD completion (operates on plan.dodVerification)
  app.patch('/api/tickets/:id/dod/:index', async (c) => {
    try {
      const id = c.req.param('id');
      const index = parseInt(c.req.param('index'), 10);

      const client = await getClient();
      const result = await client.execute({
        sql: 'SELECT plan FROM tickets WHERE id = ?',
        args: [id],
      });

      if (result.rows.length === 0) {
        return c.json({ success: false, error: 'Ticket not found' }, 404);
      }

      const row = result.rows[0] as Record<string, unknown>;
      const plan = row.plan ? JSON.parse(row.plan as string) : null;

      if (plan && index >= 0 && index < (plan.dodVerification || []).length) {
        plan.dodVerification[index].done = !plan.dodVerification[index].done;
        await client.execute({
          sql: `UPDATE tickets SET plan = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [JSON.stringify(plan), id],
        });
        emitSSE('ticket-updated');
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

      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '');
      const time = now.toISOString().slice(11, 19).replace(/:/g, '');
      const id = `TICKET-${date}-${time}-manual`;

      const client = await getClient();
      await client.execute({
        sql: `INSERT INTO tickets (id, type, title, intent, status, author) VALUES (?, ?, ?, ?, 'Backlog', ?)`,
        args: [id, type, title, intent, getGitUsername()],
      });

      // Return refreshed kanban columns
      const statuses = ['Backlog', 'In Progress', 'In Review', 'Done'];
      const archiveStatuses = ['Blocked', 'Paused', 'Abandoned', 'Superseded'];
      const limit = 12;
      const columnData = await Promise.all(
        statuses.map(async (status) => {
          const result = await client.execute({
            sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, plan
                  FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
            args: [status, limit + 1],
          });
          const hasMore = result.rows.length > limit;
          const tickets = result.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
          return { status, tickets, hasMore };
        })
      );

      // Add Archived column
      const archiveResult = await client.execute({
        sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, plan
              FROM tickets WHERE status IN (?, ?, ?, ?) ORDER BY created_at DESC LIMIT ?`,
        args: [...archiveStatuses, limit + 1],
      });
      const archiveHasMore = archiveResult.rows.length > limit;
      const archiveTickets = archiveResult.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
      columnData.push({ status: 'Archived', tickets: archiveTickets, hasMore: archiveHasMore });

      emitSSE('ticket-updated');
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

      emitSSE('ticket-updated');
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
              assumptions, change_class, change_class_reason,
              origin_spec_id, plan, derived_knowledge, author, created_at, updated_at FROM tickets WHERE id = ?`,
        args: [id],
      });

      if (result.rows.length === 0) {
        return c.html('<div class="p-6 text-red-500">Ticket not found</div>', 404);
      }

      const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);
      const ticketComments = await fetchComments('ticket', id);
      // Trigger kanban refresh in the background
      c.header('HX-Trigger', 'refresh');
      emitSSE('ticket-updated');
      return c.html(renderTicketModal(ticket, ticketComments));
    } catch (error) {
      return c.html(`<div class="text-red-500 p-2">Error: ${(error as Error).message}</div>`, 500);
    }
  });

  // ── Partial Routes ──────────────────────────────────────────────

  // Kanban view
  app.get('/partials/kanban-view', (c) => {
    return c.html(renderKanbanView());
  });

  // Kanban columns - paginated per status (12 tickets per column initially)
  app.get('/partials/kanban-columns', async (c) => {
    try {
      const client = await getClient();
      const statuses = ['Backlog', 'In Progress', 'In Review', 'Done'];
      const archiveStatuses = ['Blocked', 'Paused', 'Abandoned', 'Superseded'];
      const limit = 12;

      const columnData = await Promise.all(
        statuses.map(async (status) => {
          const result = await client.execute({
            sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, plan
                  FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
            args: [status, limit + 1],
          });
          const hasMore = result.rows.length > limit;
          const tickets = result.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
          return { status, tickets, hasMore };
        })
      );

      // Add Archived column (Blocked, Paused, Abandoned, Superseded)
      const archiveResult = await client.execute({
        sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, plan
              FROM tickets WHERE status IN (?, ?, ?, ?) ORDER BY created_at DESC LIMIT ?`,
        args: [...archiveStatuses, limit + 1],
      });
      const archiveHasMore = archiveResult.rows.length > limit;
      const archiveTickets = archiveResult.rows.slice(0, limit).map((row) => parseTicketRow(row as Record<string, unknown>));
      columnData.push({ status: 'Archived', tickets: archiveTickets, hasMore: archiveHasMore });

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
      const limit = 12;

      const client = await getClient();
      let result;

      // Handle Archived column specially (multiple statuses)
      if (status === 'Archived') {
        const archiveStatuses = ['Blocked', 'Paused', 'Abandoned', 'Superseded'];
        result = await client.execute({
          sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, plan
                FROM tickets WHERE status IN (?, ?, ?, ?) ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          args: [...archiveStatuses, limit + 1, offset],
        });
      } else {
        result = await client.execute({
          sql: `SELECT id, type, title, status, intent, change_class, change_class_reason, plan
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

  // Ticket modal
  app.get('/partials/ticket-modal/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const client = await getClient();
      const result = await client.execute({
        sql: `SELECT id, type, title, status, intent, context, constraints_use, constraints_avoid,
              assumptions, change_class, change_class_reason,
              origin_spec_id, plan, derived_knowledge, author, created_at, updated_at FROM tickets WHERE id = ?`,
        args: [id],
      });

      if (result.rows.length === 0) {
        return c.html('<div class="p-6 text-red-500">Ticket not found</div>');
      }

      const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);
      const comments = await fetchComments('ticket', id);
      return c.html(renderTicketModal(ticket, comments));
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
}

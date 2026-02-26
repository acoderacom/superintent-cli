import type { Hono } from 'hono';
import { getClient } from '../../db/client.js';
import { parseSpecRow } from '../../db/parsers.js';
import { emitSSE } from '../sse.js';
import { getGitUsername } from '../../utils/git.js';
import { fetchComments } from './shared.js';
import {
  renderSpecView,
  renderSpecList,
  renderSpecMore,
  renderSpecModal,
  renderNewSpecModal,
  renderEditSpecModal,
} from '../components/index.js';

export function registerSpecRoutes(app: Hono) {

  // ── API Routes ──────────────────────────────────────────────────

  // List all specs (JSON)
  app.get('/api/specs', async (c) => {
    try {
      const client = await getClient();
      const limit = parseInt(c.req.query('limit') || '20', 10) || 20;
      const offset = parseInt(c.req.query('offset') || '0', 10) || 0;

      const result = await client.execute({
        sql: `SELECT id, title, author, created_at, updated_at
              FROM specs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        args: [limit, offset],
      });
      const specs = result.rows.map((row) => parseSpecRow(row as Record<string, unknown>));
      const hasMore = specs.length === limit;
      return c.json({ success: true, data: specs, pagination: { limit, offset, hasMore } });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  });

  // Get single spec (JSON)
  app.get('/api/specs/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const client = await getClient();
      const result = await client.execute({
        sql: 'SELECT * FROM specs WHERE id = ?',
        args: [id],
      });
      if (result.rows.length === 0) {
        return c.json({ success: false, error: 'Spec not found' }, 404);
      }
      const spec = parseSpecRow(result.rows[0] as Record<string, unknown>);
      return c.json({ success: true, data: spec });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 500);
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
        sql: 'SELECT id, title, content, author, created_at, updated_at FROM specs WHERE id = ?',
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

      const editSpecComments = await fetchComments('spec', id);
      c.header('HX-Trigger', 'refresh');
      emitSSE('spec-updated');
      return c.html(renderSpecModal(spec, relatedTickets, editSpecComments));
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

      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '');
      const time = now.toISOString().slice(11, 19).replace(/:/g, '');
      const id = `SPEC-${date}-${time}`;

      const author = getGitUsername();
      const client = await getClient();
      await client.execute({
        sql: `INSERT INTO specs (id, title, content, author) VALUES (?, ?, ?, ?)`,
        args: [id, title, content, author],
      });

      // Return refreshed spec list
      const specLimit = 12;
      const result = await client.execute({
        sql: 'SELECT id, title, content, author, created_at, updated_at FROM specs ORDER BY created_at DESC LIMIT ?',
        args: [specLimit + 1],
      });
      const specHasMore = result.rows.length > specLimit;
      const specs = result.rows.slice(0, specLimit).map((row) => parseSpecRow(row as Record<string, unknown>));

      const countResult = await client.execute({
        sql: 'SELECT origin_spec_id, COUNT(*) as cnt FROM tickets WHERE origin_spec_id IS NOT NULL GROUP BY origin_spec_id',
        args: [],
      });
      const ticketCounts: Record<string, number> = {};
      for (const row of countResult.rows) {
        ticketCounts[row.origin_spec_id as string] = Number(row.cnt);
      }

      emitSSE('spec-updated');
      return c.html(renderSpecList(specs, ticketCounts, specHasMore));
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
      const specLimit = 12;
      const result = await client.execute({
        sql: 'SELECT id, title, content, author, created_at, updated_at FROM specs ORDER BY created_at DESC LIMIT ?',
        args: [specLimit + 1],
      });
      const specHasMore = result.rows.length > specLimit;
      const specs = result.rows.slice(0, specLimit).map((row) => parseSpecRow(row as Record<string, unknown>));

      const countResult = await client.execute({
        sql: 'SELECT origin_spec_id, COUNT(*) as cnt FROM tickets WHERE origin_spec_id IS NOT NULL GROUP BY origin_spec_id',
        args: [],
      });
      const ticketCounts: Record<string, number> = {};
      for (const row of countResult.rows) {
        ticketCounts[row.origin_spec_id as string] = Number(row.cnt);
      }

      emitSSE('spec-updated');
      return c.html(renderSpecList(specs, ticketCounts, specHasMore));
    } catch (error) {
      return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
    }
  });

  // ── Partial Routes ──────────────────────────────────────────────

  // Spec view
  app.get('/partials/spec-view', (c) => {
    return c.html(renderSpecView());
  });

  // New spec modal
  app.get('/partials/new-spec-modal', (c) => {
    return c.html(renderNewSpecModal());
  });

  // Spec list (paginated)
  app.get('/partials/spec-list', async (c) => {
    try {
      const limit = 12;
      const client = await getClient();
      const result = await client.execute({
        sql: 'SELECT id, title, content, author, created_at, updated_at FROM specs ORDER BY created_at DESC LIMIT ?',
        args: [limit + 1],
      });
      const hasMore = result.rows.length > limit;
      const specs = result.rows.slice(0, limit).map((row) => parseSpecRow(row as Record<string, unknown>));

      // Get ticket counts per spec
      const countResult = await client.execute({
        sql: 'SELECT origin_spec_id, COUNT(*) as cnt FROM tickets WHERE origin_spec_id IS NOT NULL GROUP BY origin_spec_id',
        args: [],
      });
      const ticketCounts: Record<string, number> = {};
      for (const row of countResult.rows) {
        ticketCounts[row.origin_spec_id as string] = Number(row.cnt);
      }

      return c.html(renderSpecList(specs, ticketCounts, hasMore));
    } catch (error) {
      return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
    }
  });

  // Load more specs
  app.get('/partials/spec-more', async (c) => {
    try {
      const offset = parseInt(c.req.query('offset') || '0', 10);
      const limit = 12;
      const client = await getClient();
      const result = await client.execute({
        sql: 'SELECT id, title, content, author, created_at, updated_at FROM specs ORDER BY created_at DESC LIMIT ? OFFSET ?',
        args: [limit + 1, offset],
      });
      const hasMore = result.rows.length > limit;
      const specs = result.rows.slice(0, limit).map((row) => parseSpecRow(row as Record<string, unknown>));

      const countResult = await client.execute({
        sql: 'SELECT origin_spec_id, COUNT(*) as cnt FROM tickets WHERE origin_spec_id IS NOT NULL GROUP BY origin_spec_id',
        args: [],
      });
      const ticketCounts: Record<string, number> = {};
      for (const row of countResult.rows) {
        ticketCounts[row.origin_spec_id as string] = Number(row.cnt);
      }

      return c.html(renderSpecMore(specs, ticketCounts, offset + limit, hasMore));
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
        sql: 'SELECT id, title, content, author, created_at, updated_at FROM specs WHERE id = ?',
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

      const specComments = await fetchComments('spec', id);
      return c.html(renderSpecModal(spec, relatedTickets, specComments));
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
        sql: 'SELECT id, title, content, author, created_at, updated_at FROM specs WHERE id = ?',
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
}

import type { Hono } from 'hono';
import type { InValue } from '@libsql/client';
import { getClient } from '../../db/client.js';
import { parseKnowledgeRow } from '../../db/parsers.js';
import { performVectorSearch } from '../../db/search.js';
import { embed } from '../../embed/model.js';
import { emitSSE } from '../sse.js';
import { fetchComments, classifyHealth } from './shared.js';
import type { HealthStatus } from '../components/dashboard.js';
import { renderHealthEntriesModal } from '../components/widgets/knowledge-health-summary.js';
import {
  renderSearchView,
  renderSearchResults,
  renderKnowledgeView,
  renderKnowledgeList,
  renderKnowledgeMore,
  renderKnowledgeModal,
  renderGraphView,
} from '../components/index.js';

// Helper: build knowledge query conditions from filter params
function buildKnowledgeConditions(c: { req: { query: (key: string) => string | undefined } }) {
  const category = c.req.query('k-category');
  const namespace = c.req.query('k-namespace');
  const scope = c.req.query('k-scope');
  const sourceFilter = c.req.query('k-origin');
  const author = c.req.query('k-author');
  const branch = c.req.query('k-branch');
  const status = c.req.query('k-status') || 'active';
  const sort = c.req.query('k-sort') || 'newest';

  const conditions: string[] = [];
  const args: InValue[] = [];

  if (status === 'active') {
    conditions.push('active = 1');
  } else if (status === 'inactive') {
    conditions.push('active = 0');
  }

  if (category) { conditions.push('category = ?'); args.push(category); }
  if (namespace) { conditions.push('namespace = ?'); args.push(namespace); }
  if (scope) { conditions.push('decision_scope = ?'); args.push(scope); }
  if (sourceFilter) { conditions.push('source = ?'); args.push(sourceFilter); }
  if (author) { conditions.push('author LIKE ?'); args.push(`%${author}%`); }
  if (branch) { conditions.push('branch LIKE ?'); args.push(`%${branch}%`); }

  const orderByMap: Record<string, string> = {
    newest: 'created_at DESC',
    oldest: 'created_at ASC',
    updated: 'updated_at DESC',
    stale: 'updated_at ASC',
    usage: 'usage_count DESC',
    'least-used': 'usage_count ASC',
  };
  const orderBy = orderByMap[sort] || 'created_at DESC';

  const filters = { status, category, namespace, scope, source: sourceFilter, author, branch, sort };

  return { conditions, args, filters, orderBy };
}

export function registerKnowledgeRoutes(app: Hono) {

  // ── API Routes ──────────────────────────────────────────────────

  // Toggle knowledge active status
  app.patch('/api/knowledge/:id/active', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.parseBody();
      const active = body.active === 'true' ? 1 : 0;

      const client = await getClient();
      await client.execute({
        sql: 'UPDATE knowledge SET active = ? WHERE id = ?',
        args: [active, id],
      });

      // Fetch updated knowledge and return modal HTML
      const result = await client.execute({
        sql: `SELECT id, namespace, chunk_index, title, content,
              category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
              usage_count, last_used_at, author, branch, created_at, updated_at
              FROM knowledge WHERE id = ?`,
        args: [id],
      });

      if (result.rows.length === 0) {
        return c.html('<div class="p-6 text-red-500">Knowledge not found</div>', 404);
      }

      const knowledge = parseKnowledgeRow(result.rows[0] as Record<string, unknown>);
      const activeToggleComments = await fetchComments('knowledge', id);
      emitSSE('knowledge-updated');
      return c.html(renderKnowledgeModal(knowledge, activeToggleComments));
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

      if (status === 'active') {
        conditions.push('active = 1');
      } else if (status === 'inactive') {
        conditions.push('active = 0');
      }

      if (category) { conditions.push('category = ?'); args.push(category); }
      if (namespace) { conditions.push('namespace = ?'); args.push(namespace); }
      if (scope) { conditions.push('decision_scope = ?'); args.push(scope); }

      const limit = parseInt(c.req.query('limit') || '20', 10) || 20;
      const offset = parseInt(c.req.query('offset') || '0', 10) || 0;

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT id, namespace, title, category, tags, citations, source, confidence, active, decision_scope,
                   usage_count, author, branch, created_at, updated_at
                   FROM knowledge ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      args.push(limit, offset);

      const result = await client.execute({ sql, args });
      const knowledge = result.rows.map((row) => parseKnowledgeRow(row as Record<string, unknown>));
      const hasMore = knowledge.length === limit;
      return c.json({ success: true, data: knowledge, pagination: { limit, offset, hasMore } });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  });

  // Get single knowledge (JSON)
  app.get('/api/knowledge/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const client = await getClient();
      const result = await client.execute({
        sql: `SELECT id, namespace, chunk_index, title, content,
              category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
              usage_count, last_used_at, author, branch, created_at, updated_at
              FROM knowledge WHERE id = ?`,
        args: [id],
      });
      if (result.rows.length === 0) {
        return c.json({ success: false, error: 'Knowledge not found' }, 404);
      }
      const knowledge = parseKnowledgeRow(result.rows[0] as Record<string, unknown>);
      return c.json({ success: true, data: knowledge });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  });

  // Semantic search (JSON)
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
      const queryEmbedding = await embed(query, true);
      const results = await performVectorSearch(client, queryEmbedding, {
        namespace, category, limit, trackUsage: false,
      });
      return c.json({ success: true, data: { query, results } });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  });

  // Graph data for Knowledge Graph visualization
  app.get('/api/graph-data', async (c) => {
    try {
      const client = await getClient();
      const result = await client.execute({
        sql: `SELECT id, title, category, confidence, tags
              FROM knowledge WHERE active = 1 AND branch = 'main'`,
        args: [],
      });

      const entries = result.rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        category: (row.category as string) || 'architecture',
        confidence: (row.confidence as number) || 0.5,
        tags: (() => { try { return JSON.parse((row.tags as string) || '[]'); } catch { return []; } })() as string[],
      }));

      const nodes = entries.map((e) => ({
        id: e.id,
        label: e.title.length > 30 ? e.title.slice(0, 30) + '...' : e.title,
        category: e.category,
        confidence: e.confidence,
        tags: e.tags,
      }));

      const edges: { from: string; to: string; sharedCount: number; sharedTags: string[] }[] = [];
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const shared = entries[i].tags.filter((t) => entries[j].tags.includes(t));
          if (shared.length > 0) {
            edges.push({
              from: entries[i].id,
              to: entries[j].id,
              sharedCount: shared.length,
              sharedTags: shared,
            });
          }
        }
      }

      return c.json({ nodes, edges });
    } catch (error) {
      return c.json({ nodes: [], edges: [], error: (error as Error).message }, 500);
    }
  });

  // ── Partial Routes ──────────────────────────────────────────────

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
      const queryEmbedding = await embed(query, true);
      const results = await performVectorSearch(client, queryEmbedding, {
        namespace, category, limit, trackUsage: false,
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

  // Knowledge list (paginated)
  app.get('/partials/knowledge-list', async (c) => {
    try {
      const limit = 12;
      const client = await getClient();
      const { conditions, args, filters, orderBy } = buildKnowledgeConditions(c);

      let sql = `SELECT id, namespace, chunk_index, title, content,
                   category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                   usage_count, last_used_at, author, branch, created_at, updated_at
                   FROM knowledge`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      args.push(limit + 1);
      sql += ` ORDER BY ${orderBy} LIMIT ?`;

      const result = await client.execute({ sql, args });
      const hasMore = result.rows.length > limit;
      const knowledge = result.rows.slice(0, limit).map((row) => parseKnowledgeRow(row as Record<string, unknown>));
      return c.html(renderKnowledgeList(knowledge, hasMore, filters));
    } catch (error) {
      return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
    }
  });

  // Load more knowledge
  app.get('/partials/knowledge-more', async (c) => {
    try {
      const offset = parseInt(c.req.query('offset') || '0', 10);
      const limit = 12;
      const client = await getClient();
      const { conditions, args, filters, orderBy } = buildKnowledgeConditions(c);

      let sql = `SELECT id, namespace, chunk_index, title, content,
                   category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                   usage_count, last_used_at, author, branch, created_at, updated_at
                   FROM knowledge`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      args.push(limit + 1, offset);
      sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

      const result = await client.execute({ sql, args });
      const hasMore = result.rows.length > limit;
      const knowledge = result.rows.slice(0, limit).map((row) => parseKnowledgeRow(row as Record<string, unknown>));
      return c.html(renderKnowledgeMore(knowledge, offset + limit, hasMore, filters));
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
              category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
              usage_count, last_used_at, author, branch, created_at, updated_at
              FROM knowledge WHERE id = ?`,
        args: [id],
      });

      if (result.rows.length === 0) {
        return c.html('<div class="p-6 text-red-500">Knowledge entry not found</div>');
      }

      const knowledge = parseKnowledgeRow(result.rows[0] as Record<string, unknown>);
      const knowledgeComments = await fetchComments('knowledge', id);
      return c.html(renderKnowledgeModal(knowledge, knowledgeComments));
    } catch (error) {
      return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`);
    }
  });

  // Health entries drilldown modal
  app.get('/partials/health-entries/:status', async (c) => {
    try {
      const status = c.req.param('status') as HealthStatus;
      const validStatuses: HealthStatus[] = ['rising', 'stable', 'decaying', 'needsValidation', 'missing'];
      if (!validStatuses.includes(status)) {
        return c.html('<div class="p-6 text-red-500">Invalid health status</div>');
      }
      const client = await getClient();
      const { entries } = await classifyHealth(client);
      return c.html(renderHealthEntriesModal(status, entries[status]));
    } catch (error) {
      return c.html(`<div class="p-6 text-red-500">Error: ${(error as Error).message}</div>`);
    }
  });

  // Graph view
  app.get('/partials/graph-view', (c) => {
    return c.html(renderGraphView());
  });
}

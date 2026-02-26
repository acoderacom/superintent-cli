import type { Hono } from 'hono';
import { getClient } from '../../db/client.js';
import { parseCommentRow } from '../../db/parsers.js';
import { generateId } from '../../utils/id.js';
import { getGitUsername } from '../../utils/git.js';
import { emitSSE } from '../sse.js';
import { fetchComments } from './shared.js';
import type { Comment } from '../../types.js';
import {
  renderCommentsSection,
  renderEditCommentForm,
} from '../components/index.js';

export function registerCommentRoutes(app: Hono) {

  // ── API Routes ──────────────────────────────────────────────────

  // Create comment
  app.post('/api/comments', async (c) => {
    try {
      const body = await c.req.parseBody();
      const parentType = body.parent_type as string;
      const parentId = body.parent_id as string;
      const text = (body.text as string)?.trim();

      if (!parentType || !parentId || !text) {
        return c.html('<p class="text-red-500 text-sm">Comment text is required</p>', 400);
      }

      const client = await getClient();
      const commentId = generateId('COMMENT');
      const author = getGitUsername();
      await client.execute({
        sql: `INSERT INTO comments (id, parent_type, parent_id, author, text) VALUES (?, ?, ?, ?, ?)`,
        args: [commentId, parentType, parentId, author, text],
      });

      const comments = await fetchComments(parentType, parentId);
      emitSSE(`${parentType}-updated` as 'ticket-updated' | 'knowledge-updated' | 'spec-updated');
      return c.html(renderCommentsSection(comments, parentType as Comment['parent_type'], parentId));
    } catch (error) {
      return c.html(`<p class="text-red-500 text-sm">Error: ${(error as Error).message}</p>`, 500);
    }
  });

  // Update comment
  app.patch('/api/comments/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.parseBody();
      const text = (body.text as string)?.trim();

      if (!text) {
        return c.html('<p class="text-red-500 text-sm">Comment text is required</p>', 400);
      }

      const client = await getClient();
      await client.execute({
        sql: `UPDATE comments SET text = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [text, id],
      });

      // Return updated comment card
      const result = await client.execute({
        sql: 'SELECT id, parent_type, parent_id, author, text, created_at, updated_at FROM comments WHERE id = ?',
        args: [id],
      });
      if (result.rows.length === 0) {
        return c.html('', 404);
      }
      const comment = parseCommentRow(result.rows[0] as Record<string, unknown>);
      // Re-render the full comments section to keep state consistent
      const comments = await fetchComments(comment.parent_type, comment.parent_id);
      emitSSE(`${comment.parent_type}-updated` as 'ticket-updated' | 'knowledge-updated' | 'spec-updated');
      return c.html(renderCommentsSection(comments, comment.parent_type, comment.parent_id));
    } catch (error) {
      return c.html(`<p class="text-red-500 text-sm">Error: ${(error as Error).message}</p>`, 500);
    }
  });

  // Delete comment
  app.delete('/api/comments/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const client = await getClient();

      // Fetch parent info before deleting for SSE notification
      const commentResult = await client.execute({
        sql: 'SELECT parent_type FROM comments WHERE id = ?',
        args: [id],
      });

      await client.execute({
        sql: 'DELETE FROM comments WHERE id = ?',
        args: [id],
      });

      if (commentResult.rows.length > 0) {
        const parentType = commentResult.rows[0].parent_type as string;
        emitSSE(`${parentType}-updated` as 'ticket-updated' | 'knowledge-updated' | 'spec-updated');
      }

      // Return empty string to remove the comment card
      return c.html('');
    } catch (error) {
      return c.html(`<p class="text-red-500 text-sm">Error: ${(error as Error).message}</p>`, 500);
    }
  });

  // ── Partial Routes ──────────────────────────────────────────────

  // Get single comment (for cancel edit)
  app.get('/partials/comment/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const client = await getClient();
      const result = await client.execute({
        sql: 'SELECT id, parent_type, parent_id, author, text, created_at, updated_at FROM comments WHERE id = ?',
        args: [id],
      });
      if (result.rows.length === 0) {
        return c.html('', 404);
      }
      const comment = parseCommentRow(result.rows[0] as Record<string, unknown>);
      const comments = await fetchComments(comment.parent_type, comment.parent_id);
      return c.html(renderCommentsSection(comments, comment.parent_type, comment.parent_id));
    } catch (error) {
      return c.html(`<p class="text-red-500 text-sm">Error: ${(error as Error).message}</p>`, 500);
    }
  });

  // Edit comment form
  app.get('/partials/edit-comment/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const client = await getClient();
      const result = await client.execute({
        sql: 'SELECT id, parent_type, parent_id, author, text, created_at, updated_at FROM comments WHERE id = ?',
        args: [id],
      });
      if (result.rows.length === 0) {
        return c.html('', 404);
      }
      const comment = parseCommentRow(result.rows[0] as Record<string, unknown>);
      return c.html(renderEditCommentForm(comment));
    } catch (error) {
      return c.html(`<p class="text-red-500 text-sm">Error: ${(error as Error).message}</p>`, 500);
    }
  });
}

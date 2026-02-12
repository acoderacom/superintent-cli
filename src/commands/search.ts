import { Command } from 'commander';
import { getClient, closeClient } from '../db/client.js';
import { parseSearchRow } from '../db/parsers.js';
import { trackUsage } from '../db/usage.js';
import { embed } from '../embed/model.js';
import type { SearchResult, CliResponse } from '../types.js';

export const searchCommand = new Command('search')
  .description('Semantic search knowledge base')
  .argument('<query>', 'Search query')
  .option('--namespace <namespace>', 'Filter by namespace (project)')
  .option('--category <category>', 'Filter by category')
  .option('--ticket-type <type>', 'Filter by origin ticket type (feature|bugfix|refactor|docs|chore|test)')
  .option('--tags <tags...>', 'Filter by tags (OR logic)')
  .option('--min-score <n>', 'Minimum similarity score 0-1', '0')
  .option('--limit <n>', 'Max results', '5')
  .action(async (query, options) => {
    try {
      const client = await getClient();

      // Generate query embedding
      const queryEmbedding = await embed(query);

      // Build query with filters
      const conditions: string[] = ['k.active = 1'];
      const limit = parseInt(options.limit, 10);
      const topK = limit * 2; // Fetch extra for filtering
      const args: (string | number)[] = [
        JSON.stringify(queryEmbedding),
        JSON.stringify(queryEmbedding),
      ];

      if (options.namespace) {
        conditions.push('k.namespace = ?');
        args.push(options.namespace);
      }

      if (options.category) {
        conditions.push('k.category = ?');
        args.push(options.category);
      }

      if (options.ticketType) {
        conditions.push('k.origin_ticket_type = ?');
        args.push(options.ticketType);
      }

      // Build SQL with vector search (k must be literal, not bound parameter)
      const sql = `
        SELECT
          k.id, k.namespace, k.chunk_index, k.title, k.content,
          k.category, k.tags, k.source, k.origin_ticket_id, k.origin_ticket_type, k.confidence, k.active, k.decision_scope,
          k.usage_count, k.last_used_at, k.created_at,
          vector_distance_cos(k.embedding, vector32(?)) as distance
        FROM vector_top_k('knowledge_embedding_idx', vector32(?), ${topK}) AS v
        JOIN knowledge k ON k.rowid = v.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

      const result = await client.execute({ sql, args });

      // Filter by min score and tags
      const minScore = parseFloat(options.minScore);
      let results = result.rows
        .map((row) => parseSearchRow(row as Record<string, unknown>))
        .filter((r) => r.score >= minScore);

      // Filter by tags (OR logic) if provided
      if (options.tags && options.tags.length > 0) {
        results = results.filter((r) => {
          if (!r.tags) return false;
          return options.tags.some((tag: string) => r.tags!.includes(tag));
        });
      }

      // Track usage for returned results
      await trackUsage(results.map(r => r.id));

      closeClient();

      const response: CliResponse<{ query: string; results: SearchResult[] }> = {
        success: true,
        data: {
          query,
          results,
        },
      };
      console.log(JSON.stringify(response));
    } catch (error) {
      // Fallback to non-indexed search if vector index doesn't exist or fails
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('vector_top_k') || errorMessage.includes('vector index') || errorMessage.includes('no such table')) {
        try {
          const client = await getClient();
          const queryEmbedding = await embed(query);

          const conditions: string[] = ['active = 1'];
          const args: (string | number)[] = [JSON.stringify(queryEmbedding)];

          if (options.namespace) {
            conditions.push('namespace = ?');
            args.push(options.namespace);
          }

          if (options.category) {
            conditions.push('category = ?');
            args.push(options.category);
          }

          if (options.ticketType) {
            conditions.push('origin_ticket_type = ?');
            args.push(options.ticketType);
          }

          const sql = `
            SELECT
              id, namespace, chunk_index, title, content,
              category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
              usage_count, last_used_at, created_at,
              vector_distance_cos(embedding, vector32(?)) as distance
            FROM knowledge
            WHERE ${conditions.join(' AND ')}
            ORDER BY distance ASC
            LIMIT ?
          `;
          args.push(parseInt(options.limit, 10));

          const result = await client.execute({ sql, args });

          const minScore = parseFloat(options.minScore);
          let results = result.rows
            .map((row) => parseSearchRow(row as Record<string, unknown>))
            .filter((r) => r.score >= minScore);

          if (options.tags && options.tags.length > 0) {
            results = results.filter((r) => {
              if (!r.tags) return false;
              return options.tags.some((tag: string) => r.tags!.includes(tag));
            });
          }

          // Track usage for returned results
          await trackUsage(results.map(r => r.id));

          closeClient();

          const response: CliResponse<{ query: string; results: SearchResult[] }> = {
            success: true,
            data: {
              query,
              results,
            },
          };
          console.log(JSON.stringify(response));
          return;
        } catch (fallbackError) {
          const response: CliResponse = {
            success: false,
            error: `Search failed: ${(fallbackError as Error).message}`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }
      }

      const response: CliResponse = {
        success: false,
        error: `Search failed: ${errorMessage}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

import type { Client } from '@libsql/client';
import { parseSearchRow } from './parsers.js';
import { trackUsage } from './usage.js';
import type { SearchResult } from '../types.js';

export interface VectorSearchOptions {
  namespace?: string;
  category?: string;
  ticketType?: string;
  tags?: string[];
  author?: string;
  branch?: string;
  branches?: string[];
  minScore?: number;
  limit: number;
  trackUsage?: boolean;
}

export async function performVectorSearch(
  client: Client,
  queryEmbedding: number[],
  options: VectorSearchOptions,
): Promise<SearchResult[]> {
  const { minScore = 0 } = options;
  const safeLimit = Number.isFinite(options.limit) && options.limit >= 1
    ? Math.min(Math.floor(options.limit), 100)
    : 10;
  const topK = safeLimit * 2;

  const conditions: string[] = ['k.active = 1'];
  const embeddingJson = JSON.stringify(queryEmbedding);
  const filterArgs: (string | number)[] = [];

  if (options.namespace) {
    conditions.push('k.namespace = ?');
    filterArgs.push(options.namespace);
  }
  if (options.category) {
    conditions.push('k.category = ?');
    filterArgs.push(options.category);
  }
  if (options.ticketType) {
    conditions.push('k.origin_ticket_type = ?');
    filterArgs.push(options.ticketType);
  }
  if (options.author) {
    conditions.push('k.author = ?');
    filterArgs.push(options.author);
  }
  if (options.branches && options.branches.length > 0) {
    const placeholders = options.branches.map(() => '?').join(', ');
    conditions.push(`k.branch IN (${placeholders})`);
    filterArgs.push(...options.branches);
  } else if (options.branch) {
    conditions.push('k.branch = ?');
    filterArgs.push(options.branch);
  }

  const whereClause = conditions.join(' AND ');
  let result;

  try {
    result = await client.execute({
      sql: `
        SELECT
          k.id, k.namespace, k.chunk_index, k.title, k.content,
          k.category, k.tags, k.citations, k.source, k.origin_ticket_id, k.origin_ticket_type, k.confidence, k.active, k.decision_scope,
          k.usage_count, k.last_used_at, k.author, k.branch, k.created_at,
          vector_distance_cos(k.embedding, vector32(?)) as distance
        FROM vector_top_k('knowledge_embedding_idx', vector32(?), ${topK}) AS v
        JOIN knowledge k ON k.rowid = v.id
        WHERE ${whereClause}
        ORDER BY distance ASC
        LIMIT ?
      `,
      args: [embeddingJson, embeddingJson, ...filterArgs, safeLimit],
    });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes('vector_top_k') || msg.includes('vector index') || msg.includes('no such table')) {
      result = await client.execute({
        sql: `
          SELECT
            k.id, k.namespace, k.chunk_index, k.title, k.content,
            k.category, k.tags, k.citations, k.source, k.origin_ticket_id, k.origin_ticket_type, k.confidence, k.active, k.decision_scope,
            k.usage_count, k.last_used_at, k.created_at,
            vector_distance_cos(k.embedding, vector32(?)) as distance
          FROM knowledge k
          WHERE ${whereClause}
          ORDER BY distance ASC
          LIMIT ?
        `,
        args: [embeddingJson, ...filterArgs, safeLimit],
      });
    } else {
      throw error;
    }
  }

  let results = result.rows
    .map((row) => parseSearchRow(row as Record<string, unknown>))
    .filter((r) => r.score >= minScore);

  if (options.tags && options.tags.length > 0) {
    results = results.filter((r) => {
      if (!r.tags) return false;
      return options.tags!.some((tag) => r.tags!.includes(tag));
    });
  }

  if (options.trackUsage !== false) {
    await trackUsage(results.map((r) => r.id));
  }

  return results;
}

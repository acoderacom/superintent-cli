import type { Client } from '@libsql/client';
import { getClient } from '../../db/client.js';
import { parseCommentRow } from '../../db/parsers.js';
import { validateCitationAsync } from '../../utils/hash.js';
import type { Comment, Citation } from '../../types.js';
import type { HealthStatus, UsageHealth, CitationHealth } from '../components/dashboard.js';

export interface HealthCacheEntry { id: string; title: string; category: string; confidence: number }

export async function fetchComments(parentType: string, parentId: string): Promise<Comment[]> {
  const client = await getClient();
  const result = await client.execute({
    sql: 'SELECT id, parent_type, parent_id, author, text, created_at, updated_at FROM comments WHERE parent_type = ? AND parent_id = ? ORDER BY created_at ASC',
    args: [parentType, parentId],
  });
  return result.rows.map(row => parseCommentRow(row as Record<string, unknown>));
}

export async function classifyHealth(client: Client): Promise<{
  byUsageHealth: Record<UsageHealth, number>;
  byCitationHealth: Record<CitationHealth, number>;
  entries: Record<HealthStatus, HealthCacheEntry[]>;
}> {

  const DECAY_QUIET_DAYS = 7;
  const RISING_VELOCITY = 2.0;
  const RISING_MIN_USES = 3;
  const RISING_MIN_AGE_DAYS = 1;

  const entriesResult = await client.execute(
    `SELECT id, title, category, confidence, usage_count, citations,
            CAST((julianday('now') - julianday(created_at)) AS REAL) as age_days,
            CAST((julianday('now') - julianday(last_used_at)) AS REAL) as quiet_days
     FROM knowledge WHERE active = 1 AND branch = 'main'`
  );

  const byUsageHealth: Record<UsageHealth, number> = { rising: 0, stable: 0, decaying: 0 };
  const byCitationHealth: Record<CitationHealth, number> = { needsValidation: 0, missing: 0 };
  const entries: Record<HealthStatus, HealthCacheEntry[]> = {
    rising: [], stable: [], decaying: [], needsValidation: [], missing: [],
  };

  const cwd = process.cwd();
  const fileHashCache = new Map<string, string | null>();

  for (const row of entriesResult.rows) {
    const r = row as Record<string, unknown>;
    const usageCount = Number(r.usage_count ?? 0);
    const ageDays = Number(r.age_days ?? 0);
    const quietDays = Number(r.quiet_days ?? 0);
    const citationsRaw = r.citations as string | null;

    const entry: HealthCacheEntry = {
      id: String(r.id),
      title: String(r.title ?? ''),
      category: String(r.category ?? 'unknown'),
      confidence: Number(r.confidence ?? 0),
    };

    // Citation health dimension
    let hasMissing = false;
    let hasChanged = false;
    if (citationsRaw) {
      try {
        const citations: Citation[] = JSON.parse(citationsRaw);
        for (const c of citations) {
          const result = await validateCitationAsync(c, cwd, fileHashCache);
          if (result.status === 'missing') hasMissing = true;
          else if (result.status === 'changed') hasChanged = true;
        }
      } catch { /* malformed citations → skip */ }
    }

    // Citation health: only track issues
    if (hasMissing) {
      byCitationHealth.missing++;
      entries.missing.push(entry);
    } else if (hasChanged && usageCount > 0) {
      byCitationHealth.needsValidation++;
      entries.needsValidation.push(entry);
    }

    // Usage health dimension
    let usageStatus: UsageHealth;
    if (usageCount > 0 && quietDays > DECAY_QUIET_DAYS) {
      usageStatus = 'decaying';
    } else if (ageDays >= RISING_MIN_AGE_DAYS && ageDays > 0 && (usageCount / ageDays) > RISING_VELOCITY && usageCount >= RISING_MIN_USES) {
      usageStatus = 'rising';
    } else {
      usageStatus = 'stable';
    }

    byUsageHealth[usageStatus]++;
    entries[usageStatus].push(entry);
  }

  return { byUsageHealth, byCitationHealth, entries };
}

/**
 * Knowledge usage tracking utilities.
 */

import { getClient } from './client.js';

/**
 * Track usage for knowledge entries by incrementing usage_count and updating last_used_at.
 * Silently fails on error since usage tracking is non-critical.
 */
export async function trackUsage(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const client = await getClient();
    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(',');
    await client.execute({
      sql: `UPDATE knowledge SET usage_count = usage_count + 1, last_used_at = ? WHERE id IN (${placeholders})`,
      args: [now, ...ids],
    });
  } catch {
    // Silently fail - usage tracking is non-critical
  }
}

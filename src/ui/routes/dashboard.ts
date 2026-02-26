import type { Hono } from 'hono';
import { getClient, closeClient } from '../../db/client.js';
import { classifyHealth } from './shared.js';
import { getCoverageStats } from '../../wiki/indexer.js';
import type { DashboardData, KnowledgeHealthData, WikiCoverageData } from '../components/dashboard.js';
import {
  renderDashboardView,
  renderDashboardGrid,
} from '../components/index.js';

export function registerDashboardRoutes(app: Hono) {

  // Dashboard view
  app.get('/partials/dashboard-view', (c) => {
    return c.html(renderDashboardView());
  });

  // Dashboard grid (async data aggregation)
  app.get('/partials/dashboard-grid', async (c) => {
    try {
      const client = await getClient();
      try {
        // Aggregate knowledge stats
        const statsResult = await client.execute(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count,
             SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) as inactive_count,
             AVG(CASE WHEN active = 1 THEN confidence ELSE NULL END) as avg_confidence
           FROM knowledge WHERE branch = 'main'`
        );
        const stats = statsResult.rows[0] as Record<string, unknown>;
        const total = Number(stats.total ?? 0);
        const activeCount = Number(stats.active_count ?? 0);
        const inactiveCount = Number(stats.inactive_count ?? 0);
        const avgConfidence = Number(stats.avg_confidence ?? 0);

        // Category breakdown (active only)
        const catResult = await client.execute(
          `SELECT category, COUNT(*) as cnt FROM knowledge WHERE active = 1 AND branch = 'main' GROUP BY category ORDER BY cnt DESC`
        );
        const byCategory: Record<string, number> = {};
        for (const row of catResult.rows) {
          const r = row as Record<string, unknown>;
          byCategory[String(r.category ?? 'unknown')] = Number(r.cnt ?? 0);
        }

        // Health classification — usage + citation dimensions
        const { byUsageHealth, byCitationHealth } = await classifyHealth(client);

        // Recent entries (last 7 days)
        const recentResult = await client.execute(
          `SELECT COUNT(*) as cnt FROM knowledge WHERE active = 1 AND branch = 'main' AND created_at >= datetime('now', '-7 days')`
        );
        const recentCount = Number((recentResult.rows[0] as Record<string, unknown>).cnt ?? 0);

        const lastKnowledgeResult = await client.execute(
          `SELECT MAX(updated_at) as last_indexed FROM knowledge WHERE branch = 'main'`
        );
        const knowledgeLastIndexedAt = lastKnowledgeResult.rows[0]?.last_indexed as string | null;

        const knowledgeHealth: KnowledgeHealthData = {
          total,
          active: activeCount,
          inactive: inactiveCount,
          avgConfidence,
          byCategory,
          byUsageHealth,
          byCitationHealth,
          recentCount,
          lastIndexedAt: knowledgeLastIndexedAt,
        };

        // Wiki coverage data (best-effort — wiki tables may be empty)
        let wikiCoverage: WikiCoverageData | undefined;
        try {
          const wikiStats = await getCoverageStats(client);
          const lastIndexResult = await client.execute({
            sql: `SELECT MAX(updated_at) as last_indexed FROM wiki_pages`,
            args: [],
          });
          const lastIndexedAt = lastIndexResult.rows[0]?.last_indexed as string | null;
          wikiCoverage = {
            ...wikiStats,
            lastIndexedAt,
          };
        } catch {
          // Wiki tables may not exist yet
        }

        const dashboardData: DashboardData = { knowledgeHealth, wikiCoverage };
        return c.html(renderDashboardGrid(dashboardData));
      } finally {
        await closeClient();
      }
    } catch (err) {
      console.error('Dashboard grid error:', err);
      return c.html(`
        <div class="flex flex-col items-center justify-center py-16 text-red-400">
          <p class="text-sm">Failed to load dashboard data</p>
        </div>
      `);
    }
  });
}

import type { Hono } from 'hono';
import { getClient, closeClient } from '../../db/client.js';
import { classifyHealth } from './shared.js';
import { renderCitationHealthSection } from '../components/widgets/knowledge-health-summary.js';
import { getCoverageStats } from '../../wiki/indexer.js';
import type { DashboardData, KnowledgeHealthData, WikiCoverageData, TicketActivityData, CitationHealth } from '../components/dashboard.js';
import {
  renderDashboardView,
  renderDashboardGrid,
} from '../components/index.js';

// In-memory cache for citation health results (survives refreshes, resets on server restart)
let citationHealthCache: Record<CitationHealth, number> | null = null;

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

        // Usage health (lightweight — DB only, no file I/O)
        // Citation health uses cached results if available, otherwise shows placeholder
        const byUsageHealth = { rising: 0, stable: 0, decaying: 0 };
        const byCitationHealth = citationHealthCache ?? { needsValidation: 0, missing: 0 };

        // Compute usage health from DB
        const usageResult = await client.execute(
          `SELECT usage_count,
                  CAST((julianday('now') - julianday(created_at)) AS REAL) as age_days,
                  CAST((julianday('now') - julianday(last_used_at)) AS REAL) as quiet_days
           FROM knowledge WHERE active = 1 AND branch = 'main'`
        );
        for (const row of usageResult.rows) {
          const r = row as Record<string, unknown>;
          const usageCount = Number(r.usage_count ?? 0);
          const ageDays = Number(r.age_days ?? 0);
          const quietDays = Number(r.quiet_days ?? 0);
          if (usageCount > 0 && quietDays > 7) {
            byUsageHealth.decaying++;
          } else if (ageDays >= 1 && ageDays > 0 && (usageCount / ageDays) > 2.0 && usageCount >= 3) {
            byUsageHealth.rising++;
          } else {
            byUsageHealth.stable++;
          }
        }

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
          citationHealthValidated: citationHealthCache !== null,
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

        // Ticket activity data (best-effort)
        let ticketActivity: TicketActivityData | undefined;
        try {
          const ticketTotalResult = await client.execute(
            `SELECT COUNT(*) as total FROM tickets`
          );
          const ticketTotal = Number((ticketTotalResult.rows[0] as Record<string, unknown>).total ?? 0);

          const ticketStatusResult = await client.execute(
            `SELECT status, COUNT(*) as cnt FROM tickets GROUP BY status`
          );
          const byStatus: Record<string, number> = {};
          for (const row of ticketStatusResult.rows) {
            const r = row as Record<string, unknown>;
            byStatus[String(r.status ?? 'Unknown')] = Number(r.cnt ?? 0);
          }

          const ticketRecentResult = await client.execute(
            `SELECT COUNT(*) as cnt FROM tickets WHERE created_at >= datetime('now', '-7 days')`
          );
          const ticketRecentCount = Number((ticketRecentResult.rows[0] as Record<string, unknown>).cnt ?? 0);

          ticketActivity = { total: ticketTotal, byStatus, recentCount: ticketRecentCount };
        } catch {
          // Tickets table may not exist yet
        }

        const dashboardData: DashboardData = { knowledgeHealth, wikiCoverage, ticketActivity };
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

  // On-demand citation health validation (expensive — reads files + SHA-256)
  // Results are cached in memory so subsequent dashboard refreshes show last known state
  app.get('/partials/dashboard-citation-health', async (c) => {
    try {
      const client = await getClient();
      try {
        const { byCitationHealth } = await classifyHealth(client);
        citationHealthCache = byCitationHealth;
        c.header('HX-Trigger', 'refreshDashboard');
        return c.html(renderCitationHealthSection(byCitationHealth));
      } finally {
        await closeClient();
      }
    } catch (err) {
      console.error('Citation health error:', err);
      return c.html(`<p class="text-xs text-red-400">Failed to validate citations</p>`);
    }
  });
}

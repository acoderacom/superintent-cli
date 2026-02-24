// Knowledge Health Summary widget — stats panel + server-rendered SVG donut
import type { WidgetDefinition, DashboardData, HealthStatus } from '../dashboard.js';

function renderKnowledgeHealthSummary(data: DashboardData): string {
  const kh = data.knowledgeHealth;

  // Health score: weighted formula
  const activeRatio = kh.total > 0 ? kh.active / kh.total : 0;
  const healthyCount = kh.byHealth.healthy || 0;
  const healthyRatio = kh.active > 0 ? healthyCount / kh.active : 0;
  const recentRatio = kh.active > 0 ? Math.min(kh.recentCount / kh.active, 1) : 0;
  const healthScore = Math.round(
    (activeRatio * 0.3 + kh.avgConfidence * 0.3 + healthyRatio * 0.25 + recentRatio * 0.15) * 100
  );

  // Health score color
  const scoreColor = healthScore >= 70
    ? 'text-green-600 dark:text-green-400'
    : healthScore >= 40
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';

  const scoreBg = healthScore >= 70
    ? 'bg-green-50 dark:bg-green-900/20'
    : healthScore >= 40
      ? 'bg-yellow-50 dark:bg-yellow-900/20'
      : 'bg-red-50 dark:bg-red-900/20';

  // Health status breakdown
  const statusLabels: Record<HealthStatus, { label: string; color: string }> = {
    healthy: { label: 'Healthy', color: 'bg-green-500' },
    rising: { label: 'Rising', color: 'bg-blue-500' },
    needsValidation: { label: 'Needs Validation', color: 'bg-yellow-500' },
    decaying: { label: 'Decaying', color: 'bg-orange-500' },
    stale: { label: 'Stale', color: 'bg-red-500' },
  };

  const statusBars = (Object.keys(statusLabels) as HealthStatus[])
    .filter(s => (kh.byHealth[s] || 0) > 0)
    .map(s => {
      const count = kh.byHealth[s] || 0;
      const pct = kh.active > 0 ? Math.round((count / kh.active) * 100) : 0;
      const info = statusLabels[s];
      return `
        <div class="flex items-center gap-2 text-xs">
          <span class="size-2 rounded-full ${info.color} shrink-0"></span>
          <span class="text-gray-600 dark:text-gray-400 flex-1">${info.label}</span>
          <span class="text-gray-800 dark:text-gray-200 font-medium">${count}</span>
          <span class="text-gray-400 dark:text-gray-500 w-8 text-right">${pct}%</span>
        </div>`;
    })
    .join('');

  // Empty state
  if (kh.total === 0) {
    return `
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <svg class="size-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/>
        </svg>
        <p class="text-sm">No knowledge entries yet</p>
      </div>`;
  }

  return `
    <div class="flex flex-col lg:flex-row gap-4 h-full">
      <!-- Left: Stats Panel -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <!-- Health Score -->
        <div class="flex items-center justify-center gap-3 ${scoreBg} rounded-lg px-3 py-2">
          <div class="${scoreColor} text-2xl font-bold">${healthScore}%</div>
          <div class="${scoreColor} text-xs leading-tight">Health Score</div>
        </div>

        <!-- Key Metrics -->
        <div class="grid grid-cols-2 gap-2">
          <div class="text-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
            <div class="text-lg font-semibold text-gray-800 dark:text-gray-200">${kh.total}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Total</div>
          </div>
          <div class="text-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
            <div class="text-lg font-semibold text-green-600 dark:text-green-400">${kh.active}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Active</div>
          </div>
          <div class="text-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
            <div class="text-lg font-semibold text-red-600 dark:text-red-400">${kh.inactive}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Inactive</div>
          </div>
          <div class="text-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
            <div class="text-lg font-semibold text-blue-600 dark:text-blue-400">${Math.round(kh.avgConfidence * 100)}%</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Avg Confidence</div>
          </div>
        </div>

        <!-- Health Status Breakdown -->
        <div class="flex flex-col gap-1.5">
          ${statusBars || '<p class="text-xs text-gray-400 dark:text-gray-500">No active entries</p>'}
        </div>
      </div>

      <!-- Right: Chart placeholder -->
      <div class="flex-1 flex flex-col items-center justify-center min-w-0 text-gray-300 dark:text-gray-600">
        <div class="border-2 border-dashed border-gray-200 dark:border-dark-border rounded-lg flex items-center justify-center" style="width: 200px; height: 160px;">
          <span class="text-xs text-gray-400 dark:text-gray-500">[chart placeholder]</span>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">By Category</p>
      </div>
    </div>`;
}

export const knowledgeHealthSummaryWidget: WidgetDefinition = {
  id: 'knowledge-health-summary',
  title: 'Knowledge Health',
  size: 'L',
  render: renderKnowledgeHealthSummary,
};

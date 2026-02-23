// Knowledge Health Summary widget — stats panel + server-rendered SVG donut
import type { WidgetDefinition, DashboardData, HealthStatus } from '../dashboard.js';

const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#6366f1', '#14b8a6', '#f97316',
];

// SVG arc path for a donut segment (server-side, no D3 needed)
function describeArc(cx: number, cy: number, outerR: number, innerR: number, startAngle: number, endAngle: number): string {
  // Clamp near-full arcs to avoid SVG rendering glitch
  const gap = endAngle - startAngle;
  if (gap >= Math.PI * 2 - 0.001) {
    // Full circle: draw two half-arcs
    const mid = startAngle + Math.PI;
    return describeArc(cx, cy, outerR, innerR, startAngle, mid) + ' ' +
           describeArc(cx, cy, outerR, innerR, mid, endAngle - 0.001);
  }

  const x1 = cx + outerR * Math.sin(startAngle);
  const y1 = cy - outerR * Math.cos(startAngle);
  const x2 = cx + outerR * Math.sin(endAngle);
  const y2 = cy - outerR * Math.cos(endAngle);
  const x3 = cx + innerR * Math.sin(endAngle);
  const y3 = cy - innerR * Math.cos(endAngle);
  const x4 = cx + innerR * Math.sin(startAngle);
  const y4 = cy - innerR * Math.cos(startAngle);

  const largeArc = gap > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

function renderDonutSvg(categories: [string, number][]): string {
  const total = categories.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return '';

  const width = 200;
  const legendRows = Math.ceil(categories.length / 4);
  const legendHeight = legendRows * 16 + 4;
  const chartHeight = 160 - legendHeight;
  const cx = width / 2;
  const cy = chartHeight / 2;
  const outerR = Math.min(width, chartHeight) / 2 - 4;
  const innerR = outerR * 0.6;

  let currentAngle = 0;
  const paths = categories.map(([label, value], i) => {
    const sliceAngle = (value / total) * Math.PI * 2;
    const startAngle = currentAngle;
    currentAngle += sliceAngle;
    const pct = Math.round((value / total) * 100);
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `<path d="${describeArc(cx, cy, outerR, innerR, startAngle, currentAngle)}" fill="${color}" style="cursor:pointer"><title>${label}: ${value} (${pct}%)</title></path>`;
  });

  // Legend
  const itemWidth = Math.floor(width / Math.min(categories.length, 4));
  const legendItems = categories.map(([label], i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const tx = col * itemWidth;
    const ty = chartHeight + row * 16;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const truncated = label.length > 8 ? label.slice(0, 7) + '\u2026' : label;
    return `<g transform="translate(${tx},${ty})"><rect width="8" height="8" rx="2" fill="${color}"/><text x="11" y="8" font-size="9" class="donut-legend-text">${truncated}</text></g>`;
  });

  return `<svg width="${width}" height="160" viewBox="0 0 ${width} 160" xmlns="http://www.w3.org/2000/svg">
    <style>.donut-legend-text { fill: #6b7280; } :root.dark .donut-legend-text { fill: #9ca3af; }</style>
    ${paths.join('\n    ')}
    ${legendItems.join('\n    ')}
  </svg>`;
}

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

  const categories = Object.entries(kh.byCategory).sort((a, b) => b[1] - a[1]) as [string, number][];

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
        <div class="flex items-center gap-3 ${scoreBg} rounded-lg px-3 py-2">
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

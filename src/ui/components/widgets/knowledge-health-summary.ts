// Knowledge Health Summary widget — stats panel with usage & citation health groups
import type { WidgetDefinition, DashboardData, HealthStatus, UsageHealth, CitationHealth } from '../dashboard.js';
import { escapeHtml } from '../utils.js';

const usageLabels: Record<UsageHealth, { label: string; color: string; dot: string }> = {
  rising: { label: 'Rising', color: 'bg-blue-500', dot: 'bg-blue-500' },
  stable: { label: 'Stable', color: 'bg-green-500', dot: 'bg-green-500' },
  decaying: { label: 'Decaying', color: 'bg-orange-500', dot: 'bg-orange-500' },
};

const citationLabels: Record<CitationHealth, { label: string; color: string; dot: string }> = {
  needsValidation: { label: 'Needs Validation', color: 'bg-yellow-500', dot: 'bg-yellow-500' },
  missing: { label: 'Missing', color: 'bg-red-500', dot: 'bg-red-500' },
};

const allStatusLabels: Record<HealthStatus, { label: string; color: string; dot: string }> = {
  ...usageLabels,
  ...citationLabels,
};

/** Largest-remainder rounding so percentages always sum to 100% */
function roundToHundred(values: number[]): number[] {
  const floored = values.map(v => Math.floor(v));
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const fractions = values.map((v, i) => ({ i, f: v - floored[i] }));
  fractions.sort((a, b) => b.f - a.f);
  for (const { i } of fractions) {
    if (remainder <= 0) break;
    floored[i]++;
    remainder--;
  }
  return floored;
}

function renderHealthBars<T extends string>(
  labels: Record<T, { label: string; color: string; dot: string }>,
  counts: Record<T, number>,
  total: number,
  showPct = true,
): string {
  const keys = Object.keys(labels) as T[];
  const rawPcts = keys.map(s => total > 0 ? ((counts[s] || 0) / total) * 100 : 0);
  const pcts = total > 0 ? roundToHundred(rawPcts) : rawPcts.map(() => 0);

  return keys
    .map((s, i) => {
      const count = counts[s] || 0;
      const info = labels[s];
      return `
        <div class="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded -mx-1 px-1"
             hx-get="/partials/health-entries/${s}"
             hx-target="#modal-content"
             hx-trigger="click"
             onclick="showModal()">
          <span class="size-2 rounded-full ${info.color} shrink-0"></span>
          <span class="text-gray-600 dark:text-gray-400 flex-1">${info.label}</span>
          <span class="text-gray-800 dark:text-gray-200 font-medium">${count}</span>
          ${showPct ? `<span class="text-gray-400 dark:text-gray-500 w-8 text-right">${pcts[i]}%</span>` : ''}
        </div>`;
    })
    .join('');
}

function renderKnowledgeHealthSummary(data: DashboardData): string {
  const kh = data.knowledgeHealth;

  // Health score: weighted formula
  const activeRatio = kh.total > 0 ? kh.active / kh.total : 0;
  const issueCount = (kh.byCitationHealth.missing || 0) + (kh.byCitationHealth.needsValidation || 0) + (kh.byUsageHealth.decaying || 0);
  const noIssuesRatio = kh.active > 0 ? Math.max(0, (kh.active - issueCount) / kh.active) : 0;
  const recentRatio = kh.active > 0 ? Math.min(kh.recentCount / kh.active, 1) : 0;
  const healthScore = Math.round(
    (activeRatio * 0.3 + kh.avgConfidence * 0.3 + noIssuesRatio * 0.25 + recentRatio * 0.15) * 100
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

  // Health status breakdowns by group
  const usageBars = renderHealthBars(usageLabels, kh.byUsageHealth, kh.active);
  const citationTotal = (kh.byCitationHealth.needsValidation || 0) + (kh.byCitationHealth.missing || 0);
  const citationBars = citationTotal > 0 ? renderHealthBars(citationLabels, kh.byCitationHealth, citationTotal, false) : '';

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
      </div>

      <!-- Right: Health Breakdowns -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <!-- Usage Health -->
        <div>
          <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Usage Health</h4>
          <div class="flex flex-col gap-1.5">
            ${usageBars || '<p class="text-xs text-gray-400 dark:text-gray-500">No data available</p>'}
          </div>
        </div>

        <!-- Citation Health -->
        <div>
          <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Citation Health</h4>
          <div class="flex flex-col gap-1.5">
            ${citationBars || '<p class="text-xs text-gray-400 dark:text-gray-500">All citations valid</p>'}
          </div>
        </div>

      </div>
    </div>`;
}

export const knowledgeHealthSummaryWidget: WidgetDefinition = {
  id: 'knowledge-health-summary',
  title: 'Knowledge Health (Main Branch)',
  size: 'M',
  render: renderKnowledgeHealthSummary,
};

// Modal listing entries for a given health status
export function renderHealthEntriesModal(
  status: HealthStatus,
  entries: { id: string; title: string; category: string; confidence: number }[],
): string {
  const info = allStatusLabels[status];
  const categoryColors: Record<string, string> = {
    pattern: 'purple', truth: 'green', principle: 'orange',
    architecture: 'blue', gotcha: 'red', convention: 'cyan',
    decision: 'indigo', reference: 'gray', workflow: 'slate', insight: 'yellow',
  };

  const rows = entries.map(e => {
    const catColor = categoryColors[e.category] || 'gray';
    return `
      <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer border-b border-gray-100 dark:border-dark-border last:border-b-0"
           hx-get="/partials/knowledge-modal/${encodeURIComponent(e.id)}"
           hx-target="#modal-content"
           hx-trigger="click"
           onclick="event.stopPropagation()">
        <span class="size-2 rounded-full ${info.dot} shrink-0"></span>
        <span class="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">${escapeHtml(e.title)}</span>
        <span class="px-1.5 py-0.5 text-xs rounded bg-${catColor}-100 dark:bg-${catColor}-900/30 text-${catColor}-700 dark:text-${catColor}-300">${escapeHtml(e.category)}</span>
        <span class="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">${Math.round(e.confidence * 100)}%</span>
        <button type="button"
                class="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer shrink-0"
                title="Copy knowledge ID"
                onclick="event.stopPropagation(); event.preventDefault(); navigator.clipboard.writeText('${escapeHtml(e.id)}').then(() => { const svg = this.querySelector('svg'); const orig = svg.innerHTML; svg.innerHTML = '<path stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; stroke-width=&quot;2&quot; d=&quot;M5 13l4 4L19 7&quot;></path>'; this.classList.add('text-green-600'); setTimeout(() => { svg.innerHTML = orig; this.classList.remove('text-green-600'); }, 1500); })">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        </button>
      </div>`;
  }).join('');

  return `
    <div class="p-6 max-w-2xl mx-auto">
      <div class="flex items-center gap-3 mb-4">
        <span class="size-3 rounded-full ${info.color}"></span>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">${info.label}</h2>
        <span class="text-sm text-gray-500 dark:text-gray-400">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      ${entries.length > 0
        ? `<div class="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">${rows}</div>`
        : '<p class="text-sm text-gray-500 dark:text-gray-400">No entries in this category.</p>'
      }
    </div>`;
}

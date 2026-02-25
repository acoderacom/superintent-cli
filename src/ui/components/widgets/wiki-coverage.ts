// Wiki Coverage widget — shows code-to-knowledge coverage stats
import type { WidgetDefinition, DashboardData } from '../dashboard.js';

function renderWikiCoverage(data: DashboardData): string {
  const wc = data.wikiCoverage;

  // Empty state
  if (!wc || wc.totalFiles === 0) {
    return `
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2">
        <svg class="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"/>
        </svg>
        <p class="text-sm">No wiki data yet</p>
        <button type="button"
                hx-post="/api/wiki/index"
                hx-swap="none"
                class="mt-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer">
          Index Now
        </button>
      </div>`;
  }

  // Progress bar color
  const barColor = wc.coveragePercent >= 50 ? 'green' : wc.coveragePercent >= 20 ? 'yellow' : 'red';
  const pctColor = `text-${barColor}-600 dark:text-${barColor}-400`;

  // Last indexed
  const lastIndexed = wc.lastIndexedAt
    ? new Date(wc.lastIndexedAt).toLocaleString()
    : 'Unknown';

  return `
    <div class="flex flex-col gap-3 h-full">
      <!-- Coverage % -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-300">Coverage</span>
        <span class="text-xl font-bold ${pctColor}">${wc.coveragePercent}%</span>
      </div>

      <!-- Progress bar -->
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div class="bg-${barColor}-500 h-2 rounded-full transition-all" style="width: ${wc.coveragePercent}%"></div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-2">
        <div class="text-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
          <div class="text-sm font-semibold text-gray-800 dark:text-gray-200">${wc.coveredFiles}/${wc.totalFiles}</div>
          <div class="text-[10px] text-gray-500 dark:text-gray-400">Files</div>
        </div>
        <div class="text-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
          <div class="text-sm font-semibold text-gray-800 dark:text-gray-200">${wc.coveredElements}/${wc.totalElements}</div>
          <div class="text-[10px] text-gray-500 dark:text-gray-400">Elements</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-auto flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
        <span>Indexed ${lastIndexed}</span>
        <a hx-get="/partials/wiki-view"
           hx-target="#tab-content"
           hx-swap="innerHTML"
           hx-push-url="false"
           class="text-blue-500 dark:text-blue-400 hover:underline cursor-pointer">Open Wiki Tab</a>
      </div>
    </div>`;
}

export const wikiCoverageWidget: WidgetDefinition = {
  id: 'wiki-coverage',
  title: 'Wiki Coverage',
  size: 'S',
  render: renderWikiCoverage,
};

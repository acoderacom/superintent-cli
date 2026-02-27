// Dashboard component
import { escapeHtml } from './utils.js';
import { knowledgeHealthSummaryWidget } from './widgets/knowledge-health-summary.js';
import { wikiCoverageWidget } from './widgets/wiki-coverage.js';
import { ticketActivityWidget } from './widgets/ticket-activity.js';

// ============ Widget Architecture ============

export type WidgetSize = 'S' | 'M' | 'L' | 'XL';

export interface WidgetDefinition {
  id: string;
  title: string;
  size: WidgetSize;
  render: (data: DashboardData) => string;
  renderHeaderActions?: () => string;
}

export type UsageHealth = 'rising' | 'stable' | 'decaying';
export type CitationHealth = 'needsValidation' | 'missing';
export type HealthStatus = UsageHealth | CitationHealth;

export interface HealthEntry {
  id: string;
  title: string;
  category: string;
  confidence: number;
  usageCount: number;
  ageDays: number;
  healthStatus: HealthStatus;
}

export interface KnowledgeHealthData {
  total: number;
  active: number;
  inactive: number;
  avgConfidence: number;
  byCategory: Record<string, number>;
  byUsageHealth: Record<UsageHealth, number>;
  byCitationHealth: Record<CitationHealth, number>;
  citationHealthValidated: boolean; // true if citation health has been validated at least once
  recentCount: number; // entries created in last 7 days
  lastIndexedAt: string | null;
}

export interface WikiCoverageData {
  totalFiles: number;
  coveredFiles: number;
  totalElements: number;
  coveredElements: number;
  coveragePercent: number;
  lastIndexedAt: string | null;
}

export interface TicketActivityData {
  total: number;
  byStatus: Record<string, number>;
  recentCount: number; // created in last 7 days
}

export interface DashboardData {
  knowledgeHealth: KnowledgeHealthData;
  wikiCoverage?: WikiCoverageData;
  ticketActivity?: TicketActivityData;
}

// Size → CSS grid span mapping (responsive)
const sizeToGridClasses: Record<WidgetSize, string> = {
  S: 'col-span-1',
  M: 'col-span-1 md:col-span-2',
  L: 'col-span-1 md:col-span-2 lg:row-span-2',
  XL: 'col-span-1 md:col-span-2 lg:col-span-4',
};

// ============ Widget Registry ============
// To add a widget: import it and push here. No other changes needed.

const widgetRegistry: WidgetDefinition[] = [
  knowledgeHealthSummaryWidget,
  wikiCoverageWidget,
  ticketActivityWidget,
];

// ============ Dashboard View (HTMX shell) ============

export function renderDashboardView(): string {
  return `
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h1>
        <button type="button"
                class="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors cursor-pointer"
                onclick="this.classList.add('refresh-spin'); var btn=this; htmx.trigger('#dashboard-grid', 'refresh'); document.getElementById('dashboard-grid').addEventListener('htmx:afterSettle', function h(){ btn.classList.remove('refresh-spin'); document.getElementById('dashboard-grid').removeEventListener('htmx:afterSettle', h); })">
          <svg class="w-3 h-3 inline-block mr-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Refresh
        </button>
      </div>
      <style>
        #dashboard-grid > .grid {
          opacity: 1;
          transition: opacity 300ms ease-in;
        }
        #dashboard-grid.htmx-settling > .grid {
          opacity: 0;
        }
        @keyframes spin-refresh { to { transform: rotate(360deg) } }
        .refresh-spin svg { animation: spin-refresh 0.8s linear infinite; }
        .refresh-spin { pointer-events: none; }
      </style>
      <div id="dashboard-grid"
           hx-get="/partials/dashboard-grid"
           hx-trigger="load, refresh"
           hx-swap="innerHTML settle:300ms">
        <div class="flex flex-col justify-center items-center gap-3" style="height: calc(100dvh - 160px);">
          <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <p class="text-sm text-gray-500 dark:text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    </div>
  `;
}

// ============ Dashboard Grid Renderer ============

export function renderDashboardGrid(data: DashboardData): string {
  const widgets = widgetRegistry.map(widget => {
    const gridClasses = sizeToGridClasses[widget.size];
    return `
      <div class="${gridClasses} bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-xs overflow-hidden flex flex-col">
        <div class="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-800 dark:text-gray-100">${escapeHtml(widget.title)}</h3>
          ${widget.renderHeaderActions ? widget.renderHeaderActions() : ''}
        </div>
        <div class="px-4 py-3 flex-1 overflow-auto">
          ${widget.render(data)}
        </div>
      </div>
    `;
  });

  return `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" style="grid-auto-rows: minmax(160px, auto);">
      ${widgets.join('')}
    </div>
  `;
}

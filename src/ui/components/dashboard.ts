// Dashboard component with modular widget architecture
import { escapeHtml } from './utils.js';

// ============ Widget Architecture ============

export type WidgetSize = 'S' | 'M' | 'L' | 'XL';

export interface WidgetDefinition {
  id: string;
  title: string;
  size: WidgetSize;
  render: (data: DashboardData) => string;
}

export interface DashboardData {
  stats: {
    tickets: { byStatus: Record<string, number>; total: number };
    knowledge: { total: number; byCategory: Record<string, number> };
    specs: { total: number };
  };
  activity: Array<{ type: string; id: string; title: string; timestamp: string }>;
}

// Size → CSS grid span mapping (responsive)
const sizeToGridClasses: Record<WidgetSize, string> = {
  S: 'col-span-1',
  M: 'col-span-1 md:col-span-2',
  L: 'col-span-1 md:col-span-2 lg:row-span-2',
  XL: 'col-span-1 md:col-span-2 lg:col-span-4',
};

// ============ Widget Registry ============
// To add a widget: push a new object here. No other changes needed.

const widgetRegistry: WidgetDefinition[] = [
  { id: 'ticket-status', title: 'Tickets', size: 'M', render: renderTicketStatusWidget },
  { id: 'knowledge-stats', title: 'Knowledge', size: 'S', render: renderKnowledgeStatsWidget },
  { id: 'spec-stats', title: 'Specs', size: 'S', render: renderSpecStatsWidget },
  { id: 'recent-activity', title: 'Recent Activity', size: 'L', render: renderRecentActivityWidget },
  { id: 'quick-actions', title: 'Quick Actions', size: 'S', render: renderQuickActionsWidget },
];

// ============ Dashboard View (HTMX shell) ============

export function renderDashboardView(): string {
  return `
    <div>
      <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Dashboard</h1>
      <div id="dashboard-grid" hx-get="/partials/dashboard-grid" hx-trigger="load, refresh">
        <div class="flex justify-center items-center py-16">
          <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    </div>
  `;
}

// ============ Dashboard Grid (renders all widgets) ============

export function renderDashboardGrid(data: DashboardData): string {
  const widgets = widgetRegistry.map(widget => {
    const gridClasses = sizeToGridClasses[widget.size];
    return `
      <div class="${gridClasses} bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-xs overflow-hidden flex flex-col">
        <div class="px-4 py-3 border-b border-gray-100 dark:border-dark-border">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">${escapeHtml(widget.title)}</h3>
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

// ============ Widget Implementations ============

function renderTicketStatusWidget(data: DashboardData): string {
  const { byStatus, total } = data.stats.tickets;

  const statusConfig: Array<{ status: string; bg: string; text: string; darkBg: string; darkText: string }> = [
    { status: 'Backlog', bg: 'bg-gray-100', text: 'text-gray-700', darkBg: 'dark:bg-gray-900/30', darkText: 'dark:text-gray-300' },
    { status: 'In Progress', bg: 'bg-blue-100', text: 'text-blue-700', darkBg: 'dark:bg-blue-900/30', darkText: 'dark:text-blue-300' },
    { status: 'In Review', bg: 'bg-yellow-100', text: 'text-yellow-700', darkBg: 'dark:bg-yellow-900/30', darkText: 'dark:text-yellow-300' },
    { status: 'Done', bg: 'bg-green-100', text: 'text-green-700', darkBg: 'dark:bg-green-900/30', darkText: 'dark:text-green-300' },
    { status: 'Blocked', bg: 'bg-red-100', text: 'text-red-700', darkBg: 'dark:bg-red-900/30', darkText: 'dark:text-red-300' },
  ];

  const rows = statusConfig
    .filter(c => (byStatus[c.status] || 0) > 0)
    .map(c => {
      const count = byStatus[c.status] || 0;
      return `<div class="flex items-center justify-between py-1.5">
        <span class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(c.status)}</span>
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text} ${c.darkBg} ${c.darkText}">${count}</span>
      </div>`;
    });

  return `
    <div class="flex items-center justify-between mb-3">
      <span class="text-2xl font-bold text-gray-800 dark:text-gray-100">${total}</span>
      <span class="text-xs text-gray-400 dark:text-gray-500">total</span>
    </div>
    ${rows.length > 0 ? `<div class="space-y-0.5">${rows.join('')}</div>` : '<div class="text-sm text-gray-400 dark:text-gray-500">No tickets yet</div>'}
  `;
}

function renderKnowledgeStatsWidget(data: DashboardData): string {
  const { total, byCategory } = data.stats.knowledge;

  const categories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, count]) => `
      <div class="flex items-center justify-between py-0.5">
        <span class="text-xs text-gray-500 dark:text-gray-400 capitalize">${escapeHtml(cat)}</span>
        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">${count}</span>
      </div>
    `);

  return `
    <div class="flex items-center justify-between mb-3">
      <span class="text-2xl font-bold text-gray-800 dark:text-gray-100">${total}</span>
      <span class="text-xs text-gray-400 dark:text-gray-500">active</span>
    </div>
    ${categories.length > 0 ? `<div class="space-y-0.5">${categories.join('')}</div>` : '<div class="text-sm text-gray-400 dark:text-gray-500">No entries yet</div>'}
  `;
}

function renderSpecStatsWidget(data: DashboardData): string {
  return `
    <div class="flex items-center justify-between mb-3">
      <span class="text-2xl font-bold text-gray-800 dark:text-gray-100">${data.stats.specs.total}</span>
      <span class="text-xs text-gray-400 dark:text-gray-500">specs</span>
    </div>
    <div class="text-sm text-gray-500 dark:text-gray-400">Feature specifications and design documents</div>
  `;
}

function renderRecentActivityWidget(data: DashboardData): string {
  if (data.activity.length === 0) {
    return '<div class="text-sm text-gray-400 dark:text-gray-500">No recent activity</div>';
  }

  const typeColors: Record<string, string> = {
    ticket: 'bg-blue-500',
    knowledge: 'bg-green-500',
    spec: 'bg-purple-500',
  };

  const items = data.activity.map(item => {
    const dotColor = typeColors[item.type] || 'bg-gray-500';
    const title = item.title.length > 50 ? item.title.slice(0, 50) + '...' : item.title;
    return `
      <div class="flex items-start gap-2.5 py-2 border-b border-gray-50 dark:border-dark-border last:border-0">
        <span class="mt-1.5 inline-block w-2 h-2 rounded-full ${dotColor} shrink-0"></span>
        <div class="flex-1 min-w-0">
          <button hx-get="/partials/${escapeHtml(item.type)}-modal/${escapeHtml(item.id)}"
                  hx-target="#modal-content"
                  onclick="showModal()"
                  class="text-sm text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 truncate block w-full text-left cursor-pointer">
            ${escapeHtml(title)}
          </button>
          <span class="text-xs text-gray-400 dark:text-gray-500">${escapeHtml(item.type)} &middot; ${formatRelativeTime(item.timestamp)}</span>
        </div>
      </div>
    `;
  });

  return `<div>${items.join('')}</div>`;
}

function renderQuickActionsWidget(_data: DashboardData): string {
  return `
    <div class="flex flex-col gap-2">
      <button type="button"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
              hx-get="/partials/new-ticket-modal"
              hx-target="#modal-content"
              onclick="showModal()">
        New Ticket
      </button>
      <button type="button"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
              onclick="showSearchModal()">
        Search Knowledge
      </button>
      <button type="button"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
              hx-get="/partials/new-spec-modal"
              hx-target="#modal-content"
              onclick="showModal()">
        New Spec
      </button>
    </div>
  `;
}

// ============ Helpers ============

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

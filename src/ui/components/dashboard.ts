// Dashboard component

// ============ Dashboard View (HTMX shell) ============

export function renderDashboardView(): string {
  return `
    <div>
      <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Dashboard</h1>
      <div id="dashboard-grid">
        <div class="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <p class="text-sm">Dashboard</p>
        </div>
      </div>
    </div>
  `;
}

// Ticket Activity widget — shows ticket status distribution at a glance
import type { WidgetDefinition, DashboardData } from '../dashboard.js';

function renderTicketActivity(data: DashboardData): string {
  const ta = data.ticketActivity;

  // Empty state
  if (!ta || ta.total === 0) {
    return `
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2">
        <svg class="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/>
        </svg>
        <p class="text-sm">No tickets yet</p>
        <a onclick="switchTab('tickets')"
           class="mt-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer">
          Create a Ticket
        </a>
      </div>`;
  }

  const inProgress = (ta.byStatus['In Progress'] ?? 0);
  const done = (ta.byStatus['Done'] ?? 0);
  const blocked = (ta.byStatus['Blocked'] ?? 0);
  const backlog = (ta.byStatus['Backlog'] ?? 0);

  return `
    <div class="flex flex-col gap-3 h-full">
      <!-- Total + Recent -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-300">Total</span>
        <span class="text-xl font-bold text-gray-800 dark:text-gray-100">${ta.total}</span>
      </div>

      <!-- Status grid -->
      <div class="grid grid-cols-2 gap-2">
        <div class="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
          <div class="text-sm font-semibold text-blue-700 dark:text-blue-300">${inProgress}</div>
          <div class="text-[10px] text-blue-500 dark:text-blue-400">In Progress</div>
        </div>
        <div class="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
          <div class="text-sm font-semibold text-green-700 dark:text-green-300">${done}</div>
          <div class="text-[10px] text-green-500 dark:text-green-400">Done</div>
        </div>
        <div class="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
          <div class="text-sm font-semibold text-red-700 dark:text-red-300">${blocked}</div>
          <div class="text-[10px] text-red-500 dark:text-red-400">Blocked</div>
        </div>
        <div class="text-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
          <div class="text-sm font-semibold text-gray-800 dark:text-gray-200">${backlog}</div>
          <div class="text-[10px] text-gray-500 dark:text-gray-400">Backlog</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-auto flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
        <span>${ta.recentCount} new this week</span>
        <a onclick="switchTab('tickets')"
           class="text-blue-500 dark:text-blue-400 hover:underline cursor-pointer">Open Tickets</a>
      </div>
    </div>`;
}

export const ticketActivityWidget: WidgetDefinition = {
  id: 'ticket-activity',
  title: 'Ticket Activity',
  size: 'S',
  render: renderTicketActivity,
};

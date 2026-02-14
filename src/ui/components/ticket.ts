// Ticket-related UI components
import { escapeHtml, ColumnData, renderMarkdownEditor } from './utils.js';

// Helper to render a ticket card
export function renderTicketCard(ticket: {
  id: string;
  type?: string;
  title?: string;
  intent: string;
  change_class?: string;
  change_class_reason?: string;
  tasks?: { text: string; done: boolean }[];
}, options?: { isBacklog?: boolean }): string {
  const isBacklog = options?.isBacklog ?? false;
  const taskCount = ticket.tasks?.length || 0;
  const doneCount = ticket.tasks?.filter(t => t.done).length || 0;
  const progress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;

  const remaining = taskCount - doneCount;
  const isComplete = taskCount > 0 && progress === 100;

  const classColors: Record<string, { bg: string; text: string }> = {
    'A': { bg: 'bg-green-100', text: 'text-green-700' },
    'B': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    'C': { bg: 'bg-red-100', text: 'text-red-700' },
  };
  const classStyle = ticket.change_class ? classColors[ticket.change_class] || { bg: 'bg-gray-100', text: 'text-gray-600' } : null;

  const typeColors: Record<string, { bg: string; text: string }> = {
    'feature': { bg: 'bg-purple-100', text: 'text-purple-700' },
    'bugfix': { bg: 'bg-red-100', text: 'text-red-700' },
    'refactor': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'docs': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    'chore': { bg: 'bg-gray-100', text: 'text-gray-700' },
    'test': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  };
  const typeStyle = ticket.type ? typeColors[ticket.type] || { bg: 'bg-gray-100', text: 'text-gray-600' } : null;

  // Use title if available, otherwise use intent for display
  const displayTitle = ticket.title || ticket.intent;

  return `
    <div class="bg-white border border-gray-200 shadow-2xs rounded-xl p-3 cursor-pointer hover:shadow-md transition group"
         draggable="true"
         ondragstart="onDragStart(event, '${ticket.id}')"
         ondragend="onDragEnd(event)"
         hx-get="/partials/ticket-modal/${encodeURIComponent(ticket.id)}"
         hx-target="#modal-content"
         hx-trigger="click"
         onclick="showModal()">
      <div class="flex items-start justify-between mb-1">
        <div class="text-xs font-mono text-gray-400">${escapeHtml(ticket.id)}</div>
        ${isBacklog ? `
          <button class="opacity-0 group-hover:opacity-100 p-1 -mt-1 -mr-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                  title="Edit ticket"
                  hx-get="/partials/edit-ticket-modal/${encodeURIComponent(ticket.id)}"
                  hx-target="#modal-content"
                  hx-trigger="click"
                  onclick="event.stopPropagation(); showModal()">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
        ` : ''}
      </div>
      <div class="text-sm font-medium text-gray-800 line-clamp-2">${escapeHtml(displayTitle)}</div>
      ${taskCount > 0 ? `
        <div class="mt-2">
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="${isComplete ? 'text-green-600 font-medium' : 'text-gray-500'}">${isComplete ? 'Complete' : `${remaining} remaining`}</span>
            <span class="${isComplete ? 'text-green-600' : 'text-gray-400'}">${doneCount}/${taskCount}</span>
          </div>
          <div class="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-${isComplete ? 'green' : 'blue'}-500 rounded-full transition-all" style="width: ${progress}%"></div>
          </div>
        </div>
      ` : ''}
      <div class="mt-2 flex gap-1 flex-wrap">
        ${ticket.type && typeStyle ? `<span class="px-2 py-0.5 text-xs font-medium rounded ${typeStyle.bg} ${typeStyle.text}">${ticket.type}</span>` : ''}
        ${ticket.change_class && classStyle ? `<span class="px-2 py-0.5 text-xs font-medium rounded ${classStyle.bg} ${classStyle.text}">Class ${ticket.change_class}</span>` : ''}
      </div>
    </div>
  `;
}

// Helper to render kanban view
export function renderKanbanView(): string {
  return `
    <div id="kanban-columns" hx-get="/partials/kanban-columns" hx-trigger="load, refresh">
    </div>
  `;
}

// Helper to render kanban columns with pagination
export function renderKanbanColumns(columns: ColumnData[]): string {
  const columnStyles: Record<string, { color: string; bg: string; badgeBg?: string; badgeText?: string }> = {
    'Backlog': { color: 'gray', bg: 'bg-gray-50' },
    'In Progress': { color: 'yellow', bg: 'bg-yellow-50' },
    'In Review': { color: 'blue', bg: 'bg-blue-50' },
    'Done': { color: 'green', bg: 'bg-green-50' },
    'Blocked': { color: 'red', bg: 'bg-red-50' },
    'Paused': { color: 'orange', bg: 'bg-orange-50' },
    'Abandoned': { color: 'gray', bg: 'bg-gray-100' },
    'Superseded': { color: 'purple', bg: 'bg-purple-50' },
    'Archived': { color: 'slate', bg: 'bg-gray-100', badgeBg: 'bg-gray-200', badgeText: 'text-gray-600' },
  };

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
      ${columns.map(col => {
        const style = columnStyles[col.status] || { color: 'gray', bg: 'bg-gray-50' };
        const statusSlug = col.status.toLowerCase().replace(/ /g, '-');
        const isBacklog = col.status === 'Backlog';
        const isArchive = col.status === 'Archived';
        // Archived column is not a drop target (can't drag to Archived directly)
        const dragHandlers = isArchive ? '' : `ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${col.status}')"`;
        return `
          <div class="rounded-lg ${style.bg} p-4 flex flex-col max-h-[calc(100vh-105px)]"
               ${dragHandlers}>
            <div class="flex items-center justify-between mb-3 shrink-0">
              <h2 class="font-semibold text-${style.color}-700">${col.status}</h2>
              <div class="flex items-center gap-2">
                ${isBacklog ? `
                  <button class="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
                          hx-get="/partials/new-ticket-modal"
                          hx-target="#modal-content"
                          hx-trigger="click"
                          onclick="showModal()">
                    + Add
                  </button>
                ` : ''}
                <span class="text-xs ${style.badgeText || `text-${style.color}-500`} ${style.badgeBg || `bg-${style.color}-100`} px-2 py-0.5 rounded-full">${col.tickets.length}${col.hasMore ? '+' : ''}</span>
              </div>
            </div>
            <div id="tickets-${statusSlug}" class="space-y-3 overflow-y-auto flex-1 min-h-0 -mx-1 px-1 py-1">
              ${col.tickets.map(t => renderTicketCard(t, { isBacklog })).join('')}
              ${col.hasMore ? `
                <button class="w-full px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors shrink-0"
                        hx-get="/partials/kanban-column/${encodeURIComponent(col.status)}?offset=12"
                        hx-swap="outerHTML">
                  Load More
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Helper to render more tickets for a column (pagination)
export function renderColumnMore(
  tickets: {
    id: string;
    type?: string;
    title?: string;
    intent: string;
    change_class?: string;
    change_class_reason?: string;
    tasks?: { text: string; done: boolean }[];
  }[],
  status: string,
  nextOffset: number,
  hasMore: boolean
): string {
  const isBacklog = status === 'Backlog';
  const cards = tickets.map(t => renderTicketCard(t, { isBacklog })).join('');

  if (!hasMore) {
    return cards;
  }

  return `
    ${cards}
    <button class="w-full px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            hx-get="/partials/kanban-column/${encodeURIComponent(status)}?offset=${nextOffset}"
            hx-swap="outerHTML">
      Load More
    </button>
  `;
}

// Helper to render ticket modal
export function renderTicketModal(ticket: {
  id: string;
  type?: string;
  title?: string;
  status: string;
  intent: string;
  context?: string;
  constraints_use?: string[];
  constraints_avoid?: string[];
  assumptions?: string[];
  tasks?: { text: string; done: boolean }[];
  definition_of_done?: { text: string; done: boolean }[];
  change_class?: string;
  change_class_reason?: string;
  origin_spec_id?: string;
  plan?: {
    files: string[];
    taskSteps: { task: string; steps: string[] }[];
    dodVerification: { dod: string; verify: string }[];
    decisions: { choice: string; reason: string }[];
    tradeOffs: { considered: string; rejected: string }[];
    rollback?: { steps: string[]; reversibility: 'full' | 'partial' | 'none' };
    irreversibleActions: string[];
    edgeCases: string[];
  };
  derived_knowledge?: string[];
  comments?: { text: string; timestamp: string }[];
  created_at?: string;
  updated_at?: string;
}): string {
  const statusColors: Record<string, string> = {
    'Backlog': 'gray',
    'In Progress': 'yellow',
    'In Review': 'blue',
    'Done': 'green',
    'Blocked': 'red',
    'Paused': 'orange',
    'Abandoned': 'gray',
    'Superseded': 'purple',
  };
  const color = statusColors[ticket.status] || 'gray';

  const typeColors: Record<string, { bg: string; text: string }> = {
    'feature': { bg: 'bg-purple-100', text: 'text-purple-700' },
    'bugfix': { bg: 'bg-red-100', text: 'text-red-700' },
    'refactor': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'docs': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    'chore': { bg: 'bg-gray-100', text: 'text-gray-700' },
    'test': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  };
  const typeStyle = ticket.type ? typeColors[ticket.type] || { bg: 'bg-gray-100', text: 'text-gray-600' } : null;

  return `
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-mono text-gray-400">${escapeHtml(ticket.id)}</span>
            <button type="button"
                    class="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                    title="Copy ticket ID"
                    onclick="navigator.clipboard.writeText('${escapeHtml(ticket.id)}').then(() => { const svg = this.querySelector('svg'); const originalPath = svg.innerHTML; svg.innerHTML = '<path stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; stroke-width=&quot;2&quot; d=&quot;M5 13l4 4L19 7&quot;></path>'; this.classList.add('text-green-600'); setTimeout(() => { svg.innerHTML = originalPath; this.classList.remove('text-green-600'); }, 1500); })">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
            ${ticket.type && typeStyle ? `<span class="px-2 py-0.5 text-xs font-medium rounded ${typeStyle.bg} ${typeStyle.text}">${ticket.type}</span>` : ''}
          </div>
          ${ticket.title ? `<h2 class="text-xl font-bold text-gray-800 mb-2">${escapeHtml(ticket.title)}</h2>` : ''}
          <div class="text-sm text-gray-700 markdown-content" data-markdown>${escapeHtml(ticket.intent)}</div>
        </div>
        <button onclick="hideModal()" class="shrink-0 size-8 inline-flex justify-center items-center rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 focus:outline-hidden focus:bg-gray-200 cursor-pointer" aria-label="Close">
          <span class="sr-only">Close</span>
          <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>

      ${ticket.context ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Context</h3>
          <div class="text-sm text-gray-700 bg-gray-100 rounded-lg p-3 whitespace-pre-wrap">${escapeHtml(ticket.context)}</div>
        </div>
      ` : ''}

      ${ticket.constraints_use?.length || ticket.constraints_avoid?.length ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Constraints</h3>
          <div class="text-sm space-y-1">
            ${ticket.constraints_use?.length ? `<p><span class="text-green-600 font-medium">Use:</span> ${ticket.constraints_use.map(c => escapeHtml(c)).join(', ')}</p>` : ''}
            ${ticket.constraints_avoid?.length ? `<p><span class="text-red-600 font-medium">Avoid:</span> ${ticket.constraints_avoid.map(c => escapeHtml(c)).join(', ')}</p>` : ''}
          </div>
        </div>
      ` : ''}

      ${ticket.assumptions?.length ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Assumptions</h3>
          <ul class="text-sm text-gray-700 list-disc list-inside">
            ${ticket.assumptions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${ticket.change_class ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Change Class</h3>
          <div class="text-sm text-gray-700">Class ${ticket.change_class}${ticket.change_class_reason ? ` - ${escapeHtml(ticket.change_class_reason)}` : ''}</div>
        </div>
      ` : ''}

      ${ticket.origin_spec_id ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Origin Spec</h3>
          <span class="inline-flex items-center px-2 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer font-mono font-medium"
                hx-get="/partials/spec-modal/${encodeURIComponent(ticket.origin_spec_id)}"
                hx-target="#modal-content"
                hx-trigger="click">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            ${escapeHtml(ticket.origin_spec_id)}
          </span>
        </div>
      ` : ''}

      ${ticket.plan ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Plan</h3>
          <div class="text-sm space-y-3 bg-blue-50 rounded-lg p-3">
            ${ticket.plan.files?.length ? `
              <div>
                <span class="font-medium text-blue-700">Files to Edit:</span>
                <span class="text-gray-700">${ticket.plan.files.map(f => escapeHtml(f)).join(', ')}</span>
              </div>
            ` : ''}
            ${ticket.plan.taskSteps?.length ? `
              <div>
                <span class="font-medium text-blue-700">Tasks → Steps:</span>
                <div class="mt-1 space-y-2">
                  ${ticket.plan.taskSteps.map((ts, i) => {
                    const taskItem = ticket.tasks?.[i];
                    const isDone = taskItem?.done ?? false;
                    return `
                    <div class="ml-1">
                      <div class="flex items-center gap-2">
                        <input type="checkbox" ${isDone ? 'checked' : ''}
                               class="rounded border-gray-300 shrink-0"
                               hx-patch="/api/tickets/${encodeURIComponent(ticket.id)}/task/${i}"
                               hx-swap="none">
                        <span class="${isDone ? 'line-through text-gray-400' : 'font-medium text-gray-700'}">${escapeHtml(ts.task)}</span>
                      </div>
                      ${ts.steps?.length ? `
                        <ol class="ml-8 mt-1 list-decimal text-gray-500 text-xs">
                          ${ts.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                        </ol>
                      ` : ''}
                    </div>
                  `;}).join('')}
                </div>
              </div>
            ` : ''}
            ${ticket.plan.dodVerification?.length ? `
              <div>
                <span class="font-medium text-blue-700">Definition of Done → Verification:</span>
                <div class="mt-1 space-y-1">
                  ${ticket.plan.dodVerification.map((dv, i) => {
                    const dodItem = ticket.definition_of_done?.[i];
                    const isDone = dodItem?.done ?? false;
                    return `
                    <div class="flex items-start gap-2 ml-1">
                      <input type="checkbox" ${isDone ? 'checked' : ''}
                             class="rounded border-gray-300 shrink-0 mt-0.5"
                             hx-patch="/api/tickets/${encodeURIComponent(ticket.id)}/dod/${i}"
                             hx-swap="none">
                      <span class="${isDone ? 'line-through text-gray-400' : 'text-gray-700'}"><strong>${escapeHtml(dv.dod)}</strong> → ${escapeHtml(dv.verify)}</span>
                    </div>
                  `;}).join('')}
                </div>
              </div>
            ` : ''}
            ${ticket.plan.decisions?.length ? `
              <div>
                <span class="font-medium text-blue-700">Decisions:</span>
                <ul class="mt-1 ml-4 list-disc text-gray-700">
                  ${ticket.plan.decisions.map(d => `<li><strong>${escapeHtml(d.choice)}</strong>${d.reason ? ` — ${escapeHtml(d.reason)}` : ''}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${ticket.plan.tradeOffs?.length ? `
              <div>
                <span class="font-medium text-blue-700">Trade-offs:</span>
                <ul class="mt-1 ml-4 list-disc text-gray-700">
                  ${ticket.plan.tradeOffs.map(t => `<li>${escapeHtml(t.considered)}${t.rejected ? ` — ${escapeHtml(t.rejected)}` : ''}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${ticket.plan.rollback ? `
              <div>
                <span class="font-medium text-blue-700">Rollback:</span>
                <div class="mt-1 ml-4 text-gray-700">
                  <div class="text-xs mb-1">
                    <span class="font-medium">Reversibility:</span>
                    <span class="${ticket.plan.rollback.reversibility === 'full' ? 'text-green-600' : ticket.plan.rollback.reversibility === 'partial' ? 'text-yellow-600' : 'text-red-600'}">${ticket.plan.rollback.reversibility}</span>
                  </div>
                  ${ticket.plan.rollback.steps?.length ? `
                    <ul class="list-disc ml-4">
                      ${ticket.plan.rollback.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                  ` : ''}
                </div>
              </div>
            ` : ''}
            ${ticket.plan.irreversibleActions?.length ? `
              <div>
                <span class="font-medium text-blue-700">Irreversible Actions:</span>
                <ul class="mt-1 ml-4 list-disc text-gray-700">
                  ${ticket.plan.irreversibleActions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${ticket.plan.edgeCases?.length ? `
              <div>
                <span class="font-medium text-blue-700">Edge Cases:</span>
                <ul class="mt-1 ml-4 list-disc text-gray-700">
                  ${ticket.plan.edgeCases.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        </div>
      ` : /* Fallback: show tasks/DoD without plan */ `
        ${ticket.tasks?.length ? `
          <div class="mb-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Tasks</h3>
            <ul class="space-y-1">
              ${ticket.tasks.map((t, i) => `
                <li class="flex items-center gap-2">
                  <input type="checkbox" ${t.done ? 'checked' : ''}
                         class="rounded border-gray-300"
                         hx-patch="/api/tickets/${encodeURIComponent(ticket.id)}/task/${i}"
                         hx-swap="none">
                  <span class="${t.done ? 'line-through text-gray-400' : 'text-gray-700'} text-sm">${escapeHtml(t.text)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        ${ticket.definition_of_done?.length ? `
          <div class="mb-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Definition of Done</h3>
            <ul class="space-y-1">
              ${ticket.definition_of_done.map((d, i) => `
                <li class="flex items-center gap-2">
                  <input type="checkbox" ${d.done ? 'checked' : ''}
                         class="rounded border-gray-300"
                         hx-patch="/api/tickets/${encodeURIComponent(ticket.id)}/dod/${i}"
                         hx-swap="none">
                  <span class="${d.done ? 'line-through text-gray-400' : 'text-gray-700'} text-sm">${escapeHtml(d.text)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      `}

      ${ticket.derived_knowledge?.length ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Derived Knowledge</h3>
          <div class="flex flex-wrap gap-2">
            ${ticket.derived_knowledge.map(kid => `
              <span class="inline-flex items-center px-2 py-1 text-xs rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 cursor-pointer"
                    hx-get="/partials/knowledge-modal/${encodeURIComponent(kid)}"
                    hx-target="#modal-content"
                    hx-trigger="click">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                </svg>
                ${escapeHtml(kid)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${ticket.comments?.length ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Comments</h3>
          <div class="space-y-2">
            ${ticket.comments.map(c => `
              <div class="bg-gray-100 rounded-lg p-3">
                <div class="text-xs text-gray-400 mb-1">${new Date(c.timestamp).toLocaleString()}</div>
                <div class="text-sm text-gray-700">${escapeHtml(c.text)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="mb-4">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Status</h3>
        <select id="status-select"
                class="px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer bg-${color}-50 text-${color}-700 border-${color}-200"
                hx-patch="/api/tickets/${encodeURIComponent(ticket.id)}/status"
                hx-trigger="change"
                hx-swap="none"
                name="status"
                onchange="updateStatusColor(this)">
          <optgroup label="Normal Flow">
            <option value="Backlog" ${ticket.status === 'Backlog' ? 'selected' : ''}>Backlog</option>
            <option value="In Progress" ${ticket.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="In Review" ${ticket.status === 'In Review' ? 'selected' : ''}>In Review</option>
            <option value="Done" ${ticket.status === 'Done' ? 'selected' : ''}>Done</option>
          </optgroup>
          <optgroup label="Exception States">
            <option value="Blocked" ${ticket.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
            <option value="Paused" ${ticket.status === 'Paused' ? 'selected' : ''}>Paused</option>
            <option value="Abandoned" ${ticket.status === 'Abandoned' ? 'selected' : ''}>Abandoned</option>
            <option value="Superseded" ${ticket.status === 'Superseded' ? 'selected' : ''}>Superseded</option>
          </optgroup>
        </select>
        <script>
          function updateStatusColor(el) {
            const colors = {
              'Backlog': 'gray', 'In Progress': 'yellow', 'In Review': 'blue', 'Done': 'green',
              'Blocked': 'red', 'Paused': 'orange', 'Abandoned': 'gray', 'Superseded': 'purple'
            };
            const c = colors[el.value] || 'gray';
            el.className = el.className.replace(/bg-[a-z]+-50/g, 'bg-' + c + '-50')
                                       .replace(/text-[a-z]+-700/g, 'text-' + c + '-700')
                                       .replace(/border-[a-z]+-200/g, 'border-' + c + '-200');
          }
        </script>
      </div>

      <div class="mt-6 pt-4 border-t flex items-center justify-between">
        <div class="text-xs text-gray-400">
          <span>Created: ${ticket.created_at || 'N/A'}</span>
          <span class="ml-4">Updated: ${ticket.updated_at || 'N/A'}</span>
        </div>
        <div class="flex gap-2">
          ${ticket.status === 'Backlog' ? `
            <button type="button"
                    class="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                    hx-get="/partials/edit-ticket-modal/${encodeURIComponent(ticket.id)}"
                    hx-target="#modal-content"
                    hx-trigger="click">
              Edit
            </button>
          ` : ''}
          <button type="button"
                  class="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                  onclick="if(confirm('Delete this ticket?${ticket.derived_knowledge?.length ? ' Derived knowledge will be orphaned but preserved.' : ''}')) { fetch('/api/tickets/${encodeURIComponent(ticket.id)}', {method:'DELETE'}).then(r=>r.json()).then(d=>{if(d.success){hideModal();htmx.trigger('#kanban-columns','refresh');}else{alert(d.error||'Delete failed');}}).catch(e=>alert('Error: '+e)); }">
            Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

// Helper to render new ticket modal
export function renderNewTicketModal(): string {
  const ticketTypes = [
    { value: 'feature', label: 'Feature', desc: 'New functionality' },
    { value: 'bugfix', label: 'Bugfix', desc: 'Fix an issue' },
    { value: 'refactor', label: 'Refactor', desc: 'Code improvement' },
    { value: 'docs', label: 'Docs', desc: 'Documentation' },
    { value: 'chore', label: 'Chore', desc: 'Maintenance' },
    { value: 'test', label: 'Test', desc: 'Add tests' },
  ];

  return `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-gray-800">New Ticket</h2>
        <button onclick="hideModal()" class="shrink-0 size-8 inline-flex justify-center items-center rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 focus:outline-hidden focus:bg-gray-200 cursor-pointer" aria-label="Close">
          <span class="sr-only">Close</span>
          <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>

      <form hx-post="/api/tickets/quick"
            hx-target="#kanban-columns"
            hx-on::after-request="hideModal()">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-500">*</span></label>
            <input type="text" name="title" required
                   placeholder="Brief summary of what needs to be done"
                   class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Type <span class="text-red-500">*</span></label>
            <select name="type" required
                    class="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              ${ticketTypes.map(t => `<option value="${t.value}">${t.label} - ${t.desc}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Intent <span class="text-red-500">*</span></label>
            ${renderMarkdownEditor({ name: 'intent', id: 'ticket-intent-editor', placeholder: 'What do you want to achieve? Be specific about the desired outcome. Supports **markdown**.', rows: 4, required: true })}
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button type="button" onclick="hideModal()"
                  class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button type="submit"
                  class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
            Create Ticket
          </button>
        </div>
      </form>
    </div>
  `;
}

// Helper to render edit ticket modal
export function renderEditTicketModal(ticket: {
  id: string;
  type?: string;
  title?: string;
  intent: string;
}): string {
  const ticketTypes = [
    { value: 'feature', label: 'Feature', desc: 'New functionality' },
    { value: 'bugfix', label: 'Bugfix', desc: 'Fix an issue' },
    { value: 'refactor', label: 'Refactor', desc: 'Code improvement' },
    { value: 'docs', label: 'Docs', desc: 'Documentation' },
    { value: 'chore', label: 'Chore', desc: 'Maintenance' },
    { value: 'test', label: 'Test', desc: 'Add tests' },
  ];

  return `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-gray-800">Edit Ticket</h2>
          <span class="text-xs font-mono text-gray-400">${escapeHtml(ticket.id)}</span>
        </div>
        <button onclick="hideModal()" class="shrink-0 size-8 inline-flex justify-center items-center rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 focus:outline-hidden focus:bg-gray-200 cursor-pointer" aria-label="Close">
          <span class="sr-only">Close</span>
          <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>

      <form hx-patch="/api/tickets/${encodeURIComponent(ticket.id)}"
            hx-target="#modal-content">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-500">*</span></label>
            <input type="text" name="title" required
                   value="${escapeHtml(ticket.title || '')}"
                   placeholder="Brief summary of what needs to be done"
                   class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Type <span class="text-red-500">*</span></label>
            <select name="type" required
                    class="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              ${ticketTypes.map(t => `<option value="${t.value}"${ticket.type === t.value ? ' selected' : ''}>${t.label} - ${t.desc}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Intent <span class="text-red-500">*</span></label>
            ${renderMarkdownEditor({ name: 'intent', id: 'ticket-edit-intent-editor', placeholder: 'What do you want to achieve? Be specific about the desired outcome. Supports **markdown**.', rows: 12, required: true, value: escapeHtml(ticket.intent) })}
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button type="button" onclick="hideModal()"
                  class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button type="submit"
                  class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  `;
}

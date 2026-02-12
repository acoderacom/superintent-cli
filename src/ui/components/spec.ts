// Spec-related UI components
import { escapeHtml, renderMarkdownEditor } from './utils.js';
import type { Spec } from '../../types.js';

// Helper to render spec view
export function renderSpecView(): string {
  return `
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold text-gray-800">Specs</h1>
        <button type="button"
                class="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
                hx-get="/partials/new-spec-modal"
                hx-target="#modal-content"
                hx-trigger="click"
                onclick="showModal()">
          + Add
        </button>
      </div>
      <div id="spec-list" hx-get="/partials/spec-list" hx-trigger="load, poll-refresh" hx-swap="innerHTML">
      </div>
    </div>
  `;
}

// Helper to render spec list
export function renderSpecList(specs: Spec[], ticketCounts?: Record<string, number>): string {
  if (specs.length === 0) {
    return '<p class="text-gray-500 text-center py-8">No specs found.</p>';
  }

  return `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${specs.map(s => renderSpecCard(s, ticketCounts?.[s.id] || 0)).join('')}
    </div>
  `;
}

// Helper to render spec card
export function renderSpecCard(spec: Spec, ticketCount: number = 0): string {
  return `
    <div class="bg-white rounded-lg shadow-card hover:shadow-card-hover transition-shadow cursor-pointer overflow-hidden flex flex-col group"
         hx-get="/partials/spec-modal/${encodeURIComponent(spec.id)}"
         hx-target="#modal-content"
         hx-trigger="click"
         onclick="showModal()">
      <div class="p-4 flex flex-col flex-1">
        <div class="flex items-start justify-between mb-1">
          <div class="text-xs font-mono text-gray-400">${escapeHtml(spec.id)}</div>
          <button class="opacity-0 group-hover:opacity-100 p-1 -mt-1 -mr-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                  title="Edit spec"
                  hx-get="/partials/edit-spec-modal/${encodeURIComponent(spec.id)}"
                  hx-target="#modal-content"
                  hx-trigger="click"
                  onclick="event.stopPropagation(); showModal()">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
        </div>
        <div class="text-sm font-medium text-gray-800 line-clamp-2">${escapeHtml(spec.title)}</div>
        <p class="text-xs text-gray-500 mt-2 line-clamp-3 flex-1">${escapeHtml(spec.content.slice(0, 150))}${spec.content.length > 150 ? '...' : ''}</p>
        ${ticketCount > 0 ? `
          <div class="mt-2 text-xs text-gray-400 inline-flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            ${ticketCount} ticket${ticketCount !== 1 ? 's' : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Helper to render spec modal
export function renderSpecModal(spec: Spec, relatedTickets?: { id: string; title?: string; status: string }[]): string {
  return `
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-mono text-gray-400">${escapeHtml(spec.id)}</span>
            <button type="button"
                    class="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                    title="Copy spec ID"
                    onclick="navigator.clipboard.writeText('${escapeHtml(spec.id)}').then(() => { const svg = this.querySelector('svg'); const originalPath = svg.innerHTML; svg.innerHTML = '<path stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; stroke-width=&quot;2&quot; d=&quot;M5 13l4 4L19 7&quot;></path>'; this.classList.add('text-green-600'); setTimeout(() => { svg.innerHTML = originalPath; this.classList.remove('text-green-600'); }, 1500); })">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>
          <h2 class="text-xl font-bold text-gray-800">${escapeHtml(spec.title)}</h2>
        </div>
        <button onclick="hideModal()" class="text-gray-400 hover:text-gray-600 p-1">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Content</h3>
        <div class="text-sm text-gray-700 bg-gray-50 rounded-lg p-4 leading-relaxed markdown-content" data-markdown>${escapeHtml(spec.content)}</div>
      </div>

      ${relatedTickets?.length ? `
        <!-- Derived Tickets -->
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Derived Tickets</h3>
          <div class="flex flex-wrap gap-2">
            ${relatedTickets.map(t => {
              const statusColors: Record<string, { bg: string; text: string }> = {
                'Backlog': { bg: 'bg-gray-50', text: 'text-gray-700' },
                'In Progress': { bg: 'bg-yellow-50', text: 'text-yellow-700' },
                'In Review': { bg: 'bg-blue-50', text: 'text-blue-700' },
                'Done': { bg: 'bg-green-50', text: 'text-green-700' },
                'Blocked': { bg: 'bg-red-50', text: 'text-red-700' },
                'Paused': { bg: 'bg-orange-50', text: 'text-orange-700' },
                'Abandoned': { bg: 'bg-gray-100', text: 'text-gray-500' },
                'Superseded': { bg: 'bg-purple-50', text: 'text-purple-700' },
              };
              const style = statusColors[t.status] || { bg: 'bg-gray-50', text: 'text-gray-700' };
              return `
                <span class="inline-flex items-center px-2 py-1 text-xs rounded-lg ${style.bg} ${style.text} hover:opacity-80 cursor-pointer font-mono font-medium"
                      hx-get="/partials/ticket-modal/${encodeURIComponent(t.id)}"
                      hx-target="#modal-content"
                      hx-trigger="click">
                  <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                  </svg>
                  ${escapeHtml(t.id)}
                </span>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Actions & Metadata Footer -->
      <div class="mt-6 pt-4 border-t flex items-center justify-between">
        <div class="text-xs text-gray-400">
          <span>Created: ${spec.created_at || 'N/A'}</span>
          <span class="ml-4">Updated: ${spec.updated_at || 'N/A'}</span>
        </div>
        <div class="flex gap-2">
          <button type="button"
                  class="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                  hx-get="/partials/edit-spec-modal/${encodeURIComponent(spec.id)}"
                  hx-target="#modal-content"
                  hx-trigger="click">
            Edit
          </button>
          <button type="button"
                class="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                hx-delete="/api/specs/${encodeURIComponent(spec.id)}"
                hx-target="#spec-list"
                hx-swap="innerHTML"
                hx-confirm="Delete spec ${escapeHtml(spec.id)}?"
                hx-on::after-request="hideModal()">
          Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

// Helper to render new spec modal (manual spec creation form)
export function renderNewSpecModal(): string {
  return `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-gray-800">New Spec</h2>
        <button onclick="hideModal()" class="text-gray-400 hover:text-gray-600 p-1">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <form hx-post="/api/specs/quick"
            hx-target="#spec-list"
            hx-on::after-request="hideModal()">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-500">*</span></label>
            <input type="text" name="title" required
                   placeholder="Feature or spec name"
                   class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Content <span class="text-red-500">*</span></label>
            ${renderMarkdownEditor({ name: 'content', id: 'spec-content-editor', placeholder: 'Describe the feature spec, goals, requirements, and any relevant details. Supports **markdown**.', rows: 8, required: true })}
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button type="button" onclick="hideModal()"
                  class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button type="submit"
                  class="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors">
            Create Spec
          </button>
        </div>
      </form>
    </div>
  `;
}

// Helper to render edit spec modal
export function renderEditSpecModal(spec: Spec): string {
  return `
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-gray-800">Edit Spec</h2>
          <span class="text-xs font-mono text-gray-400">${escapeHtml(spec.id)}</span>
        </div>
        <button onclick="hideModal()" class="text-gray-400 hover:text-gray-600 p-1">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <form hx-patch="/api/specs/${encodeURIComponent(spec.id)}"
            hx-target="#modal-content">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-500">*</span></label>
            <input type="text" name="title" required
                   value="${escapeHtml(spec.title)}"
                   placeholder="Feature or spec name"
                   class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Content <span class="text-red-500">*</span></label>
            ${renderMarkdownEditor({ name: 'content', id: 'spec-edit-content-editor', placeholder: 'Describe the feature spec, goals, requirements, and any relevant details. Supports **markdown**.', rows: 12, required: true, value: escapeHtml(spec.content) })}
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button type="button" onclick="hideModal()"
                  class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button type="submit"
                  class="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  `;
}

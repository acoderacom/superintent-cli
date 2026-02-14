// Knowledge-related UI components
import { escapeHtml } from './utils.js';

// Helper to render knowledge view
export function renderKnowledgeView(): string {
  return `
    <div>
      <h1 class="text-xl font-bold text-gray-800 mb-4">Knowledge Base</h1>
      <div class="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <aside class="w-full lg:w-64 shrink-0 lg:sticky lg:top-4 lg:self-start">
        <div class="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:gap-4 lg:space-y-0 bg-white border border-gray-200 shadow-2xs rounded-xl p-3 lg:p-4">
          <div>
            <label for="k-status" class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select id="k-status" name="k-status" class="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-category'],[name='k-namespace'],[name='k-scope'],[name='k-origin']">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label for="k-category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select id="k-category" name="k-category" class="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-status'],[name='k-namespace'],[name='k-scope'],[name='k-origin']">
              <option value="">All</option>
              <option value="pattern">Pattern</option>
              <option value="truth">Truth</option>
              <option value="principle">Principle</option>
              <option value="architecture">Architecture</option>
              <option value="gotcha">Gotcha</option>
            </select>
          </div>

          <div>
            <label for="k-scope" class="block text-sm font-medium text-gray-700 mb-1">Scope</label>
            <select id="k-scope" name="k-scope" class="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-status'],[name='k-category'],[name='k-namespace'],[name='k-origin']">
              <option value="">All</option>
              <option value="global">Global</option>
              <option value="new-only">New Only</option>
              <option value="backward-compatible">Backward Compatible</option>
              <option value="legacy-frozen">Legacy Frozen</option>
            </select>
          </div>

          <div>
            <label for="k-origin" class="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select id="k-origin" name="k-origin" class="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-status'],[name='k-category'],[name='k-namespace'],[name='k-scope']">
              <option value="">All</option>
              <option value="ticket">Ticket</option>
              <option value="discovery">Discovery</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
      </aside>

      <main class="flex-1">
        <div id="knowledge-list" hx-get="/partials/knowledge-list" hx-trigger="load, refresh" hx-swap="innerHTML">
        </div>
      </main>
    </div>
    </div>
  `;
}

// Knowledge item type for rendering
export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category?: string;
  namespace: string;
  source?: string;
  origin_ticket_type?: string;
  tags?: string[];
  confidence: number;
  active: boolean;
  decision_scope: string;
  created_at?: string;
}

// Helper to render a single knowledge card
function renderKnowledgeCard(k: KnowledgeItem): string {
  const categoryColors: Record<string, string> = {
    pattern: 'purple',
    truth: 'green',
    principle: 'orange',
    architecture: 'blue',
    gotcha: 'red',
  };
  const color = categoryColors[k.category || ''] || 'gray';
  const inactiveClass = !k.active ? 'opacity-60 border-dashed' : '';
  return `
    <div class="bg-white border border-gray-200 shadow-2xs rounded-xl p-4 hover:shadow-md transition cursor-pointer ${inactiveClass}"
         hx-get="/partials/knowledge-modal/${encodeURIComponent(k.id)}"
         hx-target="#modal-content"
         hx-trigger="click"
         onclick="showModal()">
      <div class="text-xs font-mono text-gray-400 mb-1">${escapeHtml(k.id)}</div>
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <div class="text-sm font-medium text-gray-800">${escapeHtml(k.title)}</div>
            ${!k.active ? '<span class="px-2 py-0.5 text-xs rounded bg-gray-200 text-gray-600">Inactive</span>' : ''}
          </div>
          <p class="text-sm text-gray-600 mt-1 line-clamp-2">${escapeHtml(k.content.slice(0, 200))}${k.content.length > 200 ? '...' : ''}</p>
        </div>
        <div class="text-right shrink-0 ml-4">
          <div class="text-sm font-medium text-gray-600">${Math.round(k.confidence * 100)}%</div>
          <div class="text-xs text-gray-400">confidence</div>
        </div>
      </div>
      <div class="flex items-center mt-3 text-xs text-gray-500 gap-3">
        <span><span class="text-gray-400">Namespace:</span> ${escapeHtml(k.namespace)}</span>
        <span><span class="text-gray-400">Source:</span> ${k.source || 'manual'}${k.source === 'ticket' && k.origin_ticket_type ? ` (${k.origin_ticket_type})` : ''}</span>
        ${k.category ? `<span><span class="text-gray-400">Category:</span> <span class="text-${color}-600 font-medium">${k.category}</span></span>` : ''}
        <span><span class="text-gray-400">Scope:</span> ${k.decision_scope}</span>
      </div>
    </div>
  `;
}

// Build query params string for knowledge filters (used in load-more URLs)
function buildKnowledgeFilterParams(filters?: { status?: string; category?: string; namespace?: string; scope?: string; source?: string }): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.status) params.set('k-status', filters.status);
  if (filters.category) params.set('k-category', filters.category);
  if (filters.namespace) params.set('k-namespace', filters.namespace);
  if (filters.scope) params.set('k-scope', filters.scope);
  if (filters.source) params.set('k-origin', filters.source);
  const str = params.toString();
  return str ? `&${str}` : '';
}

// Helper to render knowledge list with optional load-more
export function renderKnowledgeList(items: KnowledgeItem[], hasMore?: boolean, filters?: { status?: string; category?: string; namespace?: string; scope?: string; source?: string }): string {
  if (items.length === 0) {
    return '<p class="text-gray-500 text-center py-8">No knowledge entries found</p>';
  }

  const filterParams = buildKnowledgeFilterParams(filters);

  return `
    <div class="space-y-3">
      ${items.map(k => renderKnowledgeCard(k)).join('')}
      ${hasMore ? `
        <button class="block mx-auto px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                hx-get="/partials/knowledge-more?offset=12${filterParams}"
                hx-swap="outerHTML">
          Load More
        </button>
      ` : ''}
    </div>
  `;
}

// Helper to render more knowledge items (pagination)
export function renderKnowledgeMore(items: KnowledgeItem[], nextOffset: number, hasMore: boolean, filters?: { status?: string; category?: string; namespace?: string; scope?: string; source?: string }): string {
  const cards = items.map(k => renderKnowledgeCard(k)).join('');

  if (!hasMore) {
    return cards;
  }

  const filterParams = buildKnowledgeFilterParams(filters);

  return `
    ${cards}
    <button class="block mx-auto px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            hx-get="/partials/knowledge-more?offset=${nextOffset}${filterParams}"
            hx-swap="outerHTML">
      Load More
    </button>
  `;
}

// Helper to render knowledge modal
export function renderKnowledgeModal(knowledge: {
  id: string;
  namespace: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  source: string;
  origin_ticket_id?: string;
  origin_ticket_type?: string;
  confidence: number;
  active: boolean;
  decision_scope: string;
  usage_count?: number;
  last_used_at?: string;
  created_at?: string;
  updated_at?: string;
}): string {
  const categoryColors: Record<string, string> = {
    pattern: 'purple',
    truth: 'green',
    principle: 'orange',
    architecture: 'blue',
    gotcha: 'red',
  };
  const color = categoryColors[knowledge.category || ''] || 'gray';

  return `
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-mono text-gray-400">${escapeHtml(knowledge.id)}</span>
            <button type="button"
                    class="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                    title="Copy knowledge ID"
                    onclick="navigator.clipboard.writeText('${escapeHtml(knowledge.id)}').then(() => { const svg = this.querySelector('svg'); const originalPath = svg.innerHTML; svg.innerHTML = '<path stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; stroke-width=&quot;2&quot; d=&quot;M5 13l4 4L19 7&quot;></path>'; this.classList.add('text-green-600'); setTimeout(() => { svg.innerHTML = originalPath; this.classList.remove('text-green-600'); }, 1500); })">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
            <span class="px-2 py-0.5 text-xs font-medium rounded ${knowledge.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}">${knowledge.active ? 'Active' : 'Inactive'}</span>
            ${knowledge.category ? `<span class="px-2 py-0.5 text-xs font-medium rounded bg-${color}-100 text-${color}-700">${knowledge.category}</span>` : ''}
          </div>
          <h2 class="text-xl font-bold text-gray-800">${escapeHtml(knowledge.title)}</h2>
        </div>
        <button onclick="hideModal()" class="shrink-0 size-8 inline-flex justify-center items-center rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 focus:outline-hidden focus:bg-gray-200 cursor-pointer" aria-label="Close">
          <span class="sr-only">Close</span>
          <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>

      <!-- Confidence & Usage Stats -->
      <div class="mb-4 grid grid-cols-2 gap-4">
        <div class="bg-gray-100 rounded-lg p-3">
          <div class="text-xs text-gray-500 mb-1">Confidence</div>
          <div class="text-xl font-semibold text-${color}-600 mb-2">${Math.round(knowledge.confidence * 100)}%</div>
          <div class="w-full bg-gray-200 rounded-full h-1.5">
            <div class="bg-${color}-500 h-1.5 rounded-full transition-all" style="width: ${Math.round(knowledge.confidence * 100)}%"></div>
          </div>
        </div>
        <div class="bg-gray-100 rounded-lg p-3">
          <div class="text-xs text-gray-500 mb-1">Usage</div>
          <div class="text-xl font-semibold text-gray-700">${knowledge.usage_count || 0} <span class="text-sm font-normal text-gray-500">times</span></div>
          <div class="text-xs text-gray-400 mt-1">${knowledge.last_used_at ? 'Last used ' + knowledge.last_used_at.split('T')[0] : 'Never used'}</div>
        </div>
      </div>

      <!-- Content -->
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Content</h3>
        <div class="text-sm text-gray-700 bg-gray-100 rounded-lg p-4 leading-relaxed markdown-content" data-markdown>${escapeHtml(knowledge.content)}</div>
      </div>

      <!-- Metadata -->
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Metadata</h3>
        <div class="text-sm text-gray-700 space-y-1">
          <div><span class="text-gray-400">Namespace:</span> ${escapeHtml(knowledge.namespace)}</div>
          <div><span class="text-gray-400">Scope:</span> ${knowledge.decision_scope}</div>
          <div><span class="text-gray-400">Source:</span> ${knowledge.source}${knowledge.source === 'ticket' && knowledge.origin_ticket_type ? ` (${knowledge.origin_ticket_type})` : ''}</div>
        </div>
      </div>

      ${knowledge.origin_ticket_id ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Origin Ticket</h3>
          <span class="inline-flex items-center px-2 py-1 text-xs rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 cursor-pointer font-mono font-medium"
                hx-get="/partials/ticket-modal/${encodeURIComponent(knowledge.origin_ticket_id)}"
                hx-target="#modal-content"
                hx-trigger="click">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            ${escapeHtml(knowledge.origin_ticket_id)}
          </span>
        </div>
      ` : ''}

      <!-- Tags -->
      ${knowledge.tags?.length ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Tags</h3>
          <div class="flex flex-wrap gap-2">
            ${knowledge.tags.map(t => `<span class="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Actions & Metadata Footer -->
      <div class="mt-6 pt-4 border-t flex items-center justify-between">
        <div class="text-xs text-gray-400">
          <span>Created: ${knowledge.created_at || 'N/A'}</span>
          <span class="ml-4">Updated: ${knowledge.updated_at || 'N/A'}</span>
        </div>
        <button type="button"
                class="px-3 py-1.5 text-xs font-medium ${knowledge.active ? 'text-gray-700 bg-gray-100 hover:bg-gray-200' : 'text-green-700 bg-green-50 hover:bg-green-100'} rounded transition-colors"
                hx-patch="/api/knowledge/${knowledge.id}/active"
                hx-vals='{"active": ${!knowledge.active}}'
                hx-target="#modal-content"
                hx-swap="innerHTML"
                hx-on::after-request="htmx.trigger('#knowledge-list', 'refresh')">
          ${knowledge.active ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  `;
}

// Knowledge-related UI components
import { escapeHtml } from './utils.js';
import { renderCommentsSection } from './comments.js';
import type { Comment } from '../../types.js';

// Helper to render knowledge view
export function renderKnowledgeView(): string {
  return `
    <div>
      <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Knowledge Base</h1>
      <div class="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <aside class="w-full lg:w-64 shrink-0 lg:sticky lg:top-4 lg:self-start">
        <div class="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:gap-4 lg:space-y-0 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border shadow-2xs rounded-md p-3 lg:p-4">
          <div>
            <label for="k-status" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Status</label>
            <select id="k-status" name="k-status" class="w-full border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface dark:text-gray-200"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-category'],[name='k-namespace'],[name='k-scope'],[name='k-origin'],[name='k-author'],[name='k-branch']">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label for="k-category" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Category</label>
            <select id="k-category" name="k-category" class="w-full border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface dark:text-gray-200"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-status'],[name='k-namespace'],[name='k-scope'],[name='k-origin'],[name='k-author'],[name='k-branch']">
              <option value="">All</option>
              <option value="pattern">Pattern</option>
              <option value="truth">Truth</option>
              <option value="principle">Principle</option>
              <option value="architecture">Architecture</option>
              <option value="gotcha">Gotcha</option>
            </select>
          </div>

          <div>
            <label for="k-scope" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Scope</label>
            <select id="k-scope" name="k-scope" class="w-full border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface dark:text-gray-200"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-status'],[name='k-category'],[name='k-namespace'],[name='k-origin'],[name='k-author'],[name='k-branch']">
              <option value="">All</option>
              <option value="global">Global</option>
              <option value="new-only">New Only</option>
              <option value="backward-compatible">Backward Compatible</option>
              <option value="legacy-frozen">Legacy Frozen</option>
            </select>
          </div>

          <div>
            <label for="k-origin" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Source</label>
            <select id="k-origin" name="k-origin" class="w-full border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface dark:text-gray-200"
                    hx-get="/partials/knowledge-list"
                    hx-trigger="change"
                    hx-target="#knowledge-list"
                    hx-include="[name='k-status'],[name='k-category'],[name='k-namespace'],[name='k-scope'],[name='k-author'],[name='k-branch']">
              <option value="">All</option>
              <option value="ticket">Ticket</option>
              <option value="discovery">Discovery</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          <div>
            <label for="k-author" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Author</label>
            <input id="k-author" name="k-author" type="text" placeholder="Filter by author..."
                   class="w-full border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface dark:text-gray-200"
                   hx-get="/partials/knowledge-list"
                   hx-trigger="keyup changed delay:400ms"
                   hx-target="#knowledge-list"
                   hx-include="[name='k-status'],[name='k-category'],[name='k-namespace'],[name='k-scope'],[name='k-origin'],[name='k-branch']">
          </div>

          <div>
            <label for="k-branch" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Branch</label>
            <input id="k-branch" name="k-branch" type="text" placeholder="Filter by branch..."
                   class="w-full border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface dark:text-gray-200"
                   hx-get="/partials/knowledge-list"
                   hx-trigger="keyup changed delay:400ms"
                   hx-target="#knowledge-list"
                   hx-include="[name='k-status'],[name='k-category'],[name='k-namespace'],[name='k-scope'],[name='k-origin'],[name='k-author']">
          </div>
        </div>
      </aside>

      <main class="flex-1">
        <div id="knowledge-list" hx-get="/partials/knowledge-list" hx-trigger="load, refresh" hx-swap="innerHTML"
             hx-include="[name='k-status'],[name='k-category'],[name='k-namespace'],[name='k-scope'],[name='k-origin'],[name='k-author'],[name='k-branch']">
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
  author?: string;
  branch?: string;
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
    <div class="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border shadow-2xs rounded-md p-4 hover:shadow-md transition cursor-pointer ${inactiveClass}"
         hx-get="/partials/knowledge-modal/${encodeURIComponent(k.id)}"
         hx-target="#modal-content"
         hx-trigger="click"
         onclick="showModal()">
      <div class="text-xs font-mono text-gray-400 dark:text-gray-500 mb-1">${escapeHtml(k.id)}</div>
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <div class="text-sm font-medium text-gray-800 dark:text-gray-100">${escapeHtml(k.title)}</div>
            ${!k.active ? '<span class="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Inactive</span>' : ''}
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">${escapeHtml(k.content.slice(0, 200))}${k.content.length > 200 ? '...' : ''}</p>
        </div>
        <div class="text-right shrink-0 ml-4">
          <div class="text-sm font-medium text-gray-600 dark:text-gray-300">${Math.round(k.confidence * 100)}%</div>
          <div class="text-xs text-gray-400 dark:text-gray-500">confidence</div>
        </div>
      </div>
      <div class="flex items-center mt-3 text-xs text-gray-500 gap-3">
        <span><span class="text-gray-400">Namespace:</span> ${escapeHtml(k.namespace)}</span>
        <span><span class="text-gray-400">Source:</span> ${k.source || 'manual'}${k.source === 'ticket' && k.origin_ticket_type ? ` (${k.origin_ticket_type})` : ''}</span>
        ${k.category ? `<span><span class="text-gray-400 dark:text-gray-500">Category:</span> <span class="text-${color}-600 dark:text-${color}-400 font-medium">${k.category}</span></span>` : ''}
        <span><span class="text-gray-400">Scope:</span> ${k.decision_scope}</span>
        ${k.author ? `<span><span class="text-gray-400">Author:</span> ${escapeHtml(k.author)}</span>` : ''}
        ${k.branch ? `<span><span class="text-gray-400">Branch:</span> ${k.branch !== 'main' ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">${escapeHtml(k.branch)}</span>` : 'main'}</span>` : ''}
      </div>
    </div>
  `;
}

// Build query params string for knowledge filters (used in load-more URLs)
function buildKnowledgeFilterParams(filters?: { status?: string; category?: string; namespace?: string; scope?: string; source?: string; author?: string; branch?: string }): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.status) params.set('k-status', filters.status);
  if (filters.category) params.set('k-category', filters.category);
  if (filters.namespace) params.set('k-namespace', filters.namespace);
  if (filters.scope) params.set('k-scope', filters.scope);
  if (filters.source) params.set('k-origin', filters.source);
  if (filters.author) params.set('k-author', filters.author);
  if (filters.branch) params.set('k-branch', filters.branch);
  const str = params.toString();
  return str ? `&${str}` : '';
}

// Helper to render knowledge list with optional load-more
export function renderKnowledgeList(items: KnowledgeItem[], hasMore?: boolean, filters?: { status?: string; category?: string; namespace?: string; scope?: string; source?: string; author?: string; branch?: string }): string {
  if (items.length === 0) {
    return '<p class="text-gray-500 dark:text-gray-400 text-center py-8">No knowledge entries found</p>';
  }

  const filterParams = buildKnowledgeFilterParams(filters);

  return `
    <div class="space-y-3">
      ${items.map(k => renderKnowledgeCard(k)).join('')}
      ${hasMore ? `
        <button class="block mx-auto px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors cursor-pointer"
                hx-get="/partials/knowledge-more?offset=12${filterParams}"
                hx-swap="outerHTML">
          Load More
        </button>
      ` : ''}
    </div>
  `;
}

// Helper to render more knowledge items (pagination)
export function renderKnowledgeMore(items: KnowledgeItem[], nextOffset: number, hasMore: boolean, filters?: { status?: string; category?: string; namespace?: string; scope?: string; source?: string; author?: string; branch?: string }): string {
  const cards = items.map(k => renderKnowledgeCard(k)).join('');

  if (!hasMore) {
    return cards;
  }

  const filterParams = buildKnowledgeFilterParams(filters);

  return `
    ${cards}
    <button class="block mx-auto px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors cursor-pointer"
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
  author?: string;
  branch?: string;
  created_at?: string;
  updated_at?: string;
}, comments?: Comment[]): string {
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
                    class="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                    title="Copy knowledge ID"
                    onclick="navigator.clipboard.writeText('${escapeHtml(knowledge.id)}').then(() => { const svg = this.querySelector('svg'); const originalPath = svg.innerHTML; svg.innerHTML = '<path stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; stroke-width=&quot;2&quot; d=&quot;M5 13l4 4L19 7&quot;></path>'; this.classList.add('text-green-600'); setTimeout(() => { svg.innerHTML = originalPath; this.classList.remove('text-green-600'); }, 1500); })">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
            <span class="px-2 py-0.5 text-xs font-medium rounded ${knowledge.active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}">${knowledge.active ? 'Active' : 'Inactive'}</span>
            ${knowledge.category ? `<span class="px-2 py-0.5 text-xs font-medium rounded bg-${color}-100 dark:bg-${color}-900/30 text-${color}-700 dark:text-${color}-300">${knowledge.category}</span>` : ''}
          </div>
          <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">${escapeHtml(knowledge.title)}</h2>
        </div>
        <button onclick="hideModal()" class="shrink-0 size-8 inline-flex justify-center items-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-hidden focus:bg-gray-200 dark:focus:bg-gray-600 cursor-pointer" aria-label="Close">
          <span class="sr-only">Close</span>
          <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>

      <!-- Confidence & Usage Stats -->
      <div class="mb-4 grid grid-cols-2 gap-4">
        <div class="bg-gray-100 dark:bg-gray-700/50 rounded-lg p-3">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Confidence</div>
          <div class="text-xl font-semibold text-${color}-600 dark:text-${color}-400 mb-2">${Math.round(knowledge.confidence * 100)}%</div>
          <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
            <div class="bg-${color}-500 h-1.5 rounded-full transition-all" style="width: ${Math.round(knowledge.confidence * 100)}%"></div>
          </div>
        </div>
        <div class="bg-gray-100 dark:bg-gray-700/50 rounded-lg p-3">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Usage</div>
          <div class="text-xl font-semibold text-gray-700 dark:text-gray-200">${knowledge.usage_count || 0} <span class="text-sm font-normal text-gray-500 dark:text-gray-400">times</span></div>
          <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">${knowledge.last_used_at ? 'Last used ' + knowledge.last_used_at.split('T')[0] : 'Never used'}</div>
        </div>
      </div>

      <!-- Content -->
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Content</h3>
        <div class="text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-4 leading-relaxed markdown-content" data-markdown>${escapeHtml(knowledge.content)}</div>
      </div>

      <!-- Metadata -->
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Metadata</h3>
        <div class="text-sm text-gray-700 dark:text-gray-200 space-y-1">
          <div><span class="text-gray-400 dark:text-gray-500">Namespace:</span> ${escapeHtml(knowledge.namespace)}</div>
          <div><span class="text-gray-400 dark:text-gray-500">Source:</span> ${knowledge.source}${knowledge.source === 'ticket' && knowledge.origin_ticket_type ? ` (${knowledge.origin_ticket_type})` : ''}</div>
          <div><span class="text-gray-400 dark:text-gray-500">Scope:</span> ${knowledge.decision_scope}</div>
          ${knowledge.author ? `<div><span class="text-gray-400 dark:text-gray-500">Author:</span> ${escapeHtml(knowledge.author)}</div>` : ''}
          ${knowledge.branch ? `<div><span class="text-gray-400 dark:text-gray-500">Branch:</span> ${knowledge.branch !== 'main' ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium text-xs">${escapeHtml(knowledge.branch)}</span>` : 'main'}</div>` : ''}
        </div>
      </div>

      ${knowledge.origin_ticket_id ? `
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Origin Ticket</h3>
          <span class="inline-flex items-center px-2 py-1 text-xs rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 cursor-pointer font-mono font-medium"
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
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Tags</h3>
          <div class="flex flex-wrap gap-2">
            ${knowledge.tags.map(t => `<span class="px-3 py-1 text-sm rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${renderCommentsSection(comments || [], 'knowledge', knowledge.id)}

      <!-- Hidden export data -->
      <script id="knowledge-export-data" type="application/json">${JSON.stringify({
        id: knowledge.id,
        title: knowledge.title,
        content: knowledge.content,
        namespace: knowledge.namespace,
        category: knowledge.category,
        source: knowledge.source,
        origin_ticket_id: knowledge.origin_ticket_id,
        origin_ticket_type: knowledge.origin_ticket_type,
        confidence: knowledge.confidence,
        active: knowledge.active,
        decision_scope: knowledge.decision_scope,
        tags: knowledge.tags,
        author: knowledge.author,
        branch: knowledge.branch,
        created_at: knowledge.created_at,
        updated_at: knowledge.updated_at,
      })}</script>

      <!-- Actions & Metadata Footer -->
      <div class="mt-6 pt-4 border-t flex items-center justify-between">
        <div class="text-xs text-gray-400 dark:text-gray-500">
          <span>Created: ${knowledge.created_at || 'N/A'}</span>
          <span class="ml-4">Updated: ${knowledge.updated_at || 'N/A'}</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button"
                  class="p-1.5 text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors cursor-pointer"
                  onclick="exportKnowledgeAsMarkdown('${escapeHtml(knowledge.id)}')"
                  title="Export as Markdown">
            <svg class="size-4" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M212.24,83.76l-56-56A6,6,0,0,0,152,26H56A14,14,0,0,0,42,40v72a6,6,0,0,0,12,0V40a2,2,0,0,1,2-2h90V88a6,6,0,0,0,6,6h50V224a6,6,0,0,0,12,0V88A6,6,0,0,0,212.24,83.76ZM158,46.48,193.52,82H158ZM144,146H128a6,6,0,0,0-6,6v56a6,6,0,0,0,6,6h16a34,34,0,0,0,0-68Zm0,56H134V158h10a22,22,0,0,1,0,44Zm-42-50v56a6,6,0,0,1-12,0V171L72.92,195.44a6,6,0,0,1-9.84,0L46,171v37a6,6,0,0,1-12,0V152a6,6,0,0,1,10.92-3.44l23.08,33,23.08-33A6,6,0,0,1,102,152Z"></path></svg>
          </button>
          <button type="button"
                  class="p-1.5 text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors cursor-pointer"
                  onclick="exportKnowledgeAsPDF('${escapeHtml(knowledge.id)}')"
                  title="Export as PDF">
            <svg class="size-4" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M222,152a6,6,0,0,1-6,6H190v20h18a6,6,0,0,1,0,12H190v18a6,6,0,0,1-12,0V152a6,6,0,0,1,6-6h32A6,6,0,0,1,222,152ZM90,172a26,26,0,0,1-26,26H54v10a6,6,0,0,1-12,0V152a6,6,0,0,1,6-6H64A26,26,0,0,1,90,172Zm-12,0a14,14,0,0,0-14-14H54v28H64A14,14,0,0,0,78,172Zm84,8a34,34,0,0,1-34,34H112a6,6,0,0,1-6-6V152a6,6,0,0,1,6-6h16A34,34,0,0,1,162,180Zm-12,0a22,22,0,0,0-22-22H118v44h10A22,22,0,0,0,150,180ZM42,112V40A14,14,0,0,1,56,26h96a6,6,0,0,1,4.25,1.76l56,56A6,6,0,0,1,214,88v24a6,6,0,0,1-12,0V94H152a6,6,0,0,1-6-6V38H56a2,2,0,0,0-2,2v72a6,6,0,0,1-12,0ZM158,82h35.52L158,46.48Z"></path></svg>
          </button>
          <button type="button"
                  class="px-3 py-1.5 text-xs font-medium ${knowledge.active ? 'text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600' : 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30'} rounded transition-colors cursor-pointer"
                  hx-patch="/api/knowledge/${knowledge.id}/active"
                  hx-vals='{"active": ${!knowledge.active}}'
                  hx-target="#modal-content"
                  hx-swap="innerHTML"
                  hx-on::after-request="htmx.trigger('#knowledge-list', 'refresh')">
            ${knowledge.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  `;
}

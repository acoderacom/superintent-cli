// Search-related UI components
import { escapeHtml } from './utils.js';

// Helper to render search view
export function renderSearchView(): string {
  return `
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-800 mb-6">Semantic Search</h1>

      <div class="relative">
        <input type="text"
               id="search-input"
               name="query"
               placeholder="Search knowledge base..."
               autocomplete="off"
               class="w-full px-4 py-3 text-lg border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
               hx-get="/partials/search-results"
               hx-trigger="input changed delay:300ms, keyup[key=='Enter']"
               hx-target="#search-results"
               hx-include="[name='category'],[name='limit']"
               hx-indicator="#search-spinner">
        <div id="search-spinner" class="htmx-indicator absolute right-3 top-3.5">
          <svg class="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      </div>

      <div class="flex gap-3 mt-4">
        <select name="category" class="border rounded-lg px-3 py-2 text-sm bg-white"
                hx-get="/partials/search-results"
                hx-trigger="change"
                hx-target="#search-results"
                hx-include="[name='query'],[name='limit']">
          <option value="">All Categories</option>
          <option value="pattern">Pattern</option>
          <option value="truth">Truth</option>
          <option value="principle">Principle</option>
          <option value="architecture">Architecture</option>
          <option value="gotcha">Gotcha</option>
        </select>

        <select name="limit" class="border rounded-lg px-3 py-2 text-sm bg-white"
                hx-get="/partials/search-results"
                hx-trigger="change"
                hx-target="#search-results"
                hx-include="[name='query'],[name='category']">
          <option value="5">5 results</option>
          <option value="10">10 results</option>
          <option value="20">20 results</option>
        </select>
      </div>

      <div id="search-results" class="mt-6">
        <p class="text-gray-500 text-center py-8">Enter a search query to find relevant knowledge</p>
      </div>
    </div>
  `;
}

// Helper to render search results
export function renderSearchResults(results: {
  id: string;
  title: string;
  content: string;
  category?: string;
  namespace: string;
  source?: string;
  origin_ticket_type?: string;
  decision_scope: string;
  tags?: string[];
  score: number;
  confidence: number;
  active: boolean;
}[]): string {
  if (results.length === 0) {
    return '<p class="text-gray-500 text-center py-8">No results found</p>';
  }

  const categoryColors: Record<string, string> = {
    pattern: 'purple',
    truth: 'green',
    principle: 'orange',
    architecture: 'blue',
    gotcha: 'red',
  };

  return `
    <div class="space-y-4">
      ${results.map(r => {
        const color = categoryColors[r.category || ''] || 'gray';
        const scorePercent = Math.round(r.score * 100);
        const inactiveClass = !r.active ? 'opacity-60 border-dashed' : '';
        return `
          <div class="bg-white rounded-lg shadow-card p-4 hover:shadow-card-hover transition-shadow cursor-pointer ${inactiveClass}"
               hx-get="/partials/knowledge-modal/${encodeURIComponent(r.id)}"
               hx-target="#modal-content"
               hx-trigger="click"
               onclick="showModal()">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <h3 class="font-semibold text-gray-800">${escapeHtml(r.title)}</h3>
                  ${!r.active ? '<span class="px-2 py-0.5 text-xs rounded bg-gray-200 text-gray-600">Inactive</span>' : ''}
                </div>
                <p class="text-sm text-gray-600 mt-1 line-clamp-3">${escapeHtml(r.content.slice(0, 300))}${r.content.length > 300 ? '...' : ''}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-lg font-bold text-${color}-600">${scorePercent}%</div>
                <div class="text-xs text-gray-400">match</div>
              </div>
            </div>
            <div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
              <span><span class="text-gray-400">Namespace:</span> ${escapeHtml(r.namespace)}</span>
              <span><span class="text-gray-400">Source:</span> ${r.source || 'manual'}${r.source === 'ticket' && r.origin_ticket_type ? ` (${r.origin_ticket_type})` : ''}</span>
              ${r.category ? `<span><span class="text-gray-400">Category:</span> <span class="text-${color}-600 font-medium">${r.category}</span></span>` : ''}
              <span><span class="text-gray-400">Scope:</span> ${r.decision_scope}</span>
              ${(r.tags || []).length > 0 ? `<span><span class="text-gray-400">Tags:</span> ${(r.tags || []).slice(0, 3).map(t => escapeHtml(t)).join(', ')}</span>` : ''}
            </div>
            <div class="mt-2">
              <div class="w-full bg-gray-100 rounded-full h-1">
                <div class="bg-${color}-500 h-1 rounded-full" style="width: ${scorePercent}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

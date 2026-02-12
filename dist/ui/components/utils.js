// Shared utilities for UI components
// HTML escape helper to prevent XSS
export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
// Reusable markdown editor component (write/preview tabs)
// Uses marked.js + DOMPurify already loaded via CDN in layout.ts
export function renderMarkdownEditor(opts) {
    const { name, id, placeholder = '', rows = 12, required = false, value = '' } = opts;
    return `
    <div id="${id}" class="border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      <div class="flex border-b bg-gray-50">
        <button type="button" data-md-tab="write"
                class="px-3 py-1.5 text-xs font-medium border-b-2 border-blue-700 text-blue-700 transition-colors">
          Write
        </button>
        <button type="button" data-md-tab="preview"
                class="px-3 py-1.5 text-xs font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 transition-colors">
          Preview
        </button>
      </div>
      <textarea name="${name}" ${required ? 'required' : ''} rows="${rows}"
                placeholder="${placeholder}"
                class="w-full px-3 py-2 text-sm outline-none resize-y font-mono">${value}</textarea>
      <div data-md-preview class="hidden w-full px-3 py-2 text-sm markdown-content min-h-[${rows * 1.5}rem] bg-white"></div>
    </div>
    <script>initMarkdownEditor('${id}')</script>
  `;
}

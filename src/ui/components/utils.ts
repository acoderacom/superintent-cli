// Shared utilities for UI components

// HTML escape helper to prevent XSS
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Reusable markdown editor component (write/preview tabs)
// Uses marked.js + DOMPurify already loaded via CDN in layout.ts
export function renderMarkdownEditor(opts: {
  name: string;
  id: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  value?: string;
}): string {
  const { name, id, placeholder = '', rows = 12, required = false, value = '' } = opts;
  return `
    <div id="${id}" class="border dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      <div class="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button type="button" data-md-tab="write"
                class="px-3 py-1.5 text-xs font-medium border-b-2 border-blue-700 dark:border-blue-400 text-blue-700 dark:text-blue-400 transition-colors">
          Write
        </button>
        <button type="button" data-md-tab="preview"
                class="px-3 py-1.5 text-xs font-medium border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          Preview
        </button>
      </div>
      <textarea name="${name}" ${required ? 'required' : ''} rows="${rows}"
                placeholder="${placeholder}"
                class="w-full px-3 py-2 text-sm outline-none resize-y font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500">${value}</textarea>
      <div data-md-preview class="hidden w-full px-3 py-2 text-sm markdown-content min-h-[${rows * 1.5}rem] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200"></div>
    </div>
    <script>initMarkdownEditor('${id}')</script>
  `;
}

// Column data interface for kanban pagination
export interface ColumnData {
  status: string;
  tickets: {
    id: string;
    type?: string;
    title?: string;
    status: string;
    intent: string;
    change_class?: string;
    change_class_reason?: string;
    plan?: { taskSteps?: { task: string; steps: string[]; done: boolean }[] };
  }[];
  hasMore: boolean;
}

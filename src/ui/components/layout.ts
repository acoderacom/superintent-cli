// Main layout component for Superintent Web UI
import { escapeHtml } from './utils.js';

// Main HTML shell with sidebar navigation, header, and JavaScript
export function getHtml(namespace: string, version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Superintent</title>
  <link rel="stylesheet" href="/styles.css">
<script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@17.0.1/lib/marked.umd.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js"></script>
  <style>
    .drag-over { outline: 2px dashed var(--color-blue-500); background: var(--color-blue-50); }
    .dragging { opacity: 0.5; }
    .htmx-indicator { display: none; }
    .htmx-request .htmx-indicator { display: inline-block; }
    .htmx-request.htmx-indicator { display: inline-block; }
    .nav-active { background: var(--color-gray-200); font-weight: 500; }
    .score-bar { height: 4px; border-radius: 2px; }
    .modal-content { max-height: 85vh; min-height: 200px; }
    #modal { opacity: 0; transition: opacity 150ms ease-out; }
    #modal.show { opacity: 1; }
    #modal-content { transform: scale(0.95); transition: transform 150ms ease-out; }
    #modal.show #modal-content { transform: scale(1); }
    /* Search modal */
    #search-modal { opacity: 0; transition: opacity 150ms ease-out; }
    #search-modal.show { opacity: 1; }
    #search-modal-content { transform: scale(0.95) translateY(-10px); transition: transform 150ms ease-out; }
    #search-modal.show #search-modal-content { transform: scale(1) translateY(0); }
    /* Sidebar transitions */
    #sidebar { transition: translate 300ms ease-in-out, transform 300ms ease-in-out; }
    #sidebar-backdrop { transition: opacity 200ms ease-in-out; }
    /* Markdown prose styles */
    .markdown-content h1, .markdown-content h2, .markdown-content h3 { font-weight: 600; margin-top: 1em; margin-bottom: 0.5em; }
    .markdown-content h1 { font-size: 1.25em; }
    .markdown-content h2 { font-size: 1.1em; }
    .markdown-content h3 { font-size: 1em; }
    .markdown-content p { margin-bottom: 0.75em; }
    .markdown-content ul, .markdown-content ol { margin-left: 1.5em; margin-bottom: 0.75em; }
    .markdown-content ul { list-style-type: disc; }
    .markdown-content ol { list-style-type: decimal; }
    .markdown-content li { margin-bottom: 0.25em; }
    .markdown-content code { background: var(--color-gray-200); padding: 0.125em 0.25em; border-radius: 0.25em; font-size: 0.9em; }
    .markdown-content pre { background: var(--color-gray-800); color: var(--color-gray-100); padding: 0.75em; border-radius: 0.375em; overflow-x: auto; margin-bottom: 0.75em; }
    .markdown-content pre code { background: none; padding: 0; color: inherit; }
    .markdown-content strong { font-weight: 600; }
    .markdown-content a { color: var(--color-blue-600); text-decoration: underline; }
    .markdown-content blockquote { border-left: 3px solid var(--color-gray-300); padding-left: 1em; color: var(--color-gray-500); margin-bottom: 0.75em; }
    .markdown-content li:has(> input[type="checkbox"]) { list-style: none; display: flex; align-items: baseline; gap: 0.4em; margin-left: -1.5em; }
    .markdown-content li > input[type="checkbox"] { margin: 0; pointer-events: none; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">

  <!-- ========== HEADER ========== -->
  <header class="fixed top-0 inset-x-0 z-50 w-full bg-gray-100 text-sm py-2.5">
    <nav class="px-4 sm:px-6 flex basis-full items-center w-full mx-auto">
      <div class="w-full flex items-center gap-x-2">
        <ul class="flex items-center gap-2.5">
          <li class="inline-flex items-center gap-2 relative pe-2.5 last:pe-0 last:after:hidden after:absolute after:top-1/2 after:end-0 after:inline-block after:w-px after:h-3.5 after:bg-gray-300 after:rounded-full after:-translate-y-1/2 after:rotate-12">
            <!-- Logo Icon -->
            <a class="shrink-0 inline-flex justify-center items-center bg-blue-600 size-8 rounded-md font-semibold focus:outline-hidden focus:opacity-80" href="#" aria-label="Superintent">
              <svg class="shrink-0 size-5 text-white" viewBox="0 0 222 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M172.213 0C199.671 0 222 22.3653 222 50C222 77.576 199.672 99.9998 172.155 100H221.941V200H49.7871C22.3286 200 0 177.635 0 150C9.4336e-05 122.424 22.2704 100 49.7871 100H0V0H172.213ZM93.2451 82.5127L61.2129 100.104L93.2451 117.722L110.767 149.883L128.288 117.722L160.32 100.104L128.288 82.5127L110.767 50.3516L93.2451 82.5127Z" fill="currentColor"/>
              </svg>
            </a>

            <!-- Sidebar Toggle -->
            <button type="button" onclick="toggleSidebar()" class="p-1 size-7 inline-flex items-center justify-center rounded-md border border-transparent text-gray-800 hover:bg-gray-200 cursor-pointer focus:outline-hidden focus:bg-gray-200">
              <svg class="shrink-0 size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/></svg>
              <span class="sr-only">Sidebar Toggle</span>
            </button>
          </li>

          <li class="inline-flex items-center relative pe-2.5 last:pe-0 last:after:hidden after:absolute after:top-1/2 after:end-0 after:inline-block after:w-px after:h-3.5 after:bg-gray-300 after:rounded-full after:-translate-y-1/2 after:rotate-12">
            <!-- Namespace Dropdown -->
            <div class="inline-flex justify-center w-full">
              <div class="relative inline-flex">
                <!-- Namespace Button -->
                <button id="namespace-btn" type="button" onclick="toggleNamespaceDropdown()" class="py-1.5 px-2.5 min-h-8 flex items-center gap-x-1.5 font-medium text-sm text-gray-800 rounded-lg hover:bg-gray-200 cursor-pointer focus:outline-hidden focus:bg-gray-200">
                  <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                  ${escapeHtml(namespace)}
                  <svg class="shrink-0 size-3.5 ms-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
                </button>

                <!-- Dropdown -->
                <div id="namespace-dropdown" class="hidden absolute top-full start-0 mt-2 w-65 z-20 bg-white border border-transparent rounded-xl shadow-xl">
                  <div class="p-1.5">
                    <span class="block pt-2 pb-2 ps-2.5 text-sm text-gray-500">
                      Namespace
                    </span>

                    <div class="flex flex-col gap-y-1">
                      <!-- Active Namespace -->
                      <label class="py-2.5 px-3 group flex justify-start items-center gap-x-3 rounded-lg cursor-pointer text-xs text-gray-800 hover:bg-gray-100 focus:outline-hidden focus:bg-gray-100">
                        <input type="radio" class="hidden" checked>
                        <svg class="shrink-0 size-4 opacity-0 group-has-checked:opacity-100" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        <span class="grow">
                          <span class="block text-sm font-medium text-gray-800">
                            ${escapeHtml(namespace)}
                          </span>
                        </span>
                        <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- End Namespace Dropdown -->
          </li>
        </ul>

      </div>
    </nav>
  </header>
  <!-- ========== END HEADER ========== -->

  <!-- ========== SIDEBAR ========== -->
  <aside id="sidebar" class="fixed inset-y-0 start-0 z-40 w-60 bg-gray-100 pt-13 -translate-x-full lg:translate-x-0">
    <div class="relative flex flex-col h-full max-h-full">
      <nav class="p-3 flex-1 flex flex-col overflow-y-auto">

        <!-- Close button (mobile only) -->
        <div class="lg:hidden mb-2 flex items-center justify-end">
          <button type="button" onclick="toggleSidebar()" class="p-1.5 inline-flex items-center text-gray-500 rounded-md hover:bg-gray-200 focus:outline-none">
            <svg class="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Search Button -->
        <button type="button" onclick="showSearchModal()" class="p-1.5 ps-2.5 w-full inline-flex items-center gap-x-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-600 shadow-xs cursor-pointer focus:outline-hidden disabled:opacity-50 disabled:pointer-events-none">
          Search
          <span class="ms-auto flex items-center gap-x-1 py-px px-1.5 border border-gray-200 rounded-md">
            <svg class="shrink-0 size-2.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"></path></svg>
            <span class="text-xs uppercase">k</span>
          </span>
        </button>

        <!-- Navigation Section -->
        <div class="pt-3 mt-3 flex flex-col border-t border-gray-200">
          <span class="block ps-2.5 mb-2 font-medium text-xs uppercase text-gray-500">
            Navigation
          </span>
          <ul class="flex flex-col gap-y-0.5">
            <li>
              <button id="nav-ticket" onclick="switchTab('ticket')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none nav-active">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
                </svg>
                Kanban Board
              </button>
            </li>
            <li>
              <button id="nav-knowledge" onclick="switchTab('knowledge')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                Knowledge
              </button>
            </li>
            <li>
              <button id="nav-spec" onclick="switchTab('spec')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                </svg>
                Specs
              </button>
            </li>
          </ul>
        </div>

      </nav>
      <!-- Version -->
      <div class="p-3 border-t border-gray-200">
        <span class="block ps-2.5 text-xs text-gray-400">Superintent v${escapeHtml(version)}</span>
      </div>
    </div>
  </aside>
  <!-- ========== END SIDEBAR ========== -->

  <!-- Sidebar Backdrop (mobile) -->
  <div id="sidebar-backdrop" class="fixed inset-0 z-30 bg-black/50 opacity-0 pointer-events-none lg:hidden" onclick="toggleSidebar()"></div>

  <!-- ========== MAIN CONTENT ========== -->
  <main id="main-content" class="lg:ps-60 pt-13 px-3 pb-3 transition-all duration-300">
    <div class="h-[calc(100dvh-62px)] overflow-hidden flex flex-col bg-white border border-gray-200 shadow-xs rounded-lg">
      <div class="flex-1 overflow-y-auto p-3 sm:p-5">
        <!-- Ticket View (default) - full width -->
        <div id="view-ticket" hx-get="/partials/kanban-view" hx-trigger="load"></div>
        <!-- Knowledge View -->
        <div id="view-knowledge" class="hidden max-w-7xl mx-auto" hx-get="/partials/knowledge-view" hx-trigger="revealed"></div>
        <!-- Spec View -->
        <div id="view-spec" class="hidden max-w-7xl mx-auto" hx-get="/partials/spec-view" hx-trigger="revealed"></div>
      </div>
    </div>
  </main>
  <!-- ========== END MAIN CONTENT ========== -->

  <!-- Search Modal -->
  <div id="search-modal" class="hidden fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-[10vh]" onclick="if(event.target===this)hideSearchModal()">
    <div id="search-modal-content" class="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-auto m-4 max-h-[80vh]"
         hx-get="/partials/search-view" hx-trigger="load">
      <div class="flex justify-center items-center py-16"><div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>
    </div>
  </div>

  <!-- Modal (knowledge detail, tickets, specs — layers on top of search modal) -->
  <div id="modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onclick="if(event.target===this)hideModal()">
    <div id="modal-content" class="modal-content bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-auto m-4">
      <!-- Modal content loaded via HTMX -->
    </div>
  </div>

  <script>
    // Namespace dropdown toggle
    function toggleNamespaceDropdown() {
      const dropdown = document.getElementById('namespace-dropdown');
      dropdown.classList.toggle('hidden');
    }
    // Close namespace dropdown on outside click
    document.addEventListener('click', function(e) {
      const dropdown = document.getElementById('namespace-dropdown');
      const btn = document.getElementById('namespace-btn');
      if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    // Sidebar toggle — works on both mobile (overlay) and desktop (collapse)
    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebar-backdrop');
      const main = document.getElementById('main-content');

      if (window.innerWidth >= 1024) {
        // Desktop: collapse/expand sidebar + shift main content
        const isCollapsed = sidebar.style.transform === 'translateX(-100%)';
        if (isCollapsed) {
          sidebar.style.transform = '';
          main.classList.add('lg:ps-60');
        } else {
          sidebar.style.transform = 'translateX(-100%)';
          main.classList.remove('lg:ps-60');
        }
      } else {
        // Mobile: overlay with backdrop
        const isOpen = !sidebar.classList.contains('-translate-x-full');
        if (isOpen) {
          sidebar.classList.add('-translate-x-full');
          backdrop.classList.add('opacity-0', 'pointer-events-none');
          backdrop.classList.remove('opacity-100');
          document.body.style.overflow = '';
        } else {
          sidebar.classList.remove('-translate-x-full');
          backdrop.classList.remove('opacity-0', 'pointer-events-none');
          backdrop.classList.add('opacity-100');
          document.body.style.overflow = 'hidden';
        }
      }
    }

    // Close sidebar on mobile when switching tabs
    function closeSidebarOnMobile() {
      if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('opacity-0', 'pointer-events-none');
        backdrop.classList.remove('opacity-100');
        document.body.style.overflow = '';
      }
    }

    // Reset sidebar state on window resize (e.g. mobile→desktop)
    window.addEventListener('resize', function() {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebar-backdrop');
      const main = document.getElementById('main-content');
      if (window.innerWidth >= 1024) {
        // Entering desktop: clear mobile state, restore desktop
        backdrop.classList.add('opacity-0', 'pointer-events-none');
        backdrop.classList.remove('opacity-100');
        document.body.style.overflow = '';
        sidebar.classList.remove('-translate-x-full');
        // Keep collapsed state if user collapsed on desktop
        if (sidebar.style.transform !== 'translateX(-100%)') {
          main.classList.add('lg:ps-60');
        }
      } else {
        // Entering mobile: clear desktop inline style, hide sidebar
        sidebar.style.transform = '';
        sidebar.classList.add('-translate-x-full');
        main.classList.add('lg:ps-60');
      }
    });

    // Tab/view switching with URL hash persistence
    function switchTab(tab, updateHash = true) {
      ['ticket', 'knowledge', 'spec'].forEach(t => {
        document.getElementById('view-' + t).classList.toggle('hidden', t !== tab);
        document.getElementById('nav-' + t).classList.toggle('nav-active', t === tab);
      });
      // Update URL hash for refresh persistence
      if (updateHash) {
        history.replaceState(null, '', '#' + tab);
      }
      // Trigger HTMX load for lazy-loaded views
      htmx.trigger('#view-' + tab, 'revealed');
      // Close sidebar on mobile after selection
      closeSidebarOnMobile();
    }

    // Restore tab from URL hash on page load
    (function() {
      const hash = window.location.hash.slice(1);
      if (['ticket', 'knowledge', 'spec'].includes(hash)) {
        switchTab(hash, false);
      }
    })();

    // Markdown rendering with sanitization
    function renderMarkdown(content) {
      if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        const html = marked.parse(content);
        return DOMPurify.sanitize(html, {
          ADD_TAGS: ['input'],
          ADD_ATTR: ['type', 'checked', 'disabled'],
        });
      }
      // Fallback: escape HTML and preserve whitespace
      return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Render markdown content in elements with data-markdown attribute
    function processMarkdownElements() {
      document.querySelectorAll('[data-markdown]').forEach(function(el) {
        if (!el.dataset.rendered) {
          el.innerHTML = renderMarkdown(el.textContent);
          el.dataset.rendered = 'true';
        }
      });
    }

    // Markdown editor: toggle between write and preview tabs
    function initMarkdownEditor(editorId) {
      const editor = document.getElementById(editorId);
      if (!editor) return;
      const textarea = editor.querySelector('textarea');
      const preview = editor.querySelector('[data-md-preview]');
      const writeTab = editor.querySelector('[data-md-tab="write"]');
      const previewTab = editor.querySelector('[data-md-tab="preview"]');

      writeTab.addEventListener('click', function() {
        textarea.classList.remove('hidden');
        preview.classList.add('hidden');
        writeTab.classList.add('border-blue-700', 'text-blue-700');
        writeTab.classList.remove('border-transparent', 'text-gray-500');
        previewTab.classList.remove('border-blue-700', 'text-blue-700');
        previewTab.classList.add('border-transparent', 'text-gray-500');
      });

      previewTab.addEventListener('click', function() {
        textarea.classList.add('hidden');
        preview.classList.remove('hidden');
        previewTab.classList.add('border-blue-700', 'text-blue-700');
        previewTab.classList.remove('border-transparent', 'text-gray-500');
        writeTab.classList.remove('border-blue-700', 'text-blue-700');
        writeTab.classList.add('border-transparent', 'text-gray-500');
        preview.innerHTML = textarea.value.trim()
          ? renderMarkdown(textarea.value)
          : '<p class="text-gray-400 italic">Nothing to preview</p>';
      });
    }

    // Search modal functions
    function showSearchModal() {
      const modal = document.getElementById('search-modal');
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      void modal.offsetWidth;
      modal.classList.add('show');
      // Focus search input after content loads
      setTimeout(function() { var el = document.getElementById('search-input'); if (el) el.focus(); }, 150);
      // Close sidebar on mobile
      closeSidebarOnMobile();
    }
    function hideSearchModal() {
      const modal = document.getElementById('search-modal');
      modal.classList.remove('show');
      // Only restore scroll if knowledge modal isn't also open
      if (document.getElementById('modal').classList.contains('hidden')) {
        document.body.style.overflow = '';
      }
      setTimeout(() => modal.classList.add('hidden'), 150);
    }

    // Detail modal functions (knowledge, ticket, spec — layers on top of search modal)
    function showModal() {
      const modal = document.getElementById('modal');
      document.getElementById('modal-content').innerHTML = '<div class="flex justify-center items-center py-16"><div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>';
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      void modal.offsetWidth;
      modal.classList.add('show');
    }
    function hideModal() {
      const modal = document.getElementById('modal');
      modal.classList.remove('show');
      // Only restore scroll if search modal isn't also open
      if (document.getElementById('search-modal').classList.contains('hidden')) {
        document.body.style.overflow = '';
      }
      setTimeout(() => modal.classList.add('hidden'), 150);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close topmost modal first: detail modal > search modal
        const detailModal = document.getElementById('modal');
        const searchModal = document.getElementById('search-modal');
        if (!detailModal.classList.contains('hidden')) {
          hideModal();
        } else if (!searchModal.classList.contains('hidden')) {
          hideSearchModal();
        }
      }
      // Cmd+K / Ctrl+K → open search modal
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        showSearchModal();
      }
    });

    // Drag and drop
    let draggedId = null;

    function onDragStart(e, id) {
      draggedId = id;
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }

    function onDragEnd(e) {
      e.target.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function onDragOver(e) {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    }

    function onDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    function onDrop(e, newStatus) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      if (!draggedId) return;

      fetch('/api/tickets/' + encodeURIComponent(draggedId) + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'status=' + encodeURIComponent(newStatus)
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          // Refresh all columns
          htmx.trigger('#kanban-columns', 'refresh');
        }
      });
      draggedId = null;
    }

    // HTMX event handlers
    document.body.addEventListener('htmx:afterRequest', function(e) {
      if (e.detail.pathInfo.requestPath.includes('/status')) {
        htmx.trigger('#kanban-columns', 'refresh');
      }
    });

    // Process markdown elements after HTMX swaps content
    document.body.addEventListener('htmx:afterSwap', function(e) {
      processMarkdownElements();
    });

    // Auto-refresh polling for Tickets and Knowledge tabs
    (function() {
      const POLL_INTERVAL = 5000; // 5 seconds
      let pollTimer = null;
      let currentTab = 'ticket';
      let isPageVisible = true;

      // Start polling for the current tab
      function startPolling() {
        stopPolling();
        if (!isPageVisible) return;

        pollTimer = setInterval(function() {
          if (!isPageVisible) return;

          if (currentTab === 'ticket') {
            htmx.trigger('#kanban-columns', 'refresh');
          } else if (currentTab === 'knowledge') {
            htmx.trigger('#knowledge-list', 'poll-refresh');
          } else if (currentTab === 'spec') {
            htmx.trigger('#spec-list', 'poll-refresh');
          }
        }, POLL_INTERVAL);
      }

      // Stop polling
      function stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      // Handle tab switching - update currentTab and restart polling
      const originalSwitchTab = window.switchTab;
      window.switchTab = function(tab, updateHash) {
        currentTab = tab;
        originalSwitchTab(tab, updateHash);
        startPolling();
      };

      // Handle page visibility changes
      document.addEventListener('visibilitychange', function() {
        isPageVisible = !document.hidden;
        if (isPageVisible && (currentTab === 'ticket' || currentTab === 'knowledge' || currentTab === 'spec')) {
          // Immediate refresh when tab becomes visible
          if (currentTab === 'ticket') {
            htmx.trigger('#kanban-columns', 'refresh');
          } else if (currentTab === 'knowledge') {
            htmx.trigger('#knowledge-list', 'poll-refresh');
          } else if (currentTab === 'spec') {
            htmx.trigger('#spec-list', 'poll-refresh');
          }
          startPolling();
        } else {
          stopPolling();
        }
      });

      // Initialize polling for default tab (ticket)
      startPolling();
    })();
  </script>
</body>
</html>`;
}

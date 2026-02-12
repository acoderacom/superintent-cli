// Main layout component for Superintent Web UI
import { escapeHtml } from './utils.js';
// Main HTML shell with navigation, tabs, and JavaScript
export function getHtml(namespace) {
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
    .tab-active { color: var(--color-blue-700); }
    .score-bar { height: 4px; border-radius: 2px; }
    .modal-content { max-height: 85vh; min-height: 200px; }
    #modal { opacity: 0; transition: opacity 150ms ease-out; }
    #modal.show { opacity: 1; }
    #modal-content { transform: scale(0.95); transition: transform 150ms ease-out; }
    #modal.show #modal-content { transform: scale(1); }
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
  <!-- Navigation -->
  <nav class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4">
      <div class="flex items-center justify-between h-14">
        <div class="flex items-center gap-2 text-gray-800">
          <svg class="h-6 sm:h-8 w-auto" viewBox="0 0 222 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M172.213 0C199.671 0 222 22.3653 222 50C222 77.576 199.672 99.9998 172.155 100H221.941V200H49.7871C22.3286 200 0 177.635 0 150C9.4336e-05 122.424 22.2704 100 49.7871 100H0V0H172.213ZM93.2451 82.5127L61.2129 100.104L93.2451 117.722L110.767 149.883L128.288 117.722L160.32 100.104L128.288 82.5127L110.767 50.3516L93.2451 82.5127Z" fill="currentColor"/>
          </svg>
          <span class="text-base sm:text-2xl font-bold">Superintent</span>
        </div>
        <div class="flex">
          <button id="tab-ticket" onclick="switchTab('ticket')"
                  class="px-2 sm:px-4 py-4 text-xs sm:text-sm font-medium text-gray-800 hover:text-gray-900 cursor-pointer tab-active">
            Ticket
          </button>
          <button id="tab-search" onclick="switchTab('search')"
                  class="px-2 sm:px-4 py-4 text-xs sm:text-sm font-medium text-gray-800 hover:text-gray-900 cursor-pointer">
            Search
          </button>
          <button id="tab-knowledge" onclick="switchTab('knowledge')"
                  class="px-2 sm:px-4 py-4 text-xs sm:text-sm font-medium text-gray-800 hover:text-gray-900 cursor-pointer">
            Knowledge
          </button>
          <button id="tab-spec" onclick="switchTab('spec')"
                  class="px-2 sm:px-4 py-4 text-xs sm:text-sm font-medium text-gray-800 hover:text-gray-900 cursor-pointer">
            Spec
          </button>
        </div>
        <div class="text-xs text-gray-400" id="status-indicator">
          <span class="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>
          <span class="hidden sm:inline">${escapeHtml(namespace)}</span>
        </div>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main id="main-content" class="p-2 sm:p-4">
    <!-- Ticket View (default) - full width -->
    <div id="view-ticket" hx-get="/partials/kanban-view" hx-trigger="load"></div>
    <!-- Search View -->
    <div id="view-search" class="hidden max-w-7xl mx-auto" hx-get="/partials/search-view" hx-trigger="revealed"></div>
    <!-- Knowledge View -->
    <div id="view-knowledge" class="hidden max-w-7xl mx-auto" hx-get="/partials/knowledge-view" hx-trigger="revealed"></div>
    <!-- Spec View -->
    <div id="view-spec" class="hidden max-w-7xl mx-auto" hx-get="/partials/spec-view" hx-trigger="revealed"></div>
  </main>

  <!-- Modal -->
  <div id="modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick="if(event.target===this)hideModal()">
    <div id="modal-content" class="modal-content bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-auto m-4">
      <!-- Modal content loaded via HTMX -->
    </div>
  </div>

  <script>
    // Tab switching with URL hash persistence
    function switchTab(tab, updateHash = true) {
      ['ticket', 'search', 'knowledge', 'spec'].forEach(t => {
        document.getElementById('view-' + t).classList.toggle('hidden', t !== tab);
        document.getElementById('tab-' + t).classList.toggle('tab-active', t === tab);
      });
      // Update URL hash for refresh persistence
      if (updateHash) {
        history.replaceState(null, '', '#' + tab);
      }
      // Trigger HTMX load for lazy-loaded views
      htmx.trigger('#view-' + tab, 'revealed');
    }

    // Restore tab from URL hash on page load
    (function() {
      const hash = window.location.hash.slice(1);
      if (['ticket', 'search', 'knowledge', 'spec'].includes(hash)) {
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

    // Modal functions
    function showModal() {
      const modal = document.getElementById('modal');
      // Clear previous content and show loading spinner
      document.getElementById('modal-content').innerHTML = '<div class="flex justify-center items-center py-16"><div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>';
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      // Trigger reflow for transition
      void modal.offsetWidth;
      modal.classList.add('show');
    }
    function hideModal() {
      const modal = document.getElementById('modal');
      modal.classList.remove('show');
      document.body.style.overflow = '';
      // Wait for transition to finish before hiding
      setTimeout(() => modal.classList.add('hidden'), 150);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideModal();
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
        // Only poll for ticket and knowledge tabs
        if (tab === 'ticket' || tab === 'knowledge' || tab === 'spec') {
          startPolling();
        } else {
          stopPolling();
        }
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

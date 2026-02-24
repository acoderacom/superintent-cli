// Main layout component for Superintent Web UI
import { escapeHtml } from './utils.js';
import { getGraphScript } from './graph.js';

// Main HTML shell with sidebar navigation, header, and JavaScript
export function getHtml(namespace: string, version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Superintent</title>
  <link rel="stylesheet" href="/styles.css">
  <script>
    // Anti-FOUC: apply dark class before body renders
    (function(){
      var d=document.documentElement;
      var t=localStorage.getItem('theme');
      if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){
        d.classList.add('dark');
      }
    })();
  </script>
  <script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@17.0.1/lib/marked.umd.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@4.1.0/dist/jspdf.umd.min.js"></script>
</head>
<body class="bg-gray-100 dark:bg-dark-base min-h-screen">

  <!-- ========== HEADER ========== -->
  <header class="fixed top-0 inset-x-0 z-50 w-full bg-gray-100 dark:bg-dark-base text-sm py-2.5">
    <nav class="px-4 sm:px-6 flex basis-full items-center w-full mx-auto">
      <div class="w-full flex items-center gap-x-2">
        <ul class="flex items-center gap-2.5">
          <li class="inline-flex items-center gap-2 relative pe-2.5 last:pe-0 last:after:hidden after:absolute after:top-1/2 after:end-0 after:inline-block after:w-px after:h-3.5 after:bg-gray-300 dark:after:bg-gray-600 after:rounded-full after:-translate-y-1/2 after:rotate-12">
            <!-- Logo Icon -->
            <a class="shrink-0 inline-flex justify-center items-center bg-blue-600 size-8 rounded-md font-semibold focus:outline-hidden focus:opacity-80" href="#" aria-label="Superintent">
              <svg class="shrink-0 size-5 text-white" viewBox="0 0 222 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M172.213 0C199.671 0 222 22.3653 222 50C222 77.576 199.672 99.9998 172.155 100H221.941V200H49.7871C22.3286 200 0 177.635 0 150C9.4336e-05 122.424 22.2704 100 49.7871 100H0V0H172.213ZM93.2451 82.5127L61.2129 100.104L93.2451 117.722L110.767 149.883L128.288 117.722L160.32 100.104L128.288 82.5127L110.767 50.3516L93.2451 82.5127Z" fill="currentColor"/>
              </svg>
            </a>

            <!-- Sidebar Toggle -->
            <button type="button" onclick="toggleSidebar()" class="p-1 size-7 inline-flex items-center justify-center rounded-md border border-transparent text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-dark-hover cursor-pointer focus:outline-hidden focus-visible:bg-gray-200 dark:focus-visible:bg-dark-hover">
              <svg class="shrink-0 size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path></svg>
              <span class="sr-only">Sidebar Toggle</span>
            </button>
          </li>

          <li class="inline-flex items-center relative pe-2.5 last:pe-0 last:after:hidden after:absolute after:top-1/2 after:end-0 after:inline-block after:w-px after:h-3.5 after:bg-gray-300 dark:after:bg-gray-600 after:rounded-full after:-translate-y-1/2 after:rotate-12">
            <!-- Namespace Dropdown -->
            <div class="inline-flex justify-center w-full">
              <div class="relative inline-flex">
                <!-- Namespace Button -->
                <button id="namespace-btn" type="button" onclick="toggleNamespaceDropdown()" class="py-1.5 px-2.5 min-h-8 flex items-center gap-x-1.5 font-medium text-sm text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-hover cursor-pointer focus:outline-hidden focus:bg-gray-200 dark:focus:bg-dark-hover">
                  <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                  ${escapeHtml(namespace)}
                  <svg class="shrink-0 size-3.5 ms-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
                </button>

                <!-- Dropdown -->
                <div id="namespace-dropdown" class="hidden absolute top-full start-0 mt-2 w-65 z-20 bg-white dark:bg-dark-surface border border-transparent rounded-xl shadow-xl">
                  <div class="p-1.5">
                    <span class="block pt-2 pb-2 ps-2.5 text-sm text-gray-500 dark:text-gray-400">
                      Namespace
                    </span>

                    <div class="flex flex-col gap-y-1">
                      <!-- Active Namespace -->
                      <label class="py-2.5 px-3 group flex justify-start items-center gap-x-3 rounded-lg cursor-pointer text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover focus:outline-hidden focus:bg-gray-100 dark:focus:bg-dark-hover">
                        <input type="radio" class="hidden" name="active-namespace" checked>
                        <svg class="shrink-0 size-4 opacity-0 group-has-checked:opacity-100" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        <span class="grow">
                          <span class="block text-sm font-medium text-gray-800 dark:text-gray-200">
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
  <script>
    // Apply collapsed state immediately to prevent flash
    if (window.innerWidth >= 1024 && localStorage.getItem('sidebar-collapsed') === 'true') {
      document.write('<style id="sidebar-collapsed-style">@media(min-width:1024px){#sidebar{transform:translateX(-100%)!important}#main-content{padding-inline-start:0!important}}</style>');
    }
  </script>
  <aside id="sidebar" class="fixed inset-y-0 start-0 z-40 w-60 bg-gray-100 dark:bg-dark-base pt-13 -translate-x-full lg:translate-x-0">
    <div class="relative flex flex-col h-full max-h-full">
      <nav class="p-3 flex-1 flex flex-col overflow-y-auto">

        <!-- Close button (mobile only) -->
        <div class="lg:hidden mb-2 flex items-center justify-end">
          <button type="button" onclick="toggleSidebar()" class="p-1.5 inline-flex items-center text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-dark-hover focus:outline-none">
            <svg class="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Search Button -->
        <button type="button" onclick="showSearchModal()" class="p-1.5 ps-2.5 w-full inline-flex items-center gap-x-2 text-sm rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 shadow-xs cursor-pointer focus:outline-hidden disabled:opacity-50 disabled:pointer-events-none">
          Search
          <span class="ms-auto flex items-center gap-x-1 py-px px-1.5 border border-gray-200 dark:border-dark-border rounded-md">
            <svg class="shrink-0 size-2.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"></path></svg>
            <span class="text-xs uppercase">k</span>
          </span>
        </button>

        <!-- Navigation Section -->
        <div class="pt-3 mt-3 flex flex-col border-t border-gray-200 dark:border-dark-border">
          <span class="block ps-2.5 mb-2 font-medium text-xs uppercase text-gray-500 dark:text-gray-400">
            Navigation
          </span>
          <ul class="flex flex-col gap-y-0.5">
            <li>
              <button id="nav-dashboard" onclick="switchTab('dashboard')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-hover focus:outline-none nav-active">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                Dashboard
              </button>
            </li>
            <li>
              <button id="nav-spec" onclick="switchTab('spec')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-hover focus:outline-none">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                </svg>
                Specs
              </button>
            </li>
            <li>
              <button id="nav-ticket" onclick="switchTab('ticket')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-hover focus:outline-none">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
                </svg>
                Tickets
              </button>
            </li>
            <li>
              <button id="nav-knowledge" onclick="switchTab('knowledge')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-hover focus:outline-none">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                Knowledge
              </button>
            </li>
            <li>
              <button id="nav-graph" onclick="switchTab('graph')"
                      class="w-full flex items-center gap-x-2.5 py-2 px-2.5 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-hover focus:outline-none">
                <svg class="shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="5" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.5 7.5 11 16"/><path d="m17.5 7.5-5.5 8.5"/><path d="M7 6h10"/>
                </svg>
                Graph
              </button>
            </li>
          </ul>
        </div>

      </nav>
      <!-- Version + Theme Toggle -->
      <div class="p-3">
        <div class="flex items-center justify-between ps-2.5">
          <span class="text-xs text-gray-400 dark:text-gray-500">Superintent v${escapeHtml(version)}</span>
          <button id="theme-toggle" type="button" onclick="cycleTheme()" class="p-1.5 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-hover cursor-pointer focus:outline-none" title="Toggle theme">
            <!-- Sun icon (light) -->
            <svg id="theme-icon-light" class="size-4 hidden" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            <!-- Moon icon (dark) -->
            <svg id="theme-icon-dark" class="size-4 hidden" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            <!-- Monitor icon (system) -->
            <svg id="theme-icon-system" class="size-4 hidden" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
          </button>
        </div>
        <span id="theme-label" class="hidden"></span>
      </div>
    </div>
  </aside>
  <!-- ========== END SIDEBAR ========== -->

  <!-- Sidebar Backdrop (mobile) -->
  <div id="sidebar-backdrop" class="fixed inset-0 z-30 bg-black/50 dark:bg-gray-500/50 opacity-0 pointer-events-none lg:hidden" onclick="toggleSidebar()"></div>

  <!-- ========== MAIN CONTENT ========== -->
  <main id="main-content" class="lg:ps-60 pt-13 px-3 pb-3 transition-all duration-300">
    <div class="h-[calc(100dvh-62px)] overflow-hidden flex flex-col bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border shadow-xs rounded-lg">
      <div class="flex-1 overflow-y-auto p-3 sm:p-5">
        <!-- Dashboard View (default) -->
        <div id="view-dashboard" hx-get="/partials/dashboard-view" hx-trigger="load"></div>
        <!-- Spec View -->
        <div id="view-spec" class="hidden" hx-get="/partials/spec-view" hx-trigger="revealed"></div>
        <!-- Ticket View - full width -->
        <div id="view-ticket" class="hidden" hx-get="/partials/kanban-view" hx-trigger="revealed"></div>
        <!-- Knowledge View -->
        <div id="view-knowledge" class="hidden mx-auto" hx-get="/partials/knowledge-view" hx-trigger="revealed"></div>
        <!-- Knowledge Graph View -->
        <div id="view-graph" class="hidden" hx-get="/partials/graph-view" hx-trigger="intersect once"></div>
      </div>
    </div>
  </main>
  <!-- ========== END MAIN CONTENT ========== -->

  <!-- Search Modal -->
  <div id="search-modal" class="hidden fixed inset-0 bg-black/50 dark:bg-gray-500/50 flex items-start justify-center z-50 pt-[10vh]" onclick="if(event.target===this)hideSearchModal()">
    <div id="search-modal-content" class="bg-white dark:bg-dark-surface rounded-lg shadow-2xl w-full max-w-2xl overflow-auto m-4 max-h-[80vh]"
         hx-get="/partials/search-view" hx-trigger="load">
      <div class="flex justify-center items-center py-16"><div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>
    </div>
  </div>

  <!-- Modal (knowledge detail, tickets, specs — layers on top of search modal) -->
  <div id="modal" class="hidden fixed inset-0 bg-black/50 dark:bg-gray-500/50 flex items-center justify-center z-60" onclick="if(event.target===this)hideModal()">
    <div id="modal-content" class="modal-content bg-white dark:bg-dark-surface rounded-lg shadow-2xl w-full max-w-2xl overflow-auto m-4 max-h-[90vh]">
      <!-- Modal content loaded via HTMX -->
    </div>
  </div>

  <script>
    // Theme toggle: three-way cycle (system → light → dark → system)
    function cycleTheme() {
      var current = localStorage.getItem('theme');
      if (!current) {
        // system → light
        localStorage.setItem('theme', 'light');
      } else if (current === 'light') {
        // light → dark
        localStorage.setItem('theme', 'dark');
      } else {
        // dark → system
        localStorage.removeItem('theme');
      }
      applyTheme();
      updateThemeUI();
    }

    function applyTheme() {
      var t = localStorage.getItem('theme');
      if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    function updateThemeUI() {
      var t = localStorage.getItem('theme');
      var iconLight = document.getElementById('theme-icon-light');
      var iconDark = document.getElementById('theme-icon-dark');
      var iconSystem = document.getElementById('theme-icon-system');
      var label = document.getElementById('theme-label');
      iconLight.classList.add('hidden');
      iconDark.classList.add('hidden');
      iconSystem.classList.add('hidden');
      if (t === 'light') {
        iconLight.classList.remove('hidden');
        label.textContent = 'Light';
      } else if (t === 'dark') {
        iconDark.classList.remove('hidden');
        label.textContent = 'Dark';
      } else {
        iconSystem.classList.remove('hidden');
        label.textContent = 'System';
      }
    }

    // React to OS preference changes when in system mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (!localStorage.getItem('theme')) {
        applyTheme();
      }
    });

    // Initialize theme UI on load
    updateThemeUI();

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
        const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
        // Remove the injected <style> from initial load if present
        var injected = document.getElementById('sidebar-collapsed-style');
        if (injected) injected.remove();
        if (isCollapsed) {
          sidebar.style.transform = '';
          main.classList.add('lg:ps-60');
          localStorage.setItem('sidebar-collapsed', 'false');
        } else {
          sidebar.style.transform = 'translateX(-100%)';
          main.classList.remove('lg:ps-60');
          localStorage.setItem('sidebar-collapsed', 'true');
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
      ['dashboard', 'ticket', 'knowledge', 'spec', 'graph'].forEach(t => {
        document.getElementById('view-' + t).classList.toggle('hidden', t !== tab);
        document.getElementById('nav-' + t).classList.toggle('nav-active', t === tab);
      });
      // Update URL hash for refresh persistence
      if (updateHash) {
        history.replaceState(null, '', '#' + tab);
      }
      // Init graph when switching to graph tab (afterSettle won't fire if partial already loaded)
      if (tab === 'graph') {
        setTimeout(function() {
          if (typeof window._initGraph === 'function') window._initGraph();
        }, 50);
      }
      // Close sidebar on mobile after selection
      closeSidebarOnMobile();
    }

    // Restore tab from URL hash on page load
    (function() {
      const hash = window.location.hash.slice(1);
      if (['dashboard', 'ticket', 'knowledge', 'spec', 'graph'].includes(hash)) {
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
        writeTab.classList.add('border-blue-700', 'text-blue-700', 'dark:border-blue-400', 'dark:text-blue-400');
        writeTab.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
        previewTab.classList.remove('border-blue-700', 'text-blue-700', 'dark:border-blue-400', 'dark:text-blue-400');
        previewTab.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
      });

      previewTab.addEventListener('click', function() {
        textarea.classList.add('hidden');
        preview.classList.remove('hidden');
        previewTab.classList.add('border-blue-700', 'text-blue-700', 'dark:border-blue-400', 'dark:text-blue-400');
        previewTab.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
        writeTab.classList.remove('border-blue-700', 'text-blue-700', 'dark:border-blue-400', 'dark:text-blue-400');
        writeTab.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
        preview.innerHTML = textarea.value.trim()
          ? renderMarkdown(textarea.value)
          : '<p class="text-gray-400 dark:text-gray-500 italic">Nothing to preview</p>';
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

    // Export knowledge as Markdown file
    function exportKnowledgeAsMarkdown(id) {
      const dataEl = document.getElementById('knowledge-export-data');
      if (!dataEl) return;
      const k = JSON.parse(dataEl.textContent);
      const lines = [
        '# ' + k.title,
        '',
        '**ID:** ' + k.id,
        '**Namespace:** ' + k.namespace,
        '**Category:** ' + (k.category || 'N/A'),
        '**Source:** ' + k.source + (k.origin_ticket_type ? ' (' + k.origin_ticket_type + ')' : ''),
        '**Confidence:** ' + Math.round(k.confidence * 100) + '%',
        '**Scope:** ' + k.decision_scope,
        '**Status:** ' + (k.active ? 'Active' : 'Inactive'),
      ];
      if (k.author) lines.push('**Author:** ' + k.author);
      if (k.branch) lines.push('**Branch:** ' + k.branch);
      if (k.origin_ticket_id) lines.push('**Origin Ticket:** ' + k.origin_ticket_id);
      if (k.tags && k.tags.length) lines.push('**Tags:** ' + k.tags.join(', '));
      lines.push('', '---', '', k.content, '', '---', '', '*Created: ' + (k.created_at || 'N/A') + '*', '*Updated: ' + (k.updated_at || 'N/A') + '*');
      const blob = new Blob([lines.join('\\n')], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = k.id + '.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Export knowledge as PDF file
    function exportKnowledgeAsPDF(id) {
      const dataEl = document.getElementById('knowledge-export-data');
      if (!dataEl || typeof jspdf === 'undefined') return;
      const k = JSON.parse(dataEl.textContent);
      const { jsPDF } = jspdf;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      let y = 20;

      function checkPage(needed) {
        if (y + needed > doc.internal.pageSize.getHeight() - 15) {
          doc.addPage();
          y = 20;
        }
      }

      // Title
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      const titleLines = doc.splitTextToSize(k.title, maxWidth);
      checkPage(titleLines.length * 8);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 8 + 4;

      // Metadata
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100);
      const meta = [
        'ID: ' + k.id,
        'Category: ' + (k.category || 'N/A') + '  |  Confidence: ' + Math.round(k.confidence * 100) + '%  |  Scope: ' + k.decision_scope,
        'Source: ' + k.source + (k.origin_ticket_type ? ' (' + k.origin_ticket_type + ')' : '') + '  |  Status: ' + (k.active ? 'Active' : 'Inactive'),
        'Namespace: ' + k.namespace + (k.author ? '  |  Author: ' + k.author : '') + (k.branch ? '  |  Branch: ' + k.branch : ''),
      ];
      if (k.origin_ticket_id) meta.push('Origin Ticket: ' + k.origin_ticket_id);
      if (k.tags && k.tags.length) meta.push('Tags: ' + k.tags.join(', '));
      for (const line of meta) {
        checkPage(6);
        doc.text(line, margin, y);
        y += 5;
      }
      y += 4;

      // Separator
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Unicode replacements for jsPDF built-in fonts
      function sanitizePdf(text) {
        return text
          .replace(/\\u2192|\\u279c|\\u2794/g, '->')   // → arrows
          .replace(/\\u2190/g, '<-')                    // ←
          .replace(/\\u2194/g, '<->')                   // ↔
          .replace(/\\u2013/g, '--')                    // en dash
          .replace(/\\u2014/g, '---')                   // em dash
          .replace(/\\u2018|\\u2019/g, "'")             // smart quotes
          .replace(/\\u201c|\\u201d/g, '"')             // smart double quotes
          .replace(/\\u2026/g, '...')                   // ellipsis
          .replace(/\\u2022/g, '*')                     // bullet
          .replace(/\\u2713|\\u2714/g, '[x]')           // checkmarks
          .replace(/\\u2717|\\u2718/g, '[ ]')           // crosses
          .replace(/\\u00d7/g, 'x')                     // × multiplication sign
          .replace(/[^\\x00-\\x7F]/g, '?');             // fallback for remaining non-ASCII
      }

      // Render segments with inline bold and code on one line
      function renderSegments(doc, text, startX, y, mw) {
        var segRegex = /(\\*\\*(.+?)\\*\\*|\`([^\`]+)\`)/g;
        var segments = [];
        var last = 0;
        var m;
        while ((m = segRegex.exec(text)) !== null) {
          if (m.index > last) segments.push({ t: text.slice(last, m.index), s: 'n' });
          if (m[2]) segments.push({ t: m[2], s: 'b' });
          else if (m[3]) segments.push({ t: m[3], s: 'c' });
          last = m.index + m[0].length;
        }
        if (last < text.length) segments.push({ t: text.slice(last), s: 'n' });
        if (segments.length === 0) segments.push({ t: text, s: 'n' });

        var curX = startX;
        var lineH = 5.5;
        for (var si = 0; si < segments.length; si++) {
          var seg = segments[si];
          var st = sanitizePdf(seg.t);
          if (seg.s === 'b') {
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(11);
          } else if (seg.s === 'c') {
            doc.setFont('Courier', 'normal');
            doc.setFontSize(10);
          } else {
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(11);
          }
          var tw = doc.getTextWidth(st);
          if (curX + tw > startX + mw && curX > startX) {
            y += lineH;
            curX = startX;
            checkPage(lineH);
          }
          if (tw > mw) {
            var words = st.split(' ');
            for (var wi = 0; wi < words.length; wi++) {
              var word = (wi > 0 ? ' ' : '') + words[wi];
              var ww = doc.getTextWidth(word);
              if (curX + ww > startX + mw && curX > startX) {
                y += lineH;
                curX = startX;
                checkPage(lineH);
                word = words[wi];
              }
              doc.text(word, curX, y);
              curX += doc.getTextWidth(word);
            }
          } else {
            doc.text(st, curX, y);
            curX += tw;
          }
        }
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(11);
        return y;
      }

      // Content — parse markdown for code blocks, headings, inline bold/code
      doc.setTextColor(0);
      var inCodeBlock = false;
      var codeBlockPad = 3;
      var codeIndent = margin + codeBlockPad;
      var codeMaxWidth = maxWidth - codeBlockPad * 2;
      var rawLines = k.content.split('\\n');

      for (var li = 0; li < rawLines.length; li++) {
        var rawLine = rawLines[li];

        // Toggle fenced code blocks
        if (rawLine.trimStart().startsWith('\`\`\`')) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            y += 2;
          } else {
            inCodeBlock = false;
            y += 2;
          }
          continue;
        }

        if (inCodeBlock) {
          // Code block line: gray bg, monospace
          doc.setFont('Courier', 'normal');
          doc.setFontSize(9);
          var codeLine = sanitizePdf(rawLine || ' ');
          var codeWrapped = doc.splitTextToSize(codeLine, codeMaxWidth);
          var blockH = codeWrapped.length * 4.5;
          checkPage(blockH + 1);
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, y - 3.5, maxWidth, blockH + 2, 'F');
          doc.setTextColor(50);
          for (var ci = 0; ci < codeWrapped.length; ci++) {
            doc.text(codeWrapped[ci], codeIndent, y);
            y += 4.5;
          }
          doc.setTextColor(0);
        } else if (rawLine.trim() === '') {
          y += 3;
        } else {
          // Detect headings
          var headingMatch = rawLine.match(/^(#{1,3})\\s+(.*)/);
          if (headingMatch) {
            var level = headingMatch[1].length;
            var headingText = sanitizePdf(headingMatch[2]);
            y += 3;
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(level === 1 ? 15 : level === 2 ? 13 : 11.5);
            doc.setTextColor(0);
            var hLines = doc.splitTextToSize(headingText, maxWidth);
            checkPage(hLines.length * 6 + 2);
            doc.text(hLines, margin, y);
            y += hLines.length * 6 + 2;
            continue;
          }

          // Render line with inline bold/code segments
          checkPage(6);
          doc.setTextColor(0);
          y = renderSegments(doc, rawLine, margin, y, maxWidth);
          y += 5.5;
        }
      }

      // Footer
      y += 6;
      doc.setFontSize(8);
      doc.setTextColor(150);
      checkPage(10);
      doc.text('Created: ' + (k.created_at || 'N/A') + '  |  Updated: ' + (k.updated_at || 'N/A'), margin, y);

      doc.save(k.id + '.pdf');
    }

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

    // Init graph after HTMX swaps in graph partial
    document.body.addEventListener('htmx:afterSettle', function() {
      if (document.getElementById('graph-canvas') && typeof window._initGraph === 'function') {
        window._initGraph();
      }
    });

    // ============ Knowledge Graph ============
    ${getGraphScript()}

    // ============ SSE: Real-time updates ============
    (function() {
      var evtSource = null;

      function connectSSE() {
        evtSource = new EventSource('/api/events');

        evtSource.addEventListener('ticket-updated', function() {
          var el = document.getElementById('kanban-columns');
          if (el) htmx.trigger(el, 'refresh');
        });

        evtSource.addEventListener('knowledge-updated', function() {
          var el = document.getElementById('knowledge-list');
          if (el) htmx.trigger(el, 'refresh');
          if (typeof window._refreshGraph === 'function') window._refreshGraph();
        });

        evtSource.addEventListener('spec-updated', function() {
          var el = document.getElementById('spec-list');
          if (el) htmx.trigger(el, 'refresh');
        });

        evtSource.onerror = function() {
          // Browser auto-reconnects; no custom logic needed
        };
      }

      connectSSE();

      window.addEventListener('beforeunload', function() {
        if (evtSource) evtSource.close();
      });
    })();

  </script>
</body>
</html>`;
}

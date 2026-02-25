// Wiki UI components — pure functions returning HTML strings

import { escapeHtml } from './utils.js';
import type { ASTFileResult, ASTClass, ASTFunction, ASTImport, WikiScanResult } from '../../wiki/scanner.js';
import type { CoverageStats, CitationWithKnowledge } from '../../wiki/indexer.js';

// ============ Types ============

export interface WikiSearchHit {
  type: 'function' | 'class' | 'method' | 'file';
  name: string;
  filePath: string;
  line?: number;
  endLine?: number;
  detail?: string;
}

// ============ Main View Shell ============

export function renderWikiView(): string {
  return `
    <div class="flex gap-0 h-[calc(100dvh-120px)]">
      <!-- Sidebar: directory tree -->
      <div class="w-[280px] shrink-0 border-r border-gray-200 dark:border-dark-border overflow-y-auto">
        <div class="p-3">
          <!-- Code search -->
          <input type="text" id="wiki-code-search" placeholder="Search code elements..."
                 name="q"
                 hx-get="/partials/wiki-search-results"
                 hx-trigger="input changed delay:250ms"
                 hx-target="#wiki-search-results"
                 hx-swap="innerHTML"
                 class="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-dark-border rounded-md bg-white dark:bg-dark-surface text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2">
          <div id="wiki-search-results"></div>
          <hr class="border-gray-200 dark:border-dark-border my-2">
          <!-- File filter -->
          <input type="text" id="wiki-tree-search" placeholder="Filter files..."
                 class="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-dark-border rounded-md bg-white dark:bg-dark-surface text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2"
                 oninput="filterWikiTree(this.value)">
          <!-- Rescan button -->
          <button type="button"
                  hx-post="/api/wiki/rescan"
                  hx-target="#wiki-tree-container"
                  hx-swap="innerHTML"
                  hx-indicator="#wiki-rescan-spinner"
                  class="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-border rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover cursor-pointer mb-3">
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            <span>Rescan</span>
            <span id="wiki-rescan-spinner" class="htmx-indicator animate-spin size-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
          </button>
          <!-- Tree container -->
          <div id="wiki-tree-container"
               hx-get="/partials/wiki-tree"
               hx-trigger="load"
               hx-swap="innerHTML">
            <div class="flex justify-center py-8">
              <div class="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Content area -->
      <div id="wiki-content" class="flex-1 overflow-y-auto p-4"
           hx-get="/partials/wiki-overview"
           hx-trigger="load"
           hx-swap="innerHTML">
        <div class="flex justify-center py-16">
          <div class="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    </div>

    <script>
      function filterWikiTree(query) {
        var items = document.querySelectorAll('[data-wiki-path]');
        var dirs = document.querySelectorAll('[data-wiki-dir]');
        var q = query.toLowerCase();
        if (!q) {
          items.forEach(function(el) { el.style.display = ''; });
          dirs.forEach(function(el) { el.style.display = ''; });
          return;
        }
        items.forEach(function(el) {
          var path = (el.getAttribute('data-wiki-path') || '').toLowerCase();
          el.style.display = path.includes(q) ? '' : 'none';
        });
        dirs.forEach(function(el) {
          var dirPath = (el.getAttribute('data-wiki-dir') || '').toLowerCase();
          var children = el.querySelectorAll('[data-wiki-path]');
          var anyVisible = false;
          children.forEach(function(child) {
            if (child.style.display !== 'none') anyVisible = true;
          });
          el.style.display = (dirPath.includes(q) || anyVisible) ? '' : 'none';
          if (anyVisible || dirPath.includes(q)) {
            var details = el.querySelector('details');
            if (details) details.open = true;
          }
        });
      }

      function toggleWikiDir(el) {
        var details = el.closest('details');
        if (details) details.open = !details.open;
      }
    </script>
  `;
}

// ============ Directory Tree ============

interface DirNode {
  name: string;
  path: string;
  files: ASTFileResult[];
  children: Map<string, DirNode>;
}

function buildTree(files: ASTFileResult[]): DirNode {
  const root: DirNode = { name: '', path: '', files: [], children: new Map() };

  for (const file of files) {
    const parts = file.relativePath.split('/');
    let current = root;

    // Navigate to parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          files: [],
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }

    current.files.push(file);
  }

  return root;
}

function getLangIcon(lang: string): string {
  switch (lang) {
    case 'typescript': return '<span class="text-blue-500 dark:text-blue-400 font-mono text-[10px] font-bold">TS</span>';
    case 'tsx': return '<span class="text-blue-400 dark:text-blue-300 font-mono text-[10px] font-bold">TX</span>';
    case 'javascript': return '<span class="text-yellow-500 dark:text-yellow-400 font-mono text-[10px] font-bold">JS</span>';
    case 'jsx': return '<span class="text-yellow-400 dark:text-yellow-300 font-mono text-[10px] font-bold">JX</span>';
    case 'php': return '<span class="text-indigo-500 dark:text-indigo-400 font-mono text-[10px] font-bold">PH</span>';
    case 'go': return '<span class="text-teal-500 dark:text-teal-400 font-mono text-[10px] font-bold">GO</span>';
    default: return '';
  }
}

function renderDirNode(node: DirNode, depth: number): string {
  let html = '';

  // Sort children directories
  const sortedDirs = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
  // Sort files
  const sortedFiles = [...node.files].sort((a, b) => {
    const aName = a.relativePath.split('/').pop() || '';
    const bName = b.relativePath.split('/').pop() || '';
    return aName.localeCompare(bName);
  });

  // Render subdirectories
  for (const dir of sortedDirs) {
    const fileCount = countFiles(dir);
    html += `
      <div data-wiki-dir="${escapeHtml(dir.path)}">
        <details open>
          <summary class="flex items-center gap-1.5 py-1 px-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover rounded cursor-pointer select-none"
                   hx-get="/partials/wiki-dir/${encodeURIComponent(dir.path)}"
                   hx-target="#wiki-content"
                   hx-swap="innerHTML">
            <svg class="size-3.5 shrink-0 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
            </svg>
            <span class="truncate">${escapeHtml(dir.name)}</span>
            <span class="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">${fileCount}</span>
          </summary>
          <div class="pl-3 border-l border-gray-200 dark:border-dark-border ml-3">
            ${renderDirNode(dir, depth + 1)}
          </div>
        </details>
      </div>`;
  }

  // Render files
  for (const file of sortedFiles) {
    const fileName = file.relativePath.split('/').pop() || '';
    html += `
      <a data-wiki-path="${escapeHtml(file.relativePath)}"
         hx-get="/partials/wiki-file/${encodeURIComponent(file.relativePath)}"
         hx-target="#wiki-content"
         hx-swap="innerHTML"
         class="flex items-center gap-1.5 py-1 px-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded cursor-pointer truncate">
        ${getLangIcon(file.language)}
        <span class="truncate">${escapeHtml(fileName)}</span>
        <span class="text-[10px] text-gray-400 dark:text-gray-500 ml-auto shrink-0">${file.lines}L</span>
      </a>`;
  }

  return html;
}

function countFiles(node: DirNode): number {
  let count = node.files.length;
  for (const child of node.children.values()) {
    count += countFiles(child);
  }
  return count;
}

export function renderWikiTree(scan: WikiScanResult): string {
  if (scan.files.length === 0) {
    return '<p class="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No source files found.</p>';
  }

  const tree = buildTree(scan.files);
  return renderDirNode(tree, 0);
}

// ============ Overview Page ============

export function renderWikiOverview(scan: WikiScanResult, coverageStats?: CoverageStats): string {
  // Language breakdown
  const langCounts: Record<string, { files: number; lines: number }> = {};
  for (const file of scan.files) {
    if (!langCounts[file.language]) langCounts[file.language] = { files: 0, lines: 0 };
    langCounts[file.language].files++;
    langCounts[file.language].lines += file.lines;
  }

  const totalLines = scan.files.reduce((sum, f) => sum + f.lines, 0);
  const totalExports = scan.files.reduce((sum, f) =>
    sum + f.functions.filter(fn => fn.isExported).length + f.classes.filter(c => c.isExported).length, 0);

  // Top-level directories
  const topDirs = new Map<string, { files: number; lines: number }>();
  for (const file of scan.files) {
    const topDir = file.relativePath.split('/')[0] || file.relativePath;
    const isDir = file.relativePath.includes('/');
    if (isDir) {
      if (!topDirs.has(topDir)) topDirs.set(topDir, { files: 0, lines: 0 });
      topDirs.get(topDir)!.files++;
      topDirs.get(topDir)!.lines += file.lines;
    }
  }

  const langColors: Record<string, string> = {
    typescript: 'blue',
    tsx: 'cyan',
    javascript: 'yellow',
    jsx: 'orange',
    php: 'indigo',
    go: 'teal',
  };

  return `
    <div>
      <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">Wiki</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">Codebase overview &middot; Scanned ${escapeHtml(new Date(scan.scannedAt).toLocaleString())}</p>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${renderStatCard('Files', String(scan.totalFiles), 'blue')}
        ${renderStatCard('Functions', String(scan.totalFunctions), 'green')}
        ${renderStatCard('Classes', String(scan.totalClasses), 'purple')}
        ${renderStatCard('Lines', totalLines.toLocaleString(), 'gray')}
      </div>

      ${coverageStats ? `
      <!-- Knowledge Coverage -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Knowledge Coverage</h2>
        <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-md">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-600 dark:text-gray-300">${coverageStats.coveredElements} / ${coverageStats.totalElements} code elements linked to knowledge</span>
            <span class="text-sm font-bold text-${coverageStats.coveragePercent >= 50 ? 'green' : coverageStats.coveragePercent >= 20 ? 'yellow' : 'red'}-600 dark:text-${coverageStats.coveragePercent >= 50 ? 'green' : coverageStats.coveragePercent >= 20 ? 'yellow' : 'red'}-400">${coverageStats.coveragePercent}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div class="bg-${coverageStats.coveragePercent >= 50 ? 'green' : coverageStats.coveragePercent >= 20 ? 'yellow' : 'red'}-500 h-2 rounded-full transition-all" style="width: ${coverageStats.coveragePercent}%"></div>
          </div>
          <div class="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>${coverageStats.coveredFiles} / ${coverageStats.totalFiles} files covered</span>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Language Breakdown -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Languages</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${Object.entries(langCounts).sort((a, b) => b[1].files - a[1].files).map(([lang, data]) => {
            const color = langColors[lang] || 'gray';
            const pct = scan.totalFiles > 0 ? Math.round(data.files / scan.totalFiles * 100) : 0;
            return `
              <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
                ${getLangIcon(lang)}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-200 capitalize">${escapeHtml(lang)}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">${data.files} files &middot; ${data.lines.toLocaleString()} lines</span>
                  </div>
                  <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div class="bg-${color}-500 h-1.5 rounded-full" style="width: ${pct}%"></div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Top Directories -->
      ${topDirs.size > 0 ? `
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Directories</h2>
          <div class="space-y-1">
            ${Array.from(topDirs.entries()).sort((a, b) => b[1].files - a[1].files).map(([dir, data]) => `
              <a hx-get="/partials/wiki-dir/${encodeURIComponent(dir)}"
                 hx-target="#wiki-content"
                 hx-swap="innerHTML"
                 class="flex items-center justify-between p-2.5 hover:bg-gray-50 dark:hover:bg-dark-hover rounded-md cursor-pointer group">
                <div class="flex items-center gap-2">
                  <svg class="size-4 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
                  </svg>
                  <span class="text-sm text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">${escapeHtml(dir)}/</span>
                </div>
                <span class="text-xs text-gray-400 dark:text-gray-500">${data.files} files &middot; ${data.lines.toLocaleString()} lines</span>
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Exports Summary -->
      <div class="text-xs text-gray-400 dark:text-gray-500 mt-4">
        ${totalExports} exported symbols &middot; ${scan.totalFunctions} total functions &middot; ${scan.totalClasses} total classes
      </div>
    </div>
  `;
}

function renderStatCard(label: string, value: string, color: string): string {
  return `
    <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
      <div class="text-2xl font-bold text-${color}-600 dark:text-${color}-400">${value}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${label}</div>
    </div>`;
}

// ============ Directory Page ============

export function renderWikiDirectory(dirPath: string, files: ASTFileResult[], subdirs: string[]): string {
  return `
    <div>
      <!-- Breadcrumb -->
      ${renderBreadcrumb(dirPath)}

      <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">${escapeHtml(dirPath)}/</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">${files.length} file${files.length !== 1 ? 's' : ''}${subdirs.length > 0 ? ` &middot; ${subdirs.length} subdirector${subdirs.length !== 1 ? 'ies' : 'y'}` : ''}</p>

      <!-- Subdirectories -->
      ${subdirs.length > 0 ? `
        <div class="mb-4">
          <div class="space-y-1">
            ${subdirs.sort().map(sub => `
              <a hx-get="/partials/wiki-dir/${encodeURIComponent(dirPath + '/' + sub)}"
                 hx-target="#wiki-content"
                 hx-swap="innerHTML"
                 class="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-dark-hover rounded-md cursor-pointer">
                <svg class="size-4 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
                </svg>
                <span class="text-sm text-gray-700 dark:text-gray-200">${escapeHtml(sub)}/</span>
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Files Table -->
      ${files.length > 0 ? `
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-dark-border">
              <th class="pb-2 font-medium">File</th>
              <th class="pb-2 font-medium text-right">Lines</th>
              <th class="pb-2 font-medium text-right">Functions</th>
              <th class="pb-2 font-medium text-right">Classes</th>
              <th class="pb-2 font-medium text-right">Imports</th>
            </tr>
          </thead>
          <tbody>
            ${files.sort((a, b) => {
              const aName = a.relativePath.split('/').pop() || '';
              const bName = b.relativePath.split('/').pop() || '';
              return aName.localeCompare(bName);
            }).map(file => {
              const fileName = file.relativePath.split('/').pop() || '';
              return `
                <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
                    hx-get="/partials/wiki-file/${encodeURIComponent(file.relativePath)}"
                    hx-target="#wiki-content"
                    hx-swap="innerHTML">
                  <td class="py-2 flex items-center gap-2">
                    ${getLangIcon(file.language)}
                    <span class="text-gray-700 dark:text-gray-200">${escapeHtml(fileName)}</span>
                  </td>
                  <td class="py-2 text-right text-gray-500 dark:text-gray-400">${file.lines}</td>
                  <td class="py-2 text-right text-gray-500 dark:text-gray-400">${file.functions.length}</td>
                  <td class="py-2 text-right text-gray-500 dark:text-gray-400">${file.classes.length}</td>
                  <td class="py-2 text-right text-gray-500 dark:text-gray-400">${file.imports.length}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : '<p class="text-sm text-gray-400 dark:text-gray-500">No files in this directory.</p>'}
    </div>
  `;
}

// ============ File Page ============

export function renderWikiFile(file: ASTFileResult, citations?: CitationWithKnowledge[]): string {
  const fileName = file.relativePath.split('/').pop() || '';

  // Build lookup: function_name → citations for that function
  const citationsByFn = new Map<string, CitationWithKnowledge[]>();
  if (citations) {
    for (const c of citations) {
      const list = citationsByFn.get(c.function_name) || [];
      list.push(c);
      citationsByFn.set(c.function_name, list);
    }
  }

  return `
    <div>
      <!-- Breadcrumb -->
      ${renderBreadcrumb(file.relativePath)}

      <!-- File Header -->
      <div class="flex items-center gap-2 mb-1">
        ${getLangIcon(file.language)}
        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100">${escapeHtml(fileName)}</h1>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">
        ${file.lines} lines &middot; ${file.language} &middot; ${file.relativePath}
      </p>

      <!-- Metadata -->
      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-md text-center">
          <div class="text-lg font-bold text-green-600 dark:text-green-400">${file.functions.length}</div>
          <div class="text-[10px] text-gray-500 dark:text-gray-400">Functions</div>
        </div>
        <div class="p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-md text-center">
          <div class="text-lg font-bold text-purple-600 dark:text-purple-400">${file.classes.length}</div>
          <div class="text-[10px] text-gray-500 dark:text-gray-400">Classes</div>
        </div>
        <div class="p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-md text-center">
          <div class="text-lg font-bold text-blue-600 dark:text-blue-400">${file.imports.length}</div>
          <div class="text-[10px] text-gray-500 dark:text-gray-400">Imports</div>
        </div>
      </div>

      <!-- Imports -->
      ${file.imports.length > 0 ? `
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Imports</h2>
          <div class="space-y-1">
            ${file.imports.map(imp => `
              <div class="flex items-start gap-2 py-1.5 px-2.5 text-sm rounded-md bg-gray-50 dark:bg-gray-800/50">
                <span class="text-gray-400 dark:text-gray-500 shrink-0 text-xs mt-0.5">L${imp.line}</span>
                ${imp.isTypeOnly ? '<span class="text-[10px] px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded shrink-0">type</span>' : ''}
                <code class="text-gray-700 dark:text-gray-200 text-xs break-all">${imp.specifiers.length > 0 ? escapeHtml(imp.specifiers.join(', ')) : '*'}</code>
                <span class="text-gray-400 dark:text-gray-500 text-xs">from</span>
                <code class="text-blue-600 dark:text-blue-400 text-xs break-all">${escapeHtml(imp.source)}</code>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Classes -->
      ${file.classes.length > 0 ? `
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Classes</h2>
          <div class="space-y-3">
            ${file.classes.map(cls => renderClassDetail(cls, citationsByFn)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Functions -->
      ${file.functions.length > 0 ? `
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Functions</h2>
          ${renderFunctionsTable(file.functions, citationsByFn)}
        </div>
      ` : ''}

      <!-- Linked Knowledge -->
      ${citations && citations.length > 0 ? renderLinkedKnowledge(citations) : ''}
    </div>
  `;
}

function renderClassDetail(cls: ASTClass, citationsByFn?: Map<string, CitationWithKnowledge[]>): string {
  const classCitations = citationsByFn?.get(cls.name);
  return `
    <div class="border border-gray-200 dark:border-dark-border rounded-md overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-gray-200 dark:border-dark-border">
        ${cls.isExported ? '<span class="text-[10px] px-1 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">export</span>' : ''}
        <span class="text-[10px] px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">class</span>
        <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">${escapeHtml(cls.name)}</span>
        ${classCitations ? `<span class="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded" title="${classCitations.length} linked knowledge">${classCitations.length} linked</span>` : ''}
        <span class="text-xs text-gray-400 dark:text-gray-500 ml-auto">L${cls.line}-${cls.endLine}</span>
      </div>
      ${cls.methods.length > 0 ? `
        <div class="px-3 py-2">
          ${renderFunctionsTable(cls.methods, citationsByFn)}
        </div>
      ` : '<div class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No methods</div>'}
    </div>
  `;
}

function renderFunctionsTable(functions: ASTFunction[], citationsByFn?: Map<string, CitationWithKnowledge[]>): string {
  return `
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-dark-border">
          <th class="pb-1.5 font-medium">Name</th>
          <th class="pb-1.5 font-medium">Parameters</th>
          <th class="pb-1.5 font-medium text-right">Lines</th>
        </tr>
      </thead>
      <tbody>
        ${functions.map(fn => {
          const badges: string[] = [];
          if (fn.isExported) badges.push('<span class="text-[10px] px-1 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">export</span>');
          if (fn.isAsync) badges.push('<span class="text-[10px] px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded">async</span>');
          if (fn.kind === 'arrow') badges.push('<span class="text-[10px] px-1 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">=&gt;</span>');
          const fnCitations = citationsByFn?.get(fn.name);
          if (fnCitations) badges.push(`<span class="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded" title="${fnCitations.length} linked knowledge">${fnCitations.length} linked</span>`);

          return `
            <tr class="border-b border-gray-100 dark:border-gray-800 last:border-0">
              <td class="py-1.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <code class="text-sm font-medium text-gray-800 dark:text-gray-100">${escapeHtml(fn.name)}</code>
                  ${badges.join('')}
                </div>
              </td>
              <td class="py-1.5 text-xs text-gray-500 dark:text-gray-400">
                ${fn.params.length > 0 ? escapeHtml(fn.params.join(', ')) : '<span class="text-gray-300 dark:text-gray-600">none</span>'}
              </td>
              <td class="py-1.5 text-right text-xs text-gray-400 dark:text-gray-500">
                L${fn.line}-${fn.endLine}
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ============ Linked Knowledge Section ============

function categoryBadge(category: string): string {
  const colors: Record<string, string> = { pattern: 'purple', truth: 'green', principle: 'orange', architecture: 'blue', gotcha: 'red' };
  const c = colors[category] || 'gray';
  return `<span class="text-[10px] px-1.5 py-0.5 bg-${c}-100 dark:bg-${c}-900/30 text-${c}-600 dark:text-${c}-400 rounded">${escapeHtml(category)}</span>`;
}

function matchTypeBadge(matchType: string): string {
  switch (matchType) {
    case 'tag': return '<span class="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">tag</span>';
    case 'content': return '<span class="text-[10px] px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded">content</span>';
    case 'vector': return '<span class="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">vector</span>';
    default: return '';
  }
}

function renderLinkedKnowledge(citations: CitationWithKnowledge[]): string {
  return `
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Linked Knowledge</h2>
      <div class="space-y-1.5">
        ${citations.map(c => `
          <div class="flex items-center gap-2 py-2 px-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
            <div class="flex-1 min-w-0">
              <a hx-get="/partials/knowledge-modal/${encodeURIComponent(c.knowledge_id)}"
                 hx-target="#modal-content"
                 hx-trigger="click"
                 onclick="showModal()"
                 class="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer truncate block">${escapeHtml(c.knowledge_title)}</a>
              <div class="flex items-center gap-2 mt-0.5">
                ${matchTypeBadge(c.match_type)}
                ${c.knowledge_category ? categoryBadge(c.knowledge_category) : ''}
                ${c.knowledge_confidence != null ? `<span class="text-[10px] text-gray-400 dark:text-gray-500">${Math.round(c.knowledge_confidence * 100)}%</span>` : ''}
                <span class="text-[10px] text-gray-400 dark:text-gray-500">${escapeHtml(c.function_name)} (L${c.start_line}-${c.end_line})</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============ Breadcrumb ============

function renderBreadcrumb(path: string): string {
  const parts = path.split('/');
  let html = `
    <nav class="flex items-center gap-1 text-sm mb-3">
      <a hx-get="/partials/wiki-overview"
         hx-target="#wiki-content"
         hx-swap="innerHTML"
         class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">wiki</a>`;

  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const partPath = parts.slice(0, i + 1).join('/');

    html += '<span class="text-gray-400 dark:text-gray-500">/</span>';

    if (isLast) {
      html += `<span class="text-gray-700 dark:text-gray-200">${escapeHtml(parts[i])}</span>`;
    } else {
      html += `<a hx-get="/partials/wiki-dir/${encodeURIComponent(partPath)}"
                  hx-target="#wiki-content"
                  hx-swap="innerHTML"
                  class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">${escapeHtml(parts[i])}</a>`;
    }
  }

  html += '</nav>';
  return html;
}

// ============ Code Search Results ============

function searchTypeIcon(type: WikiSearchHit['type']): string {
  switch (type) {
    case 'function':
      return '<svg class="size-3.5 shrink-0 text-green-500 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 8-4 4 4 4"/><path d="m17 8 4 4-4 4"/><path d="m14 4-4 16"/></svg>';
    case 'class':
      return '<svg class="size-3.5 shrink-0 text-purple-500 dark:text-purple-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>';
    case 'method':
      return '<svg class="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/></svg>';
    case 'file':
      return '<svg class="size-3.5 shrink-0 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';
  }
}

export function renderWikiSearchResults(hits: WikiSearchHit[]): string {
  if (hits.length === 0) {
    return '<p class="text-xs text-gray-400 dark:text-gray-500 text-center py-2">No results found.</p>';
  }

  return `
    <div class="space-y-0.5 max-h-[300px] overflow-y-auto">
      ${hits.map(hit => {
        const lineInfo = hit.line ? `L${hit.line}${hit.endLine ? '-' + hit.endLine : ''}` : '';
        return `
          <a hx-get="/partials/wiki-file/${encodeURIComponent(hit.filePath)}"
             hx-target="#wiki-content"
             hx-swap="innerHTML"
             class="flex items-start gap-2 py-1.5 px-2 hover:bg-gray-100 dark:hover:bg-dark-hover rounded cursor-pointer group">
            ${searchTypeIcon(hit.type)}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">${escapeHtml(hit.name)}</span>
                <span class="text-[10px] px-1 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">${hit.type}</span>
              </div>
              <div class="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 truncate">
                <span class="truncate">${escapeHtml(hit.filePath)}</span>
                ${lineInfo ? `<span>${lineInfo}</span>` : ''}
              </div>
              ${hit.detail ? `<div class="text-[10px] text-gray-400 dark:text-gray-500 truncate">${escapeHtml(hit.detail)}</div>` : ''}
            </div>
          </a>`;
      }).join('')}
    </div>`;
}

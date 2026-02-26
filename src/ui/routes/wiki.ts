import type { Hono } from 'hono';
import { getClient } from '../../db/client.js';
import { scanProject } from '../../wiki/scanner.js';
import { scanCache } from '../../wiki/cache.js';
import { indexProject, indexProjectIncremental, getCoverageStats, getCitationsForFile } from '../../wiki/indexer.js';
import type { WikiSearchHit } from '../components/index.js';
import {
  renderWikiView,
  renderWikiTree,
  renderWikiOverview,
  renderWikiDirectory,
  renderWikiFile,
  renderWikiSearchResults,
} from '../components/index.js';

export function registerWikiRoutes(app: Hono) {

  // ── Partial Routes ──────────────────────────────────────────────

  // Wiki view shell
  app.get('/partials/wiki-view', (c) => {
    return c.html(renderWikiView());
  });

  // Wiki tree (sidebar directory listing)
  app.get('/partials/wiki-tree', async (c) => {
    try {
      const scan = await scanProject(process.cwd());
      return c.html(renderWikiTree(scan));
    } catch (error) {
      return c.html(`<div class="text-red-500 text-sm p-2">Error: ${(error as Error).message}</div>`);
    }
  });

  // Wiki overview (landing page)
  app.get('/partials/wiki-overview', async (c) => {
    try {
      const scan = await scanProject(process.cwd());
      const client = await getClient();
      let coverageStats;
      try {
        coverageStats = await getCoverageStats(client);
      } catch {
        // No coverage data yet — render without it
      }
      return c.html(renderWikiOverview(scan, coverageStats));
    } catch (error) {
      return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
    }
  });

  // Wiki directory view
  app.get('/partials/wiki-dir/:path{.+}', async (c) => {
    try {
      const dirPath = c.req.param('path');
      const scan = await scanProject(process.cwd());
      const files = scan.files.filter(f => {
        const fileDirParts = f.relativePath.split('/');
        fileDirParts.pop(); // Remove filename
        const fileDir = fileDirParts.join('/');
        return fileDir === dirPath;
      });

      // Find immediate subdirectories
      const subdirSet = new Set<string>();
      const prefix = dirPath + '/';
      for (const file of scan.files) {
        if (file.relativePath.startsWith(prefix)) {
          const rest = file.relativePath.slice(prefix.length);
          const slashIdx = rest.indexOf('/');
          if (slashIdx !== -1) {
            subdirSet.add(rest.substring(0, slashIdx));
          }
        }
      }

      return c.html(renderWikiDirectory(dirPath, files, Array.from(subdirSet)));
    } catch (error) {
      return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
    }
  });

  // Wiki file view
  app.get('/partials/wiki-file/:path{.+}', async (c) => {
    try {
      const filePath = c.req.param('path');
      const scan = await scanProject(process.cwd());
      const file = scan.files.find(f => f.relativePath === filePath);

      if (!file) {
        return c.html('<div class="text-red-500 p-4">File not found</div>');
      }

      const client = await getClient();
      let citations;
      try {
        citations = await getCitationsForFile(client, filePath);
      } catch {
        // No citations data yet
      }

      return c.html(renderWikiFile(file, citations));
    } catch (error) {
      return c.html(`<div class="text-red-500 p-4">Error: ${(error as Error).message}</div>`);
    }
  });

  // Wiki code element search
  app.get('/partials/wiki-search-results', async (c) => {
    try {
      const q = (c.req.query('q') || '').trim().toLowerCase();
      if (!q) return c.html('');

      const scan = await scanProject(process.cwd());
      const hits: WikiSearchHit[] = [];
      const MAX_RESULTS = 30;

      for (const file of scan.files) {
        if (hits.length >= MAX_RESULTS) break;

        // Match file path
        if (file.relativePath.toLowerCase().includes(q)) {
          hits.push({
            type: 'file',
            name: file.relativePath.split('/').pop() || file.relativePath,
            filePath: file.relativePath,
          });
        }

        // Match functions
        for (const fn of file.functions) {
          if (hits.length >= MAX_RESULTS) break;
          if (fn.name.toLowerCase().includes(q)) {
            hits.push({
              type: 'function',
              name: fn.name,
              filePath: file.relativePath,
              line: fn.line,
              endLine: fn.endLine,
              detail: fn.params.length > 0 ? `(${fn.params.join(', ')})` : undefined,
            });
          }
        }

        // Match classes and their methods
        for (const cls of file.classes) {
          if (hits.length >= MAX_RESULTS) break;
          if (cls.name.toLowerCase().includes(q)) {
            hits.push({
              type: 'class',
              name: cls.name,
              filePath: file.relativePath,
              line: cls.line,
              endLine: cls.endLine,
              detail: `${cls.methods.length} method${cls.methods.length !== 1 ? 's' : ''}`,
            });
          }
          for (const method of cls.methods) {
            if (hits.length >= MAX_RESULTS) break;
            if (method.name.toLowerCase().includes(q)) {
              hits.push({
                type: 'method',
                name: `${cls.name}.${method.name}`,
                filePath: file.relativePath,
                line: method.line,
                endLine: method.endLine,
                detail: method.params.length > 0 ? `(${method.params.join(', ')})` : undefined,
              });
            }
          }
        }
      }

      return c.html(renderWikiSearchResults(hits));
    } catch (error) {
      return c.html(`<p class="text-xs text-red-400 py-2">Search error: ${(error as Error).message}</p>`);
    }
  });

  // ── API Routes ──────────────────────────────────────────────────

  // Wiki rescan (scan + index in one go)
  app.post('/api/wiki/rescan', async (c) => {
    try {
      scanCache.invalidateAll();
      const scan = await scanProject(process.cwd());
      // Also trigger incremental indexing in background
      const client = await getClient();
      indexProjectIncremental(client).catch(() => {});
      return c.html(renderWikiTree(scan));
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // Wiki coverage stats
  app.get('/api/wiki/coverage', async (c) => {
    try {
      const client = await getClient();
      const stats = await getCoverageStats(client);
      return c.json(stats);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // Wiki citations for a file
  app.get('/api/wiki/citations/:path{.+}', async (c) => {
    try {
      const filePath = c.req.param('path');
      const client = await getClient();
      const citations = await getCitationsForFile(client, filePath);
      return c.json(citations);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // Wiki index (defaults to incremental; ?full=true forces full re-index)
  app.post('/api/wiki/index', async (c) => {
    try {
      const full = c.req.query('full') === 'true';
      const client = await getClient();
      const stats = full
        ? await indexProject(client)
        : await indexProjectIncremental(client);
      c.header('HX-Trigger', 'refresh');
      return c.json(stats);
    } catch (error) {
      c.header('HX-Trigger', 'refresh');
      return c.json({ error: (error as Error).message }, 500);
    }
  });
}

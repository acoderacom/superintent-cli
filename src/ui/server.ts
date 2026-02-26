import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getHtml } from './components/index.js';
import { createSSEStream } from './sse.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerSpecRoutes } from './routes/specs.js';
import { registerCommentRoutes } from './routes/comments.js';
import { registerWikiRoutes } from './routes/wiki.js';
import { registerDashboardRoutes } from './routes/dashboard.js';

export function createApp(namespace: string): { app: Hono; version: string } {
  const app = new Hono();

  // ── Static Assets ─────────────────────────────────────────────
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
  const version = packageJson.version;
  const cssPath = join(packageRoot, 'dist', 'ui', 'styles.css');
  let cssContent: string;
  try {
    cssContent = readFileSync(cssPath, 'utf-8');
  } catch {
    cssContent = '/* Tailwind CSS not built. Run: npm run build:css */';
  }

  app.get('/styles.css', (c) => {
    c.header('Content-Type', 'text/css');
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(cssContent);
  });

  app.get('/favicon.svg', (c) => {
    c.header('Content-Type', 'image/svg+xml');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(`<svg viewBox="0 0 222 200" xmlns="http://www.w3.org/2000/svg"><path d="M172.213 0C199.671 0 222 22.3653 222 50C222 77.576 199.672 99.9998 172.155 100H221.941V200H49.7871C22.3286 200 0 177.635 0 150C9.4336e-05 122.424 22.2704 100 49.7871 100H0V0H172.213ZM93.2451 82.5127L61.2129 100.104L93.2451 117.722L110.767 149.883L128.288 117.722L160.32 100.104L128.288 82.5127L110.767 50.3516L93.2451 82.5127Z" fill="#2563EB"/></svg>`);
  });

  // ── Health Check ──────────────────────────────────────────────
  const startTime = Date.now();
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      version,
      timestamp: new Date().toISOString(),
    });
  });

  // ── SSE Endpoint ──────────────────────────────────────────────
  app.get('/api/events', () => {
    const stream = createSSEStream();
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });

  // ── Main HTML Shell ───────────────────────────────────────────
  app.get('/', (c) => c.html(getHtml(namespace, version)));

  // ── Domain Routes ─────────────────────────────────────────────
  registerTicketRoutes(app);
  registerKnowledgeRoutes(app);
  registerSpecRoutes(app);
  registerCommentRoutes(app);
  registerWikiRoutes(app);
  registerDashboardRoutes(app);

  return { app, version };
}

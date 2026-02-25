import { EventEmitter } from 'node:events';
import type { Client } from '@libsql/client';

export type SSEEventType = 'ticket-updated' | 'knowledge-updated' | 'spec-updated' | 'wiki-updated';

interface SSEClient {
  id: number;
  controller: ReadableStreamDefaultController;
  handler?: (type: SSEEventType) => void;
  keepAlive?: NodeJS.Timeout;
}

let clientIdCounter = 0;
const clients: SSEClient[] = [];
const eventBus = new EventEmitter();

// Debounce: batch rapid events into single notifications per type
const pendingEvents = new Map<SSEEventType, NodeJS.Timeout>();
const DEBOUNCE_MS = 100;

export function emitSSE(type: SSEEventType): void {
  const existing = pendingEvents.get(type);
  if (existing) clearTimeout(existing);

  pendingEvents.set(type, setTimeout(() => {
    pendingEvents.delete(type);
    eventBus.emit('sse', type);
  }, DEBOUNCE_MS));
}

export function createSSEStream(): ReadableStream {
  let client: SSEClient;

  return new ReadableStream({
    start(controller) {
      client = { id: ++clientIdCounter, controller };
      clients.push(client);

      // Send initial connection event
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));

      // Listen for events
      const handler = (type: SSEEventType) => {
        try {
          controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: {}\n\n`));
        } catch {
          removeClient(client.id);
        }
      };

      eventBus.on('sse', handler);

      // Keep-alive every 30s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepAlive);
          removeClient(client.id);
        }
      }, 30000);

      client.handler = handler;
      client.keepAlive = keepAlive;
    },
    cancel() {
      if (client) removeClient(client.id);
    },
  });
}

function removeClient(id: number): void {
  const index = clients.findIndex(c => c.id === id);
  if (index === -1) return;

  const client = clients[index];
  if (client.handler) eventBus.off('sse', client.handler);
  if (client.keepAlive) clearInterval(client.keepAlive);
  clients.splice(index, 1);
}

// ============ DB CHANGE WATCHER ============
// Polls max(updated_at) per table to detect external changes (CLI, other clients).
// Only emits SSE when timestamps actually change — no unnecessary UI refreshes.

const POLL_INTERVAL_MS = 2000;
let pollTimer: NodeJS.Timeout | null = null;
const lastSeen: Record<string, string> = {};
let firstPoll = true;

const tableToEvent: Record<string, SSEEventType> = {
  tickets: 'ticket-updated',
  knowledge: 'knowledge-updated',
  specs: 'spec-updated',
  wiki_pages: 'wiki-updated',
  wiki_citations: 'wiki-updated',
};

export function startChangeWatcher(client: Client): void {
  if (pollTimer) return;

  pollTimer = setInterval(async () => {
    if (clients.length === 0) return; // No connected browsers, skip

    try {
      // Track both updated_at AND count to catch active/deactivate/delete changes
      const result = await client.execute({
        sql: `SELECT
          (SELECT MAX(updated_at) || '|' || COUNT(*) FROM tickets) AS tickets,
          (SELECT MAX(updated_at) || '|' || COUNT(*) || '|' || SUM(active) FROM knowledge) AS knowledge,
          (SELECT MAX(updated_at) || '|' || COUNT(*) FROM specs) AS specs,
          (SELECT MAX(updated_at) || '|' || COUNT(*) FROM comments) AS comments,
          (SELECT MAX(updated_at) || '|' || COUNT(*) FROM wiki_pages) AS wiki_pages,
          (SELECT MAX(created_at) || '|' || COUNT(*) FROM wiki_citations) AS wiki_citations`,
        args: [],
      });

      const row = result.rows[0] as Record<string, unknown>;

      for (const table of ['tickets', 'knowledge', 'specs', 'comments', 'wiki_pages', 'wiki_citations']) {
        const current = (row[table] as string) || '';
        if (firstPoll) {
          lastSeen[table] = current;
        } else if (current !== lastSeen[table]) {
          lastSeen[table] = current;
          if (table === 'comments') {
            emitSSE('ticket-updated');
            emitSSE('knowledge-updated');
            emitSSE('spec-updated');
          } else {
            emitSSE(tableToEvent[table]);
          }
        }
      }
      firstPoll = false;
    } catch {
      // DB might be temporarily locked; skip this cycle
    }
  }, POLL_INTERVAL_MS);
}

export function closeAllSSEClients(): void {
  // Stop DB change watcher
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Clear any pending debounced events
  for (const timeout of pendingEvents.values()) clearTimeout(timeout);
  pendingEvents.clear();

  // Close all connected clients
  for (const client of [...clients]) {
    if (client.handler) eventBus.off('sse', client.handler);
    if (client.keepAlive) clearInterval(client.keepAlive);
    try {
      client.controller.close();
    } catch {
      // Already closed
    }
  }
  clients.length = 0;
  eventBus.removeAllListeners();
}

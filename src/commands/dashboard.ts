import type http from 'node:http';
import { Command } from 'commander';
import { serve } from '@hono/node-server';
import open from 'open';
import { getClient, closeClient } from '../db/client.js';
import { loadConfig, getProjectNamespace } from '../utils/config.js';
import { disposeEmbedder } from '../embed/model.js';
import { closeAllSSEClients, startChangeWatcher } from '../ui/sse.js';
import { createApp } from '../ui/server.js';

export const dashboardCommand = new Command('dashboard')
  .aliases(['dash'])
  .description('Start the Superintent dashboard')
  .option('-p, --port <port>', 'Server port', '3456')
  .option('-o, --open', 'Auto-open browser')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const namespace = getProjectNamespace();
    const { app, version } = createApp(namespace);

    const config = loadConfig();
    const isLocal = config.url.startsWith('file:');
    const dbMode = isLocal ? 'Local' : 'Cloud';

    const banner = `
  \x1b[38;2;37;99;235m░█▀▀░█░█░█▀█░█▀▀░█▀▄░▀█▀░█▀█░▀█▀░█▀▀░█▀█░▀█▀░
  ░▀▀█░█░█░█▀▀░█▀▀░█▀▄░░█░░█░█░░█░░█▀▀░█░█░░█░░
  ░▀▀▀░▀▀▀░▀░░░▀▀▀░▀░▀░▀▀▀░▀░▀░░▀░░▀▀▀░▀░▀░░▀░░\x1b[0m

  \x1b[1mSuperintent\x1b[0m \x1b[90mv${version}\x1b[0m

  \x1b[38;2;79;248;210m*\x1b[0m Ready at \x1b[1mhttp://localhost:${port}\x1b[0m
  \x1b[90m>\x1b[0m Using \x1b[38;2;79;248;210mTurso ${dbMode}\x1b[0m

  \x1b[90mPress Ctrl+C to stop\x1b[0m
`;
    console.log(banner);

    const server = serve({
      fetch: app.fetch,
      port,
      hostname: '127.0.0.1',
    });

    // Start DB change watcher for external mutations (CLI, other clients)
    getClient().then(client => startChangeWatcher(client));

    if (options.open) {
      setTimeout(() => {
        open(`http://localhost:${port}`);
      }, 500);
    }

    // Handle graceful shutdown — release all handles so the event loop drains naturally.
    // NEVER call process.exit() here: onnxruntime-node has a global C++ thread pool
    // that holds mutexes. Forceful exit kills those threads mid-lock, causing:
    //   "libc++abi: terminating due to uncaught exception of type std::__1::system_error: mutex lock failed"
    // Instead, close all JS-side handles and let Node.js exit on its own.
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\n\x1b[90m  See ya!\x1b[0m\n');
      closeAllSSEClients();
      // closeAllConnections forces immediate shutdown instead of waiting for drain
      if ('closeAllConnections' in server) {
        (server as http.Server).closeAllConnections();
      }
      server.close();
      disposeEmbedder().then(() => closeClient());
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

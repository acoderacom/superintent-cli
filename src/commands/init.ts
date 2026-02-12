import { Command } from 'commander';
import { createClientWithConfig } from '../db/client.js';
import { initSchema } from '../db/init-schema.js';
import { saveConfig, loadConfig } from '../utils/config.js';
import type { CliResponse } from '../types.js';

export const initCommand = new Command('init')
  .description('Create database tables (reads credentials from .superintent/.env)')
  .option('--url <url>', 'Turso database URL (file:local.db for local, libsql://... for cloud)')
  .option('--token <token>', 'Turso auth token (required for cloud, optional for local)')
  .action(async (options) => {
    try {
      let url: string;
      let token: string | undefined;

      // If URL provided via CLI, use it
      if (options.url) {
        url = options.url;
        token = options.token; // May be undefined for local URLs
        saveConfig({ url, authToken: token });
      } else {
        // Try to load from .env
        try {
          const config = loadConfig();
          url = config.url;
          token = config.authToken;
        } catch {
          const response: CliResponse = {
            success: false,
            error: 'Create .superintent/.env with TURSO_URL (and TURSO_AUTH_TOKEN for cloud)',
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }
      }

      // Test connection and create tables
      const client = await createClientWithConfig(url, token);
      await initSchema(client);
      client.close();

      const response: CliResponse = {
        success: true,
        data: {
          message: 'Database tables created successfully',
          configPath: '.superintent/.env',
        },
      };
      console.log(JSON.stringify(response));
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Initialization failed: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

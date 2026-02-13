import { Command } from 'commander';
import { loadConfig, configExists } from '../utils/config.js';
import { getClient, closeClient } from '../db/client.js';
import type { CliResponse } from '../types.js';

export const statusCommand = new Command('status')
  .description('Check Turso connection status')
  .action(async () => {
    try {
      // Check config
      if (!configExists()) {
        const response: CliResponse = {
          success: false,
          error: 'Not configured. Create .superintent/.env with TURSO_URL (and TURSO_AUTH_TOKEN for cloud), then run: superintent init',
        };
        console.log(JSON.stringify(response));
        process.exit(1);
      }

      const config = loadConfig();

      // Test connection
      const client = await getClient();

      // Get counts
      const ticketCount = await client.execute('SELECT COUNT(*) as count FROM tickets');
      const knowledgeCount = await client.execute('SELECT COUNT(*) as count FROM knowledge');

      closeClient();

      const response: CliResponse = {
        success: true,
        data: {
          connected: true,
          url: config.url.replace(/\/\/.*:.*@/, '//***@'), // Hide token in URL if present
          tickets: ticketCount.rows[0].count,
          knowledge: knowledgeCount.rows[0].count,
        },
      };
      console.log(JSON.stringify(response));
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Connection failed: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

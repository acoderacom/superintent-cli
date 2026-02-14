import { Command } from 'commander';
import { getClient, closeClient } from '../db/client.js';
import { performVectorSearch } from '../db/search.js';
import { embed } from '../embed/model.js';
import type { SearchResult, CliResponse } from '../types.js';

export const searchCommand = new Command('search')
  .description('Semantic search knowledge base')
  .argument('<query>', 'Search query')
  .option('--namespace <namespace>', 'Filter by namespace (project)')
  .option('--category <category>', 'Filter by category')
  .option('--ticket-type <type>', 'Filter by origin ticket type (feature|bugfix|refactor|docs|chore|test)')
  .option('--tags <tags...>', 'Filter by tags (OR logic)')
  .option('--author <author>', 'Filter by author')
  .option('--branch <branch>', 'Filter by branch')
  .option('--min-score <n>', 'Minimum similarity score 0-1', '0')
  .option('--limit <n>', 'Max results', '5')
  .action(async (query, options) => {
    try {
      const client = await getClient();
      try {
        const queryEmbedding = await embed(query);

        const results = await performVectorSearch(client, queryEmbedding, {
          namespace: options.namespace,
          category: options.category,
          ticketType: options.ticketType,
          tags: options.tags,
          author: options.author,
          branch: options.branch,
          minScore: parseFloat(options.minScore),
          limit: parseInt(options.limit, 10),
        });

        const response: CliResponse<{ query: string; results: SearchResult[] }> = {
          success: true,
          data: { query, results },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Search failed: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

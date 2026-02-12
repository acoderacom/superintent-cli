import { Command } from 'commander';
import { getClient, closeClient } from '../db/client.js';
import { parseTicketRow } from '../db/parsers.js';
import { getProjectNamespace } from '../utils/config.js';
import { generateExtractProposals } from './ticket.js';
import type { KnowledgeInput, CliResponse, TicketPlan } from '../types.js';

interface ExtractProposal {
  action: 'propose';
  ticketId: string;
  namespace: string;
  ticket: {
    intent: string;
    context: string | null;
    assumptions: string[] | null;
    constraints_use: string[] | null;
    constraints_avoid: string[] | null;
    plan: TicketPlan | null;
  };
  suggestedKnowledge: KnowledgeInput[];
}

export const extractCommand = new Command('extract')
  .description('Extract knowledge from a completed ticket')
  .argument('<ticket-id>', 'Ticket ID to extract knowledge from')
  .option('--namespace <namespace>', 'Override namespace (default: derived from ticket)')
  .action(async (ticketId, options) => {
    try {
      const client = await getClient();

      const result = await client.execute({
        sql: 'SELECT * FROM tickets WHERE id = ?',
        args: [ticketId],
      });

      closeClient();

      if (result.rows.length === 0) {
        const response: CliResponse = {
          success: false,
          error: `Ticket ${ticketId} not found`,
        };
        console.log(JSON.stringify(response));
        process.exit(1);
      }

      const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);

      if (ticket.status !== 'Done') {
        const response: CliResponse = {
          success: false,
          error: `Ticket ${ticketId} is not Done (status: ${ticket.status}). Only completed tickets can have knowledge extracted.`,
        };
        console.log(JSON.stringify(response));
        process.exit(1);
      }

      const namespace = options.namespace || getProjectNamespace();
      const suggestions: KnowledgeInput[] = generateExtractProposals(ticket, namespace);

      // Output proposal for AI to review and confirm
      const proposal: ExtractProposal = {
        action: 'propose',
        ticketId,
        namespace,
        ticket: {
          intent: ticket.intent,
          context: ticket.context || null,
          assumptions: ticket.assumptions || null,
          constraints_use: ticket.constraints_use || null,
          constraints_avoid: ticket.constraints_avoid || null,
          plan: ticket.plan || null,
        },
        suggestedKnowledge: suggestions,
      };

      const response: CliResponse<ExtractProposal> = {
        success: true,
        data: proposal,
      };
      console.log(JSON.stringify(response));
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to extract knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

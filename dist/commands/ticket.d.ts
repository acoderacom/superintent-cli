import { Command } from 'commander';
import type { Ticket, KnowledgeInput } from '../types.js';
export declare function generateExtractProposals(ticket: Ticket, namespace: string): KnowledgeInput[];
export declare const ticketCommand: Command;

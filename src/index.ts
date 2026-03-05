#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { dashboardCommand } from './commands/dashboard.js';
import { initCommand } from './commands/init.js';
import { knowledgeCommand } from './commands/knowledge.js';
import { specCommand } from './commands/spec.js';
import { statusCommand } from './commands/status.js';
import { ticketCommand } from './commands/ticket.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('superintent')
  .description('CLI companion for the Superintent Claude Code plugin')
  .version(packageJson.version);

program.addCommand(initCommand);
program.addCommand(statusCommand);
program.addCommand(ticketCommand);
program.addCommand(knowledgeCommand);
program.addCommand(dashboardCommand);
program.addCommand(specCommand);

program.parse();

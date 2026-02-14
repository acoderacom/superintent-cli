import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import type { InValue } from '@libsql/client';
import { getClient, closeClient } from '../db/client.js';
import { parseTicketRow } from '../db/parsers.js';
import { getProjectNamespace } from '../utils/config.js';
import { readStdin } from '../utils/io.js';
import { generateId } from '../utils/id.js';
import { getGitUsername } from '../utils/git.js';
import type { Ticket, TaskItem, CliResponse, KnowledgeInput, TicketPlan, TicketType } from '../types.js';

/**
 * Infer ticket type from intent keywords
 */
function inferTicketType(intent: string): TicketType {
  const lower = intent.toLowerCase();

  // Bugfix patterns
  if (/\b(fix|bug|issue|error|broken|crash|fail|wrong|incorrect)\b/.test(lower)) {
    return 'bugfix';
  }

  // Refactor patterns
  if (/\b(refactor|restructure|reorganize|clean\s?up|simplify|improve\s+code|optimize)\b/.test(lower)) {
    return 'refactor';
  }

  // Docs patterns
  if (/\b(document|docs?|readme|comment|explain|guide)\b/.test(lower)) {
    return 'docs';
  }

  // Test patterns
  if (/\b(test|spec|coverage|unit\s+test|e2e|integration\s+test)\b/.test(lower)) {
    return 'test';
  }

  // Chore patterns
  if (/\b(chore|update\s+dep|upgrade|migrate|config|setup|ci|cd|build)\b/.test(lower)) {
    return 'chore';
  }

  // Default to feature
  return 'feature';
}

interface ParsedTicket {
  type?: TicketType;
  title?: string;
  intent: string;
  context?: string;
  constraintsUse?: string[];
  constraintsAvoid?: string[];
  assumptions?: string[];
  changeClass?: string;
  changeClassReason?: string;
  planContent?: string;
}

interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Validate a parsed ticket — errors block creation, warnings are informational
 */
function validateParsedTicket(parsed: ParsedTicket): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!parsed.intent) {
    issues.push({ field: 'intent', severity: 'error', message: 'Missing **Intent:** field' });
  }

  return issues;
}

/**
 * Parse markdown ticket format matching SKILL.md ticket format
 */
function parseMarkdownTicket(content: string): ParsedTicket {
  // Check for ## Plan section and split content
  const planMatch = content.match(/^##\s*Plan\s*$/im);
  let ticketContent = content;
  let planContent: string | undefined;

  if (planMatch && planMatch.index !== undefined) {
    ticketContent = content.substring(0, planMatch.index);
    planContent = content.substring(planMatch.index + planMatch[0].length);
  }

  const lines = ticketContent.split('\n');
  const ticket: ParsedTicket = { intent: '', planContent };

  let currentSection = '';
  let contextLines: string[] = [];
  let inContext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Parse title: # {intent summary}
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      ticket.title = trimmed.substring(2).trim();
    }

    // Parse fields — **Field:** format only (matches SKILL.md)
    const isType = trimmed.startsWith('**Type:**');
    const isIntent = trimmed.startsWith('**Intent:**');
    const isContext = trimmed.startsWith('**Context:**');
    const isConstraints = trimmed.startsWith('**Constraints:**');
    const isAssumptions = trimmed.startsWith('**Assumptions:**');
    const isChangeClass = trimmed.startsWith('**Change Class:**');

    if (isType) {
      const typeValue = trimmed.replace(/^\*\*Type:\*\*\s*/, '').trim().toLowerCase();
      if (['feature', 'bugfix', 'refactor', 'docs', 'chore', 'test'].includes(typeValue)) {
        ticket.type = typeValue as TicketType;
      }
      inContext = false;
      currentSection = '';
    } else if (isIntent) {
      ticket.intent = trimmed.replace(/^\*\*Intent:\*\*\s*/, '').trim();
      inContext = false;
      currentSection = '';
    } else if (isContext) {
      ticket.context = trimmed.replace(/^\*\*Context:\*\*\s*/, '').trim();
      inContext = true;
      currentSection = '';
      contextLines = [];
    } else if (isConstraints) {
      inContext = false;
      currentSection = 'constraints';
      const parts = trimmed.replace(/^\*\*Constraints:\*\*\s*/, '').trim();
      if (parts) {
        const useMatch = parts.match(/Use:\s*([^|]+)/i);
        const avoidMatch = parts.match(/Avoid:\s*(.+)/i);
        if (useMatch) {
          ticket.constraintsUse = useMatch[1].replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        }
        if (avoidMatch) {
          ticket.constraintsAvoid = avoidMatch[1].replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        }
      }
    } else if (isAssumptions) {
      inContext = false;
      currentSection = 'assumptions';
      const assumptionText = trimmed.replace(/^\*\*Assumptions:\*\*\s*/, '').trim();
      if (assumptionText) {
        ticket.assumptions = assumptionText.replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      } else {
        ticket.assumptions = [];
      }
    } else if (isChangeClass) {
      inContext = false;
      currentSection = '';
      const classLine = trimmed.replace(/^\*\*Change Class:\*\*\s*/, '').trim();
      const dashIndex = classLine.indexOf('-');
      if (dashIndex > -1) {
        ticket.changeClass = classLine.substring(0, dashIndex).trim();
        ticket.changeClassReason = classLine.substring(dashIndex + 1).trim();
      } else {
        ticket.changeClass = classLine;
      }
    } else if (trimmed.startsWith('- ')) {
      const text = trimmed.substring(2).trim();
      if (currentSection === 'constraints') {
        if (text.toLowerCase().startsWith('use:')) {
          const items = text.substring(4).trim().split(',').map(s => s.trim()).filter(Boolean);
          ticket.constraintsUse = ticket.constraintsUse || [];
          ticket.constraintsUse.push(...items);
        } else if (text.toLowerCase().startsWith('avoid:')) {
          const items = text.substring(6).trim().split(',').map(s => s.trim()).filter(Boolean);
          ticket.constraintsAvoid = ticket.constraintsAvoid || [];
          ticket.constraintsAvoid.push(...items);
        }
      } else if (currentSection === 'assumptions') {
        ticket.assumptions?.push(text);
      }
    } else if (trimmed.startsWith('**') && !trimmed.startsWith('**Status')) {
      inContext = false;
      currentSection = '';
    } else if (inContext && trimmed && !trimmed.startsWith('**')) {
      contextLines.push(trimmed);
    }
  }

  // Append multi-line context
  if (contextLines.length > 0 && ticket.context) {
    ticket.context = ticket.context + '\n' + contextLines.join('\n');
  }

  return ticket;
}

/**
 * Parse plan from markdown format (synced with ticket structure):
 *
 * **Files:** src/api.ts, src/utils.ts
 *
 * **Tasks → Steps:**
 * - task: Implement API endpoint
 *   - Step 1: Create route handler
 *   - Step 2: Add validation
 * - task: Add tests
 *   - Step 1: Unit tests
 *
 * **DoD → Verification:**
 * - dod: API returns correct data | verify: Run integration tests
 * - dod: No TypeScript errors | verify: npx tsc --noEmit
 *
 * **Decisions:**
 * - choice: Use cursor pagination | reason: Better for large datasets
 */
function parsePlanMarkdown(content: string): TicketPlan {
  const plan: TicketPlan = {
    files: [],
    taskSteps: [],
    dodVerification: [],
    decisions: [],
    tradeOffs: [],
    rollback: undefined,
    irreversibleActions: [],
    edgeCases: [],
  };

  const lines = content.split('\n');
  let currentSection = '';
  let currentTaskSteps: { task: string; steps: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse section headers
    if (trimmed.startsWith('**Files to Edit:**') || trimmed.startsWith('**Files:**') || trimmed.toLowerCase().startsWith('files to edit:') || trimmed.toLowerCase().startsWith('files:')) {
      const filesStr = trimmed.replace(/^\*?\*?Files( to Edit)?:\*?\*?\s*/i, '').trim();
      if (filesStr) {
        plan.files = filesStr.split(',').map(f => f.trim()).filter(Boolean);
      }
      currentSection = 'files';
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }
    if (trimmed.match(/^\*?\*?Tasks?\s*(→|->)\s*Steps?:?\*?\*?$/i) || trimmed.toLowerCase().startsWith('tasks → steps:') || trimmed.toLowerCase().startsWith('tasks -> steps:')) {
      currentSection = 'taskSteps';
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }
    if (trimmed.match(/^\*?\*?(DoD|Definition of Done)\s*(→|->)\s*Verification:?\*?\*?$/i) || trimmed.toLowerCase().includes('→ verification:') || trimmed.toLowerCase().includes('-> verification:')) {
      currentSection = 'dodVerification';
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }
    if (trimmed.startsWith('**Decisions:**') || trimmed.toLowerCase().startsWith('decisions:')) {
      currentSection = 'decisions';
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }
    if (trimmed.startsWith('**Trade-offs:**') || trimmed.toLowerCase().startsWith('trade-offs:')) {
      currentSection = 'tradeOffs';
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }
    if (trimmed.startsWith('**Irreversible Actions:**') || trimmed.toLowerCase().startsWith('irreversible actions:')) {
      currentSection = 'irreversibleActions';
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }
    if (trimmed.startsWith('**Edge Cases:**') || trimmed.toLowerCase().startsWith('edge cases:')) {
      currentSection = 'edgeCases';
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }
    if (trimmed.startsWith('**Rollback:**') || trimmed.toLowerCase().startsWith('rollback:')) {
      currentSection = 'rollback';
      plan.rollback = { steps: [], reversibility: 'full' };
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
        currentTaskSteps = null;
      }
      continue;
    }

    // Parse numbered list items (e.g., "1. Task name")
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numberedMatch && currentSection === 'taskSteps') {
      // Save previous task if exists
      if (currentTaskSteps) {
        plan.taskSteps.push(currentTaskSteps);
      }
      currentTaskSteps = {
        task: numberedMatch[1].trim(),
        steps: [],
      };
      continue;
    }

    // Parse list items
    if (trimmed.startsWith('- ')) {
      const item = trimmed.substring(2).trim();

      if (currentSection === 'files') {
        plan.files.push(item);
      } else if (currentSection === 'taskSteps') {
        // Check if it's a new task (starts with "task:")
        if (item.toLowerCase().startsWith('task:')) {
          // Save previous task if exists
          if (currentTaskSteps) {
            plan.taskSteps.push(currentTaskSteps);
          }
          currentTaskSteps = {
            task: item.substring(5).trim(),
            steps: [],
          };
        } else if (currentTaskSteps) {
          // It's a step for the current task
          currentTaskSteps.steps.push(item);
        }
      } else if (currentSection === 'dodVerification') {
        // Parse "dod → verify", "dod: X | verify: Y", or plain text
        let dod = item;
        let verify = '';
        const arrowParts = item.split(/\s*(?:→|->)\s*/);
        if (arrowParts.length >= 2) {
          dod = arrowParts[0].trim();
          verify = arrowParts.slice(1).join(' → ').trim();
        } else {
          const pipeParts = item.split('|').map(p => p.trim());
          for (const part of pipeParts) {
            if (part.toLowerCase().startsWith('dod:')) {
              dod = part.substring(4).trim();
            } else if (part.toLowerCase().startsWith('verify:')) {
              verify = part.substring(7).trim();
            }
          }
        }
        plan.dodVerification.push({ dod, verify });
      } else if (currentSection === 'decisions') {
        // Parse "choice → reason", "choice: X | reason: Y", or plain text
        let choice = item;
        let reason = '';
        const arrowParts = item.split(/\s*(?:→|->)\s*/);
        if (arrowParts.length >= 2) {
          choice = arrowParts[0].trim();
          reason = arrowParts.slice(1).join(' → ').trim();
        } else {
          const pipeParts = item.split('|').map(p => p.trim());
          for (const part of pipeParts) {
            if (part.toLowerCase().startsWith('choice:')) {
              choice = part.substring(7).trim();
            } else if (part.toLowerCase().startsWith('reason:')) {
              reason = part.substring(7).trim();
            }
          }
        }
        plan.decisions.push({ choice, reason });
      } else if (currentSection === 'tradeOffs') {
        // Parse "considered: X | rejected: Y" or "limitation: Z" format
        const parts = item.split('|').map(p => p.trim());
        let considered = item;
        let rejected = '';
        for (const part of parts) {
          if (part.toLowerCase().startsWith('considered:')) {
            considered = part.substring(11).trim();
          } else if (part.toLowerCase().startsWith('rejected:')) {
            rejected = part.substring(9).trim();
          } else if (part.toLowerCase().startsWith('limitation:')) {
            considered = part.substring(11).trim();
            rejected = 'Scale/performance limitation';
          }
        }
        plan.tradeOffs.push({ considered, rejected });
      } else if (currentSection === 'irreversibleActions') {
        plan.irreversibleActions.push(item);
      } else if (currentSection === 'edgeCases') {
        plan.edgeCases.push(item);
      } else if (currentSection === 'rollback' && plan.rollback) {
        // Check for "Reversibility: full|partial|none" line
        if (item.toLowerCase().startsWith('reversibility:')) {
          const rev = item.substring(14).trim().toLowerCase();
          if (rev === 'full' || rev === 'partial' || rev === 'none') {
            plan.rollback.reversibility = rev;
          }
        } else {
          plan.rollback.steps.push(item);
        }
      }
    } else if (currentSection === 'taskSteps' && currentTaskSteps && line.match(/^\s{2,}- /)) {
      // Indented step for current task (e.g., "   - step text")
      const step = line.replace(/^\s*-\s*/, '').trim();
      currentTaskSteps.steps.push(step);
    }
  }

  // Don't forget to save the last task
  if (currentTaskSteps) {
    plan.taskSteps.push(currentTaskSteps);
  }

  return plan;
}

// Generate knowledge extraction proposals from a completed ticket
export function generateExtractProposals(ticket: Ticket, namespace: string): KnowledgeInput[] {
  const suggestions: KnowledgeInput[] = [];
  const ticketType = ticket.type;  // Pass to all suggestions

  // Pattern from intent + context
  if (ticket.intent && ticket.context) {
    suggestions.push({
      namespace,
      title: ticket.intent.slice(0, 100),
      content: `Why:\n${ticket.context}\n\nWhen:\n[AI: Describe when to apply this pattern]\n\nPattern:\n${ticket.intent}`,
      category: 'pattern',
      source: 'ticket',
      originTicketId: ticket.id,
      originTicketType: ticketType,
      confidence: 0.75,
      decisionScope: 'new-only',
    });
  }

  // Truths from validated assumptions
  if (ticket.assumptions && ticket.assumptions.length > 0) {
    for (const assumption of ticket.assumptions) {
      suggestions.push({
        namespace,
        title: `Validated: ${assumption.slice(0, 80)}`,
        content: `Fact:\n${assumption}\n\nVerified:\nValidated during ticket ${ticket.id}`,
        category: 'truth',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.9,
        decisionScope: 'global',
      });
    }
  }

  // Principles from constraints
  if (ticket.constraints_use && ticket.constraints_use.length > 0) {
    for (const constraint of ticket.constraints_use) {
      suggestions.push({
        namespace,
        title: `Use: ${constraint.slice(0, 80)}`,
        content: `Rule:\n${constraint}\n\nWhy:\n[AI: Explain rationale]\n\nApplies:\nNew code only`,
        category: 'principle',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.7,
        decisionScope: 'new-only',
      });
    }
  }

  if (ticket.constraints_avoid && ticket.constraints_avoid.length > 0) {
    for (const constraint of ticket.constraints_avoid) {
      suggestions.push({
        namespace,
        title: `Avoid: ${constraint.slice(0, 80)}`,
        content: `Avoid:\n${constraint}\n\nWhy:\n[AI: Explain why this is problematic]\n\nApplies:\nNew code only`,
        category: 'principle',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.7,
        decisionScope: 'new-only',
      });
    }
  }

  // Decisions from plan (high-value knowledge)
  if (ticket.plan?.decisions && ticket.plan.decisions.length > 0) {
    for (const decision of ticket.plan.decisions) {
      if (!decision.choice) continue;
      suggestions.push({
        namespace,
        title: `Decision: ${decision.choice.slice(0, 70)}`,
        content: `Rule:\n${decision.choice}\n\nWhy:\n${decision.reason || '[AI: Explain rationale]'}\n\nApplies:\nSimilar contexts`,
        category: 'principle',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.85, // Decisions are deliberate choices, higher confidence
        decisionScope: 'new-only',
      });
    }
  }

  // Trade-offs from plan (what we didn't choose and why)
  if (ticket.plan?.tradeOffs && ticket.plan.tradeOffs.length > 0) {
    for (const tradeOff of ticket.plan.tradeOffs) {
      if (!tradeOff.considered) continue;
      suggestions.push({
        namespace,
        title: `Avoid: ${tradeOff.considered.slice(0, 70)}`,
        content: `Avoid:\n${tradeOff.considered}\n\nWhy rejected:\n${tradeOff.rejected || '[AI: Explain why this was rejected]'}\n\nContext:\nTicket ${ticket.id}`,
        category: 'principle',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.8, // Trade-offs are deliberate rejections
        decisionScope: 'new-only',
      });
    }
  }

  // DoD → Verification patterns (validated criteria)
  if (ticket.plan?.dodVerification && ticket.plan.dodVerification.length > 0) {
    for (const dv of ticket.plan.dodVerification) {
      if (!dv.dod) continue;
      suggestions.push({
        namespace,
        title: `Verify: ${dv.dod.slice(0, 70)}`,
        content: dv.verify
          ? `Criterion:\n${dv.dod}\n\nVerification:\n${dv.verify}\n\nValidated:\nTicket ${ticket.id}`
          : `Criterion:\n${dv.dod}\n\nValidated:\nTicket ${ticket.id}`,
        category: 'pattern',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.8, // Verified criteria are reliable patterns
        decisionScope: 'new-only',
      });
    }
  }

  return suggestions;
}

export const ticketCommand = new Command('ticket')
  .description('Manage tickets');

// Create subcommand
ticketCommand
  .command('create')
  .description('Create a new ticket from stdin, file, or options')
  .option('--stdin', 'Read ticket markdown from stdin')
  .option('--file <path>', 'Read ticket from markdown file')
  .option('--intent <intent>', 'What user wants to achieve')
  .option('--context <context>', 'Relevant files, patterns, background')
  .option('--use <constraints...>', 'Constraints: things to use')
  .option('--avoid <constraints...>', 'Constraints: things to avoid')
  .option('--assumptions <assumptions...>', 'AI assumptions to validate')
  .option('--class <class>', 'Change class: A, B, or C', 'A')
  .option('--class-reason <reason>', 'Reason for change class')
  .option('--spec <spec-id>', 'Origin spec ID')
  .action(async (options) => {
    try {
      let id: string;
      let type: TicketType | null = null;
      let title: string | null = null;
      let intent: string;
      let context: string | null = null;
      let constraintsUse: string[] | null = null;
      let constraintsAvoid: string[] | null = null;
      let assumptions: string[] | null = null;
      let tasks: TaskItem[] | undefined;
      let dod: TaskItem[] | undefined;
      let changeClass: string | null = null;
      let changeClassReason: string | null = null;
      let originSpecId: string | null = null;
      let plan: TicketPlan | null = null;

      // Read from stdin or file if provided
      if (options.stdin || options.file) {
        let content: string;

        if (options.stdin) {
          content = await readStdin();
        } else {
          if (!existsSync(options.file)) {
            throw new Error(`File not found: ${options.file}`);
          }
          content = readFileSync(options.file, 'utf-8');
        }

        const parsed = parseMarkdownTicket(content);
        const issues = validateParsedTicket(parsed);
        const errors = issues.filter(i => i.severity === 'error');

        if (errors.length > 0) {
          throw new Error(errors.map(e => `${e.field}: ${e.message}`).join('; '));
        }

        id = generateId('TICKET');
        title = parsed.title || null;
        intent = parsed.intent;
        type = parsed.type || inferTicketType(intent);
        context = parsed.context || null;
        constraintsUse = parsed.constraintsUse || null;
        constraintsAvoid = parsed.constraintsAvoid || null;
        assumptions = parsed.assumptions || null;
        changeClass = parsed.changeClass || null;
        changeClassReason = parsed.changeClassReason || null;
        originSpecId = options.spec || null;
        // Parse plan and extract tasks/DoD from it
        if (parsed.planContent) {
          plan = parsePlanMarkdown(parsed.planContent);
          if (plan.taskSteps.length > 0) {
            tasks = plan.taskSteps.map(ts => ({ text: ts.task, done: false }));
          }
          if (plan.dodVerification.length > 0) {
            dod = plan.dodVerification.map(dv => ({ text: dv.dod, done: false }));
          }
        }
      } else {
        // Use CLI options
        if (!options.intent) {
          throw new Error('Either --file/--stdin or --intent is required');
        }

        id = generateId('TICKET');
        intent = options.intent;
        type = inferTicketType(intent);
        context = options.context || null;
        constraintsUse = options.use || null;
        constraintsAvoid = options.avoid || null;
        assumptions = options.assumptions || null;
        changeClass = options.class || null;
        changeClassReason = options.classReason || null;
        originSpecId = options.spec || null;
      }

      const client = await getClient();
      try {
        await client.execute({
          sql: `INSERT INTO tickets (
            id, type, title, status, intent, context,
            constraints_use, constraints_avoid, assumptions,
            tasks, definition_of_done, change_class, change_class_reason, plan, origin_spec_id
          ) VALUES (?, ?, ?, 'Backlog', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            type,
            title,
            intent,
            context,
            constraintsUse ? JSON.stringify(constraintsUse) : null,
            constraintsAvoid ? JSON.stringify(constraintsAvoid) : null,
            assumptions ? JSON.stringify(assumptions) : null,
            tasks ? JSON.stringify(tasks) : null,
            dod ? JSON.stringify(dod) : null,
            changeClass,
            changeClassReason,
            plan ? JSON.stringify(plan) : null,
            originSpecId,
          ],
        });

        const response: CliResponse<{ id: string; status: string }> = {
          success: true,
          data: { id, status: 'created' },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to create ticket: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Get subcommand
ticketCommand
  .command('get')
  .description('Get a ticket by ID')
  .argument('<id>', 'Ticket ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      let result;
      try {
        result = await client.execute({
          sql: 'SELECT * FROM tickets WHERE id = ?',
          args: [id],
        });
      } finally {
        closeClient();
      }

      if (result.rows.length === 0) {
        const response: CliResponse = {
          success: false,
          error: `Ticket ${id} not found`,
        };
        console.log(JSON.stringify(response));
        process.exit(1);
      }

      const ticket = parseTicketRow(result.rows[0] as Record<string, unknown>);

      const response: CliResponse<Ticket> = {
        success: true,
        data: ticket,
      };
      console.log(JSON.stringify(response));
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to get ticket: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Update subcommand
ticketCommand
  .command('update')
  .description('Update a ticket')
  .argument('<id>', 'Ticket ID')
  .option('--status <status>', 'New status (Backlog|In Progress|In Review|Done)')
  .option('--context <context>', 'Update context')
  .option('--comment <comment>', 'Add a comment')
  .option('--author <author>', 'Comment author (default: git user.name)')
  .option('--tasks <tasks...>', 'Replace tasks')
  .option('--dod <criteria...>', 'Replace definition of done')
  .option('--complete-task <indices>', 'Mark tasks as done (comma-separated indices, e.g., 0,1,2)')
  .option('--complete-dod <indices>', 'Mark DoD items as done (comma-separated indices, e.g., 0,1,2)')
  .option('--complete-all', 'Mark all tasks and DoD items as complete')
  .option('--plan-stdin', 'Read plan from stdin (markdown format)')
  .option('--spec <spec-id>', 'Set origin spec ID')
  .action(async (id, options) => {
    try {
      const client = await getClient();
      try {
        // Check ticket exists
        const existing = await client.execute({
          sql: 'SELECT * FROM tickets WHERE id = ?',
          args: [id],
        });

        if (existing.rows.length === 0) {
          const response: CliResponse = {
            success: false,
            error: `Ticket ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const currentTicket = parseTicketRow(existing.rows[0] as Record<string, unknown>);
        const updates: string[] = [];
        const args: InValue[] = [];

        // Track if tasks/dod have been modified to avoid duplicate updates
        let tasksModified = false;
        let dodModified = false;
        let tasks = currentTicket.tasks ? [...currentTicket.tasks] : [];
        let dod = currentTicket.definition_of_done ? [...currentTicket.definition_of_done] : [];

        // Handle --complete-all flag (highest priority for completion)
        if (options.completeAll) {
          if (tasks.length > 0) {
            tasks = tasks.map(t => ({ ...t, done: true }));
            tasksModified = true;
          }
          if (dod.length > 0) {
            dod = dod.map(d => ({ ...d, done: true }));
            dodModified = true;
          }
        }

        // Handle --complete-task with comma-separated indices
        if (options.completeTask !== undefined && !options.completeAll) {
          const indices = String(options.completeTask).split(',').map(s => parseInt(s.trim(), 10));
          for (const idx of indices) {
            if (tasks[idx]) {
              tasks[idx].done = true;
              tasksModified = true;
            }
          }
        }

        // Handle --complete-dod with comma-separated indices
        if (options.completeDod !== undefined && !options.completeAll) {
          const indices = String(options.completeDod).split(',').map(s => parseInt(s.trim(), 10));
          for (const idx of indices) {
            if (dod[idx]) {
              dod[idx].done = true;
              dodModified = true;
            }
          }
        }

        if (options.status) {
          updates.push('status = ?');
          args.push(options.status);

          // Auto-complete all tasks and DoD when status is "Done" (unless already handled by --complete-all)
          if (options.status === 'Done' && !options.completeAll) {
            if (tasks.length > 0 && !tasksModified) {
              tasks = tasks.map(t => ({ ...t, done: true }));
              tasksModified = true;
            }
            if (dod.length > 0 && !dodModified) {
              dod = dod.map(d => ({ ...d, done: true }));
              dodModified = true;
            }
          }
        }

        if (options.context) {
          updates.push('context = ?');
          args.push(options.context);
        }

        if (options.comment) {
          const commentId = generateId('COMMENT');
          const author = options.author || getGitUsername();
          await client.execute({
            sql: `INSERT INTO comments (id, parent_type, parent_id, author, text) VALUES (?, ?, ?, ?, ?)`,
            args: [commentId, 'ticket', id, author, options.comment],
          });
        }

        if (options.tasks) {
          tasks = (options.tasks as string[]).map((text: string) => ({ text, done: false }));
          tasksModified = true;
        }

        if (options.dod) {
          dod = (options.dod as string[]).map((text: string) => ({ text, done: false }));
          dodModified = true;
        }

        if (options.spec) {
          updates.push('origin_spec_id = ?');
          args.push(options.spec);
        }

        // Handle --plan-stdin: read and parse plan from stdin
        if (options.planStdin) {
          const planContent = await readStdin();
          const plan = parsePlanMarkdown(planContent);
          updates.push('plan = ?');
          args.push(JSON.stringify(plan));
        }

        // Apply task modifications
        if (tasksModified) {
          updates.push('tasks = ?');
          args.push(JSON.stringify(tasks));
        }

        // Apply dod modifications
        if (dodModified) {
          updates.push('definition_of_done = ?');
          args.push(JSON.stringify(dod));
        }

        if (updates.length === 0 && !options.comment) {
          const response: CliResponse = {
            success: false,
            error: 'No updates provided',
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        if (updates.length > 0) {
          updates.push("updated_at = datetime('now')");
          args.push(id);

          await client.execute({
            sql: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`,
            args,
          });
        }

        // Auto-extract: generate knowledge proposals when status is "Done"
        let extractProposals: KnowledgeInput[] | undefined;
        if (options.status === 'Done') {
          // Fetch updated ticket for extraction
          const updatedResult = await client.execute({
            sql: 'SELECT * FROM tickets WHERE id = ?',
            args: [id],
          });
          if (updatedResult.rows.length > 0) {
            const updatedTicket = parseTicketRow(updatedResult.rows[0] as Record<string, unknown>);
            const namespace = getProjectNamespace();
            extractProposals = generateExtractProposals(updatedTicket, namespace);
          }
        }

        const response: CliResponse<{
          id: string;
          status: string;
          extractProposals?: KnowledgeInput[];
        }> = {
          success: true,
          data: {
            id,
            status: 'updated',
            ...(extractProposals && extractProposals.length > 0 && { extractProposals }),
          },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to update ticket: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// List subcommand
ticketCommand
  .command('list')
  .description('List tickets')
  .option('--status <status>', 'Filter by status')
  .option('--limit <n>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const client = await getClient();
      try {
        let sql = 'SELECT * FROM tickets';
        const args: InValue[] = [];

        if (options.status) {
          sql += ' WHERE status = ?';
          args.push(options.status);
        }

        sql += ' ORDER BY created_at DESC LIMIT ?';
        args.push(parseInt(options.limit, 10));

        const result = await client.execute({ sql, args });

        const tickets = result.rows.map((row) =>
          parseTicketRow(row as Record<string, unknown>)
        );

        const response: CliResponse<Ticket[]> = {
          success: true,
          data: tickets,
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to list tickets: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Delete subcommand
ticketCommand
  .command('delete')
  .description('Delete a ticket by ID')
  .argument('<id>', 'Ticket ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        // Check ticket exists
        const existing = await client.execute({
          sql: 'SELECT id FROM tickets WHERE id = ?',
          args: [id],
        });

        if (existing.rows.length === 0) {
          const response: CliResponse = {
            success: false,
            error: `Ticket ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        await client.execute({
          sql: 'DELETE FROM tickets WHERE id = ?',
          args: [id],
        });

        const response: CliResponse<{ id: string; status: string }> = {
          success: true,
          data: { id, status: 'deleted' },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to delete ticket: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

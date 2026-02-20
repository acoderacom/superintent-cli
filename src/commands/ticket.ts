import { Command } from 'commander';
import type { InValue } from '@libsql/client';
import { getClient, closeClient } from '../db/client.js';
import { parseTicketRow } from '../db/parsers.js';
import { getProjectNamespace } from '../utils/config.js';
import { readStdin } from '../utils/io.js';
import { generateId } from '../utils/id.js';
import { getGitUsername } from '../utils/git.js';
import type { Ticket, CliResponse, KnowledgeInput, TicketPlan, TicketType } from '../types.js';

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

const VALID_TICKET_TYPES: TicketType[] = ['feature', 'bugfix', 'refactor', 'docs', 'chore', 'test'];
const VALID_CHANGE_CLASSES = ['A', 'B', 'C'];

interface TicketJsonInput {
  title?: string;
  type?: string;
  intent?: string;
  context?: string;
  constraints?: {
    use?: string[];
    avoid?: string[];
  };
  assumptions?: string[];
  changeClass?: string;
  changeClassReason?: string;
  plan?: TicketPlan;
  spec?: string;
  author?: string;
}

/**
 * Parse JSON ticket input from stdin.
 */
function parseJsonTicket(raw: string): TicketJsonInput {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    const result: TicketJsonInput = {};

    if (parsed.title !== undefined) {
      if (typeof parsed.title !== 'string') throw new Error('title must be a string');
      result.title = parsed.title.trim();
    }
    if (parsed.type !== undefined) {
      if (typeof parsed.type !== 'string') throw new Error('type must be a string');
      result.type = parsed.type.trim().toLowerCase();
    }
    if (parsed.intent !== undefined) {
      if (typeof parsed.intent !== 'string') throw new Error('intent must be a string');
      result.intent = parsed.intent.trim();
    }
    if (parsed.context !== undefined) {
      if (typeof parsed.context !== 'string') throw new Error('context must be a string');
      result.context = parsed.context.trim();
    }
    if (parsed.constraints !== undefined) {
      if (typeof parsed.constraints !== 'object' || parsed.constraints === null || Array.isArray(parsed.constraints)) {
        throw new Error('constraints must be an object with optional use/avoid arrays');
      }
      result.constraints = {};
      if (parsed.constraints.use !== undefined) {
        if (!Array.isArray(parsed.constraints.use) || !parsed.constraints.use.every((s: unknown) => typeof s === 'string')) {
          throw new Error('constraints.use must be an array of strings');
        }
        result.constraints.use = parsed.constraints.use.map((s: string) => s.trim()).filter(Boolean);
      }
      if (parsed.constraints.avoid !== undefined) {
        if (!Array.isArray(parsed.constraints.avoid) || !parsed.constraints.avoid.every((s: unknown) => typeof s === 'string')) {
          throw new Error('constraints.avoid must be an array of strings');
        }
        result.constraints.avoid = parsed.constraints.avoid.map((s: string) => s.trim()).filter(Boolean);
      }
    }
    if (parsed.assumptions !== undefined) {
      if (!Array.isArray(parsed.assumptions) || !parsed.assumptions.every((s: unknown) => typeof s === 'string')) {
        throw new Error('assumptions must be an array of strings');
      }
      result.assumptions = parsed.assumptions.map((s: string) => s.trim()).filter(Boolean);
    }
    if (parsed.changeClass !== undefined) {
      if (typeof parsed.changeClass !== 'string') throw new Error('changeClass must be a string');
      result.changeClass = parsed.changeClass.trim().toUpperCase();
    }
    if (parsed.changeClassReason !== undefined) {
      if (typeof parsed.changeClassReason !== 'string') throw new Error('changeClassReason must be a string');
      result.changeClassReason = parsed.changeClassReason.trim();
    }
    if (parsed.plan !== undefined) {
      result.plan = validatePlanJson(parsed.plan);
    }
    if (parsed.spec !== undefined) {
      if (typeof parsed.spec !== 'string') throw new Error('spec must be a string');
      result.spec = parsed.spec.trim();
    }
    if (parsed.author !== undefined) {
      if (typeof parsed.author !== 'string') throw new Error('author must be a string');
      result.author = parsed.author.trim();
    }

    return result;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

/**
 * Validate and normalize a plan JSON object into TicketPlan.
 * Defaults `done` to false for taskSteps and dodVerification if not provided.
 */
function validatePlanJson(plan: unknown): TicketPlan {
  if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) {
    throw new Error('plan must be an object');
  }
  const p = plan as Record<string, unknown>;
  const result: TicketPlan = {
    files: [],
    taskSteps: [],
    dodVerification: [],
    decisions: [],
    tradeOffs: [],
    rollback: undefined,
    irreversibleActions: [],
    edgeCases: [],
  };

  if (p.files !== undefined) {
    if (!Array.isArray(p.files) || !p.files.every((f: unknown) => typeof f === 'string')) {
      throw new Error('plan.files must be an array of strings');
    }
    result.files = p.files as string[];
  }

  if (p.taskSteps !== undefined) {
    if (!Array.isArray(p.taskSteps)) throw new Error('plan.taskSteps must be an array');
    for (let i = 0; i < p.taskSteps.length; i++) {
      const ts = p.taskSteps[i] as Record<string, unknown>;
      if (typeof ts !== 'object' || ts === null) throw new Error(`plan.taskSteps[${i}] must be an object`);
      if (typeof ts.task !== 'string') throw new Error(`plan.taskSteps[${i}].task must be a string`);
      if (ts.steps !== undefined && (!Array.isArray(ts.steps) || !ts.steps.every((s: unknown) => typeof s === 'string'))) {
        throw new Error(`plan.taskSteps[${i}].steps must be an array of strings`);
      }
      result.taskSteps.push({
        task: ts.task as string,
        steps: (ts.steps as string[]) || [],
        done: typeof ts.done === 'boolean' ? ts.done : false,
      });
    }
  }

  if (p.dodVerification !== undefined) {
    if (!Array.isArray(p.dodVerification)) throw new Error('plan.dodVerification must be an array');
    for (let i = 0; i < p.dodVerification.length; i++) {
      const dv = p.dodVerification[i] as Record<string, unknown>;
      if (typeof dv !== 'object' || dv === null) throw new Error(`plan.dodVerification[${i}] must be an object`);
      if (typeof dv.dod !== 'string') throw new Error(`plan.dodVerification[${i}].dod must be a string`);
      result.dodVerification.push({
        dod: dv.dod as string,
        verify: typeof dv.verify === 'string' ? dv.verify : '',
        done: typeof dv.done === 'boolean' ? dv.done : false,
      });
    }
  }

  if (p.decisions !== undefined) {
    if (!Array.isArray(p.decisions)) throw new Error('plan.decisions must be an array');
    for (let i = 0; i < p.decisions.length; i++) {
      const d = p.decisions[i] as Record<string, unknown>;
      if (typeof d !== 'object' || d === null) throw new Error(`plan.decisions[${i}] must be an object`);
      if (typeof d.choice !== 'string') throw new Error(`plan.decisions[${i}].choice must be a string`);
      result.decisions.push({
        choice: d.choice as string,
        reason: typeof d.reason === 'string' ? d.reason : '',
      });
    }
  }

  if (p.tradeOffs !== undefined) {
    if (!Array.isArray(p.tradeOffs)) throw new Error('plan.tradeOffs must be an array');
    for (let i = 0; i < p.tradeOffs.length; i++) {
      const t = p.tradeOffs[i] as Record<string, unknown>;
      if (typeof t !== 'object' || t === null) throw new Error(`plan.tradeOffs[${i}] must be an object`);
      if (typeof t.considered !== 'string') throw new Error(`plan.tradeOffs[${i}].considered must be a string`);
      result.tradeOffs.push({
        considered: t.considered as string,
        rejected: typeof t.rejected === 'string' ? t.rejected : '',
      });
    }
  }

  if (p.rollback !== undefined) {
    if (typeof p.rollback !== 'object' || p.rollback === null || Array.isArray(p.rollback)) {
      throw new Error('plan.rollback must be an object');
    }
    const rb = p.rollback as Record<string, unknown>;
    const rev = typeof rb.reversibility === 'string' ? rb.reversibility : 'full';
    if (!['full', 'partial', 'none'].includes(rev)) throw new Error("plan.rollback.reversibility must be 'full', 'partial', or 'none'");
    result.rollback = {
      steps: Array.isArray(rb.steps) ? (rb.steps as string[]) : [],
      reversibility: rev as 'full' | 'partial' | 'none',
    };
  }

  if (p.irreversibleActions !== undefined) {
    if (!Array.isArray(p.irreversibleActions) || !p.irreversibleActions.every((s: unknown) => typeof s === 'string')) {
      throw new Error('plan.irreversibleActions must be an array of strings');
    }
    result.irreversibleActions = p.irreversibleActions as string[];
  }

  if (p.edgeCases !== undefined) {
    if (!Array.isArray(p.edgeCases) || !p.edgeCases.every((s: unknown) => typeof s === 'string')) {
      throw new Error('plan.edgeCases must be an array of strings');
    }
    result.edgeCases = p.edgeCases as string[];
  }

  return result;
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
        confidence: 0.8,
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
        confidence: 0.8,
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

  // Edge cases from plan → gotcha (pitfalls discovered during work)
  if (ticket.plan?.edgeCases && ticket.plan.edgeCases.length > 0) {
    for (const edgeCase of ticket.plan.edgeCases) {
      suggestions.push({
        namespace,
        title: `Edge case: ${edgeCase.slice(0, 70)}`,
        content: `Attempted:\n[AI: What was being done when this edge case was found]\n\nFailed Because:\n${edgeCase}\n\nInstead:\n[AI: How to handle this edge case]\n\nSymptoms:\n[AI: How this manifests if not handled]`,
        category: 'gotcha',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.85,
        decisionScope: 'new-only',
      });
    }
  }

  // Irreversible actions from plan → gotcha (warnings for dangerous operations)
  if (ticket.plan?.irreversibleActions && ticket.plan.irreversibleActions.length > 0) {
    for (const action of ticket.plan.irreversibleActions) {
      suggestions.push({
        namespace,
        title: `Warning: ${action.slice(0, 70)}`,
        content: `Attempted:\n${action}\n\nFailed Because:\nThis action cannot be undone\n\nInstead:\n[AI: What precautions to take before performing this action]\n\nSymptoms:\nData loss or irreversible state change if performed without preparation`,
        category: 'gotcha',
        source: 'ticket',
        originTicketId: ticket.id,
        originTicketType: ticketType,
        confidence: 0.85,
        decisionScope: 'global',
      });
    }
  }

  // Rollback strategy from plan → pattern (reusable recovery approach)
  if (ticket.plan?.rollback && ticket.plan.rollback.steps.length > 0) {
    suggestions.push({
      namespace,
      title: `Rollback: ${ticket.title || ticket.intent.slice(0, 70)}`,
      content: `Why:\nRecovery strategy for ${ticket.change_class ? `Class ${ticket.change_class}` : 'this type of'} change\n\nWhen:\nSimilar changes that modify ${ticket.plan.files?.join(', ') || 'related files'}\n\nPattern:\nReversibility: ${ticket.plan.rollback.reversibility}\nSteps:\n${ticket.plan.rollback.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      category: 'pattern',
      source: 'ticket',
      originTicketId: ticket.id,
      originTicketType: ticketType,
      confidence: 0.8,
      decisionScope: 'backward-compatible',
    });
  }

  return suggestions;
}

export const ticketCommand = new Command('ticket')
  .description('Manage tickets');

// Create subcommand
ticketCommand
  .command('create')
  .description('Create a new ticket from JSON stdin or options')
  .option('--stdin', 'Read ticket JSON from stdin')
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
      let changeClass: string | null = null;
      let changeClassReason: string | null = null;
      let originSpecId: string | null = null;
      let plan: TicketPlan | null = null;

      if (options.stdin) {
        const raw = await readStdin();
        const parsed = parseJsonTicket(raw);

        // Field-level validation
        const errors: string[] = [];
        if (!parsed.intent) errors.push('intent: Missing or empty intent');

        // Type: optional (auto-inferred), but if provided must be valid
        if (parsed.type !== undefined && !VALID_TICKET_TYPES.includes(parsed.type as TicketType)) {
          errors.push(`type: Invalid type '${parsed.type}'. Must be one of: ${VALID_TICKET_TYPES.join(', ')}`);
        }

        // Change class: optional, but if provided must be A, B, or C
        if (parsed.changeClass !== undefined && !VALID_CHANGE_CLASSES.includes(parsed.changeClass)) {
          errors.push(`changeClass: Invalid change class '${parsed.changeClass}'. Must be A, B, or C`);
        }

        // Plan-level validation
        if (parsed.plan) {
          for (let i = 0; i < parsed.plan.taskSteps.length; i++) {
            if (!parsed.plan.taskSteps[i].task || !parsed.plan.taskSteps[i].task.trim()) {
              errors.push(`plan.taskSteps[${i}]: Empty task description`);
            }
          }
          for (let i = 0; i < parsed.plan.dodVerification.length; i++) {
            if (!parsed.plan.dodVerification[i].dod || !parsed.plan.dodVerification[i].dod.trim()) {
              errors.push(`plan.dodVerification[${i}]: Empty DoD criterion`);
            }
          }
        }

        if (errors.length > 0) {
          throw new Error(errors.join('; '));
        }

        id = generateId('TICKET');
        title = parsed.title || null;
        intent = parsed.intent!;
        type = (parsed.type as TicketType) || inferTicketType(intent);
        context = parsed.context || null;
        constraintsUse = parsed.constraints?.use || null;
        constraintsAvoid = parsed.constraints?.avoid || null;
        assumptions = parsed.assumptions || null;
        changeClass = parsed.changeClass || null;
        changeClassReason = parsed.changeClassReason || null;
        plan = parsed.plan || null;
        originSpecId = parsed.spec || options.spec || null;
      } else {
        // Use CLI options
        if (!options.intent) {
          throw new Error('--stdin or --intent is required');
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
            change_class, change_class_reason, plan, origin_spec_id, author
          ) VALUES (?, ?, ?, 'Backlog', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            type,
            title,
            intent,
            context,
            constraintsUse ? JSON.stringify(constraintsUse) : null,
            constraintsAvoid ? JSON.stringify(constraintsAvoid) : null,
            assumptions ? JSON.stringify(assumptions) : null,
            changeClass,
            changeClassReason,
            plan ? JSON.stringify(plan) : null,
            originSpecId,
            getGitUsername(),
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

// Preview subcommand — returns formatted markdown for review
ticketCommand
  .command('preview')
  .description('Preview a ticket as formatted markdown')
  .argument('<id>', 'Ticket ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        const result = await client.execute({
          sql: 'SELECT * FROM tickets WHERE id = ?',
          args: [id],
        });

        if (result.rows.length === 0) {
          const response: CliResponse = {
            success: false,
            error: `Ticket ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const t = parseTicketRow(result.rows[0] as Record<string, unknown>);
        const lines: string[] = [];

        if (t.title) lines.push(`# ${t.title}`, '');
        if (t.type) lines.push(`**Type:** ${t.type}`);
        lines.push(`**Intent:** ${t.intent}`);
        if (t.context) lines.push(`**Context:** ${t.context}`);
        if (t.constraints_use?.length || t.constraints_avoid?.length) {
          lines.push('**Constraints:**');
          if (t.constraints_use?.length) lines.push(`- Use: ${t.constraints_use.join(', ')}`);
          if (t.constraints_avoid?.length) lines.push(`- Avoid: ${t.constraints_avoid.join(', ')}`);
        }
        if (t.assumptions?.length) {
          lines.push('**Assumptions:**');
          for (const a of t.assumptions) lines.push(`- ${a}`);
        }
        if (t.change_class) {
          lines.push(`**Change Class:** ${t.change_class}${t.change_class_reason ? ' - ' + t.change_class_reason : ''}`);
        }

        if (t.plan) {
          lines.push('', '## Plan', '');
          if (t.plan.files.length > 0) lines.push(`**Files:** ${t.plan.files.join(', ')}`, '');
          if (t.plan.taskSteps.length > 0) {
            lines.push('**Tasks → Steps:**');
            for (let i = 0; i < t.plan.taskSteps.length; i++) {
              const ts = t.plan.taskSteps[i];
              lines.push(`${i + 1}. ${ts.task}${ts.done ? ' ✓' : ''}`);
              for (const step of ts.steps) lines.push(`   - ${step}`);
            }
            lines.push('');
          }
          if (t.plan.dodVerification.length > 0) {
            lines.push('**DoD → Verification:**');
            for (const dv of t.plan.dodVerification) {
              lines.push(`- ${dv.dod}${dv.verify ? ' → ' + dv.verify : ''}${dv.done ? ' ✓' : ''}`);
            }
            lines.push('');
          }
          if (t.plan.decisions.length > 0) {
            lines.push('**Decisions:**');
            for (const d of t.plan.decisions) {
              lines.push(`- ${d.choice}${d.reason ? ' — ' + d.reason : ''}`);
            }
            lines.push('');
          }
          if (t.plan.tradeOffs.length > 0) {
            lines.push('**Trade-offs:**');
            for (const to of t.plan.tradeOffs) {
              lines.push(`- considered: ${to.considered}${to.rejected ? ' | rejected: ' + to.rejected : ''}`);
            }
            lines.push('');
          }
          if (t.plan.rollback) {
            lines.push('**Rollback:**');
            lines.push(`- Reversibility: ${t.plan.rollback.reversibility}`);
            for (const step of t.plan.rollback.steps) lines.push(`- ${step}`);
            lines.push('');
          }
          if (t.plan.irreversibleActions.length > 0) {
            lines.push('**Irreversible Actions:**');
            for (const a of t.plan.irreversibleActions) lines.push(`- ${a}`);
            lines.push('');
          }
          if (t.plan.edgeCases.length > 0) {
            lines.push('**Edge Cases:**');
            for (const e of t.plan.edgeCases) lines.push(`- ${e}`);
            lines.push('');
          }
        }

        const response: CliResponse<{ id: string; preview: string }> = {
          success: true,
          data: { id: t.id, preview: lines.join('\n').trimEnd() },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to preview ticket: ${(error as Error).message}`,
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
  .option('--stdin', 'Read JSON updates from stdin')
  .option('--status <status>', 'New status (Backlog|In Progress|In Review|Done)')
  .option('--context <context>', 'Update context')
  .option('--comment <comment>', 'Add a comment')
  .option('--author <author>', 'Comment author (default: git user.name)')
  .option('--complete-task <indices>', 'Mark plan tasks as done (comma-separated indices, e.g., 0,1,2)')
  .option('--complete-dod <indices>', 'Mark plan DoD items as done (comma-separated indices, e.g., 0,1,2)')
  .option('--complete-all', 'Mark all plan tasks and DoD items as complete')
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

        // Read JSON from stdin for field updates
        let stdinParsed: TicketJsonInput | undefined;
        if (options.stdin) {
          const raw = await readStdin();
          stdinParsed = parseJsonTicket(raw);
        }

        // Plan is single source of truth for tasks and DoD completion
        let plan = currentTicket.plan ? { ...currentTicket.plan } : null;
        let planModified = false;

        // JSON stdin can replace the entire plan
        if (stdinParsed?.plan) {
          plan = stdinParsed.plan;
          planModified = true;
        }

        // Handle --complete-all flag (highest priority for completion)
        if (options.completeAll && plan) {
          if (plan.taskSteps.length > 0) {
            plan.taskSteps = plan.taskSteps.map(ts => ({ ...ts, done: true }));
            planModified = true;
          }
          if (plan.dodVerification.length > 0) {
            plan.dodVerification = plan.dodVerification.map(dv => ({ ...dv, done: true }));
            planModified = true;
          }
        }

        // Handle --complete-task with comma-separated indices
        if (options.completeTask !== undefined && !options.completeAll && plan) {
          const indices = String(options.completeTask).split(',').map(s => parseInt(s.trim(), 10));
          for (const idx of indices) {
            if (plan.taskSteps[idx]) {
              plan.taskSteps[idx] = { ...plan.taskSteps[idx], done: true };
              planModified = true;
            }
          }
        }

        // Handle --complete-dod with comma-separated indices
        if (options.completeDod !== undefined && !options.completeAll && plan) {
          const indices = String(options.completeDod).split(',').map(s => parseInt(s.trim(), 10));
          for (const idx of indices) {
            if (plan.dodVerification[idx]) {
              plan.dodVerification[idx] = { ...plan.dodVerification[idx], done: true };
              planModified = true;
            }
          }
        }

        if (options.status) {
          updates.push('status = ?');
          args.push(options.status);

          // Auto-complete all tasks and DoD when status is "Done"
          if (options.status === 'Done' && !options.completeAll && plan) {
            if (plan.taskSteps.length > 0) {
              plan.taskSteps = plan.taskSteps.map(ts => ({ ...ts, done: true }));
              planModified = true;
            }
            if (plan.dodVerification.length > 0) {
              plan.dodVerification = plan.dodVerification.map(dv => ({ ...dv, done: true }));
              planModified = true;
            }
          }
        }

        // Apply stdin field updates
        if (stdinParsed?.title) {
          updates.push('title = ?');
          args.push(stdinParsed.title);
        }
        if (stdinParsed?.intent) {
          updates.push('intent = ?');
          args.push(stdinParsed.intent);
        }
        if (stdinParsed?.type && VALID_TICKET_TYPES.includes(stdinParsed.type as TicketType)) {
          updates.push('type = ?');
          args.push(stdinParsed.type);
        }
        if (stdinParsed?.constraints?.use) {
          updates.push('constraints_use = ?');
          args.push(JSON.stringify(stdinParsed.constraints.use));
        }
        if (stdinParsed?.constraints?.avoid) {
          updates.push('constraints_avoid = ?');
          args.push(JSON.stringify(stdinParsed.constraints.avoid));
        }
        if (stdinParsed?.assumptions) {
          updates.push('assumptions = ?');
          args.push(JSON.stringify(stdinParsed.assumptions));
        }
        if (stdinParsed?.changeClass && VALID_CHANGE_CLASSES.includes(stdinParsed.changeClass)) {
          updates.push('change_class = ?');
          args.push(stdinParsed.changeClass);
        }
        if (stdinParsed?.changeClassReason) {
          updates.push('change_class_reason = ?');
          args.push(stdinParsed.changeClassReason);
        }

        if (options.context || stdinParsed?.context) {
          updates.push('context = ?');
          args.push(options.context || stdinParsed!.context!);
        }

        if (options.comment) {
          const commentId = generateId('COMMENT');
          const author = options.author || stdinParsed?.author || getGitUsername();
          await client.execute({
            sql: `INSERT INTO comments (id, parent_type, parent_id, author, text) VALUES (?, ?, ?, ?, ?)`,
            args: [commentId, 'ticket', id, author, options.comment],
          });
        }

        if (options.spec) {
          updates.push('origin_spec_id = ?');
          args.push(options.spec);
        }

        // Apply plan modifications
        if (planModified && plan) {
          updates.push('plan = ?');
          args.push(JSON.stringify(plan));
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

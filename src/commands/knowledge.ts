import { Command } from 'commander';
import { getClient, closeClient } from '../db/client.js';
import { parseKnowledgeRow } from '../db/parsers.js';
import { embed } from '../embed/model.js';
import { readStdin } from '../utils/io.js';
import { generateId } from '../utils/id.js';
import { getGitUsername, getGitBranch } from '../utils/git.js';
import type { Knowledge, CliResponse, KnowledgeCategory, DecisionScope, KnowledgeSource, TicketType } from '../types.js';

function clampConfidence(value: number): number {
  if (isNaN(value)) return 0.8;
  return Math.max(0.1, Math.min(1.0, value));
}

const VALID_CATEGORIES: KnowledgeCategory[] = ['pattern', 'truth', 'principle', 'architecture', 'gotcha'];
const VALID_SOURCES: KnowledgeSource[] = ['ticket', 'discovery', 'manual'];
const VALID_SCOPES: DecisionScope[] = ['new-only', 'backward-compatible', 'global', 'legacy-frozen'];
const VALID_TICKET_TYPES: TicketType[] = ['feature', 'bugfix', 'refactor', 'docs', 'chore', 'test'];

interface KnowledgeJsonInput {
  title?: string;
  namespace?: string;
  content?: string;
  category?: string;
  source?: string;
  originTicketId?: string;
  originTicketType?: string;
  confidence?: number;
  scope?: string;
  tags?: string[];
  author?: string;
  branch?: string;
}

/**
 * Parse JSON knowledge input from stdin.
 * Expected format: {"title": "...", "namespace": "...", "content": "...", ...}
 */
function parseJsonKnowledge(raw: string): KnowledgeJsonInput {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    const result: KnowledgeJsonInput = {};

    if (parsed.title !== undefined) {
      if (typeof parsed.title !== 'string') throw new Error('title must be a string');
      result.title = parsed.title.trim();
    }
    if (parsed.namespace !== undefined) {
      if (typeof parsed.namespace !== 'string') throw new Error('namespace must be a string');
      result.namespace = parsed.namespace.trim();
    }
    if (parsed.content !== undefined) {
      if (typeof parsed.content !== 'string') throw new Error('content must be a string');
      result.content = parsed.content.trim();
    }
    if (parsed.category !== undefined) {
      if (typeof parsed.category !== 'string') throw new Error('category must be a string');
      result.category = parsed.category.trim();
    }
    if (parsed.source !== undefined) {
      if (typeof parsed.source !== 'string') throw new Error('source must be a string');
      result.source = parsed.source.trim();
    }
    if (parsed.originTicketId !== undefined) {
      if (typeof parsed.originTicketId !== 'string') throw new Error('originTicketId must be a string');
      result.originTicketId = parsed.originTicketId.trim();
    }
    if (parsed.originTicketType !== undefined) {
      if (typeof parsed.originTicketType !== 'string') throw new Error('originTicketType must be a string');
      result.originTicketType = parsed.originTicketType.trim().toLowerCase();
    }
    if (parsed.confidence !== undefined) {
      if (typeof parsed.confidence !== 'number') throw new Error('confidence must be a number');
      result.confidence = parsed.confidence;
    }
    if (parsed.scope !== undefined) {
      if (typeof parsed.scope !== 'string') throw new Error('scope must be a string');
      result.scope = parsed.scope.trim();
    }
    if (parsed.tags !== undefined) {
      if (!Array.isArray(parsed.tags) || !parsed.tags.every((t: unknown) => typeof t === 'string')) {
        throw new Error('tags must be an array of strings');
      }
      result.tags = parsed.tags.map((t: string) => t.trim()).filter(Boolean);
    }
    if (parsed.author !== undefined) {
      if (typeof parsed.author !== 'string') throw new Error('author must be a string');
      result.author = parsed.author.trim();
    }
    if (parsed.branch !== undefined) {
      if (typeof parsed.branch !== 'string') throw new Error('branch must be a string');
      result.branch = parsed.branch.trim();
    }

    return result;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}

export const knowledgeCommand = new Command('knowledge')
  .description('Manage knowledge entries');

// Create subcommand
knowledgeCommand
  .command('create')
  .description('Create a new knowledge entry')
  .option('--stdin', 'Read JSON from stdin')
  .option('--title <title>', 'Knowledge title')
  .option('--content <content>', 'Knowledge content')
  .option('--namespace <namespace>', 'Project namespace (use domain, not "global")')
  .option('--category <category>', 'Category: pattern|truth|principle|architecture')
  .option('--tags <tags...>', 'Tags (kebab-case, intent-aware)')
  .option('--source <source>', 'Source: ticket|discovery|manual', 'manual')
  .option('--origin <ticketId>', 'Origin ticket ID (sets origin-type to ticket)')
  .option('--confidence <n>', 'Confidence 0-1 (0.7-0.8 for patterns, 1.0 for invariants)', '0.8')
  .option('--scope <scope>', 'Decision scope: new-only|backward-compatible|global|legacy-frozen (required)')
  .action(async (options) => {
    try {
      let id: string;
      let title: string;
      let content: string;
      let namespace: string;
      let category: string | null;
      let tags: string[] | null;
      let source: KnowledgeSource;
      let originTicketId: string | null;
      let originTicketType: TicketType | null;
      let confidence: number;
      let scope: string;
      let author: string;
      let branch: string;

      if (options.stdin) {
        const raw = await readStdin();
        const parsed = parseJsonKnowledge(raw);

        // Field-level validation
        const missing: string[] = [];
        if (!parsed.title) missing.push('title: Missing or empty title');
        if (!parsed.namespace) missing.push('namespace: Missing or empty namespace');
        if (!parsed.content) missing.push('content: Missing or empty content');

        // Scope: required and must be valid enum
        if (!parsed.scope) {
          missing.push('scope: Missing scope (new-only|backward-compatible|global|legacy-frozen)');
        } else if (!VALID_SCOPES.includes(parsed.scope as DecisionScope)) {
          missing.push(`scope: Invalid scope '${parsed.scope}'. Must be one of: ${VALID_SCOPES.join(', ')}`);
        }

        // Category: optional, but if provided must be valid
        if (parsed.category !== undefined && !VALID_CATEGORIES.includes(parsed.category as KnowledgeCategory)) {
          missing.push(`category: Invalid category '${parsed.category}'. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
        }

        // Source: optional, but if provided must be valid
        if (parsed.source !== undefined && !VALID_SOURCES.includes(parsed.source as KnowledgeSource)) {
          missing.push(`source: Invalid source '${parsed.source}'. Must be one of: ${VALID_SOURCES.join(', ')}`);
        }

        // Origin ticket type: optional, but if provided must be valid
        if (parsed.originTicketType !== undefined && !VALID_TICKET_TYPES.includes(parsed.originTicketType as TicketType)) {
          missing.push(`originTicketType: Invalid type '${parsed.originTicketType}'. Must be one of: ${VALID_TICKET_TYPES.join(', ')}`);
        }

        if (missing.length > 0) {
          const response: CliResponse = {
            success: false,
            error: missing.join('; '),
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        id = generateId('KNOWLEDGE');
        title = parsed.title!;
        content = parsed.content!;
        namespace = parsed.namespace!;
        category = parsed.category || null;
        tags = parsed.tags || null;
        source = parsed.originTicketId ? 'ticket' : (parsed.source as KnowledgeSource) || 'manual';
        originTicketId = parsed.originTicketId || null;
        originTicketType = (parsed.originTicketType as TicketType) || null;
        confidence = parsed.confidence !== undefined ? clampConfidence(parsed.confidence) : 0.8;
        scope = parsed.scope!;
        author = parsed.author || getGitUsername();
        branch = parsed.branch || getGitBranch();
      } else {
        // Use CLI options
        if (!options.title || !options.namespace || !options.content || !options.scope) {
          const response: CliResponse = {
            success: false,
            error: 'Required: --title, --namespace, --content, --scope (or use --stdin)',
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        id = generateId('KNOWLEDGE');
        title = options.title;
        content = options.content;
        namespace = options.namespace;
        category = options.category || null;
        tags = options.tags || null;
        source = options.origin ? 'ticket' : options.source;
        originTicketId = options.origin || null;
        originTicketType = null;
        confidence = clampConfidence(parseFloat(options.confidence));
        scope = options.scope;
        author = getGitUsername();
        branch = getGitBranch();
      }

      const client = await getClient();
      try {
        // Generate embedding from title + content + tags
        const tagsText = tags?.length ? ' ' + tags.join(' ') : '';
        const textToEmbed = `${title} ${content}${tagsText}`;
        const embedding = await embed(textToEmbed);

        await client.execute({
          sql: `INSERT INTO knowledge (
            id, namespace, chunk_index, title, content, embedding,
            category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
            author, branch
          ) VALUES (?, ?, 0, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          args: [
            id,
            namespace,
            title,
            content,
            JSON.stringify(embedding),
            category,
            tags ? JSON.stringify(tags) : null,
            source,
            originTicketId,
            originTicketType,
            confidence,
            scope,
            author,
            branch,
          ],
        });

        // Bidirectional linking: update ticket's derived_knowledge
        if (originTicketId) {
          const ticketResult = await client.execute({
            sql: 'SELECT derived_knowledge FROM tickets WHERE id = ?',
            args: [originTicketId],
          });
          if (ticketResult.rows.length > 0) {
            const row = ticketResult.rows[0] as Record<string, unknown>;
            const existing = row.derived_knowledge ? JSON.parse(row.derived_knowledge as string) : [];
            existing.push(id);
            await client.execute({
              sql: 'UPDATE tickets SET derived_knowledge = ? WHERE id = ?',
              args: [JSON.stringify(existing), originTicketId],
            });
          }
        }

        const response: CliResponse<{ id: string; namespace: string; source: string; status: string }> = {
          success: true,
          data: { id, namespace, source, status: 'created' },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to create knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Get subcommand
knowledgeCommand
  .command('get')
  .description('Get a knowledge entry by ID')
  .argument('<id>', 'Knowledge ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      let result;
      try {
        result = await client.execute({
          sql: `SELECT id, namespace, chunk_index, title, content,
                category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                usage_count, last_used_at, author, branch, created_at
                FROM knowledge WHERE id = ?`,
          args: [id],
        });
      } finally {
        closeClient();
      }

      if (result.rows.length === 0) {
        const response: CliResponse = {
          success: false,
          error: `Knowledge ${id} not found`,
        };
        console.log(JSON.stringify(response));
        process.exit(1);
      }

      const knowledge = parseKnowledgeRow(result.rows[0] as Record<string, unknown>);

      const response: CliResponse<Knowledge> = {
        success: true,
        data: knowledge,
      };
      console.log(JSON.stringify(response));
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to get knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Preview subcommand — returns formatted markdown for review
knowledgeCommand
  .command('preview')
  .description('Preview a knowledge entry as formatted markdown')
  .argument('<id>', 'Knowledge ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        const result = await client.execute({
          sql: `SELECT id, namespace, chunk_index, title, content,
                category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                usage_count, last_used_at, author, branch, created_at
                FROM knowledge WHERE id = ?`,
          args: [id],
        });

        if (result.rows.length === 0) {
          const response: CliResponse = {
            success: false,
            error: `Knowledge ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const k = parseKnowledgeRow(result.rows[0] as Record<string, unknown>);

        const lines: string[] = [
          `# ${k.title}`,
          '',
          k.content,
        ];

        const response: CliResponse<{ id: string; preview: string }> = {
          success: true,
          data: { id: k.id, preview: lines.join('\n') },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to preview knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// List subcommand
knowledgeCommand
  .command('list')
  .description('List knowledge entries')
  .option('--namespace <namespace>', 'Filter by namespace')
  .option('--category <category>', 'Filter by category')
  .option('--scope <scope>', 'Filter by decision scope (new-only|backward-compatible|global|legacy-frozen)')
  .option('--source <source>', 'Filter by source (ticket|discovery|manual)')
  .option('--author <author>', 'Filter by author')
  .option('--branch <branch>', 'Filter by branch')
  .option('--status <status>', 'Filter by status (active|inactive|all)', 'active')
  .option('--limit <n>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const client = await getClient();
      try {
        const conditions: string[] = [];
        const args: (string | number)[] = [];

        if (options.status === 'active') {
          conditions.push('active = 1');
        } else if (options.status === 'inactive') {
          conditions.push('active = 0');
        }
        // 'all' = no filter on active

        if (options.namespace) {
          conditions.push('namespace = ?');
          args.push(options.namespace);
        }

        if (options.category) {
          conditions.push('category = ?');
          args.push(options.category);
        }

        if (options.scope) {
          conditions.push('decision_scope = ?');
          args.push(options.scope);
        }

        if (options.source) {
          conditions.push('source = ?');
          args.push(options.source);
        }

        if (options.author) {
          conditions.push('author = ?');
          args.push(options.author);
        }

        if (options.branch) {
          conditions.push('branch = ?');
          args.push(options.branch);
        }

        let sql = `SELECT id, namespace, chunk_index, title, content,
                   category, tags, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                   usage_count, last_used_at, author, branch, created_at
                   FROM knowledge`;
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ' ORDER BY created_at DESC LIMIT ?';
        args.push(parseInt(options.limit, 10));

        const result = await client.execute({ sql, args });

        const knowledge = result.rows.map((row) =>
          parseKnowledgeRow(row as Record<string, unknown>)
        );

        const response: CliResponse<Knowledge[]> = {
          success: true,
          data: knowledge,
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to list knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Update subcommand
knowledgeCommand
  .command('update')
  .description('Update a knowledge entry')
  .argument('<id>', 'Knowledge ID')
  .option('--stdin', 'Read JSON updates from stdin')
  .option('--title <title>', 'New title')
  .option('--namespace <namespace>', 'New namespace')
  .option('--category <category>', 'New category')
  .option('--tags <tags...>', 'New tags')
  .option('--origin <ticketId>', 'Origin ticket ID')
  .option('--confidence <n>', 'Confidence score 0-1')
  .option('--scope <scope>', 'Decision scope: new-only|backward-compatible|global|legacy-frozen')
  .option('--comment <comment>', 'Add a comment')
  .option('--author <author>', 'Comment author (default: git user.name)')
  .action(async (id, options) => {
    try {
      const client = await getClient();
      try {
        // Read JSON from stdin
        let stdinParsed: KnowledgeJsonInput | undefined;
        if (options.stdin) {
          const raw = await readStdin();
          stdinParsed = parseJsonKnowledge(raw);
        }

        // Build dynamic update — CLI flags take priority over stdin fields
        const updates: string[] = [];
        const args: (string | number | null)[] = [];
        let contentChanged = false;

        if (options.title || stdinParsed?.title) {
          updates.push('title = ?');
          args.push(options.title || stdinParsed!.title!);
          contentChanged = true;
        }
        if (stdinParsed?.content) {
          updates.push('content = ?');
          args.push(stdinParsed.content);
          contentChanged = true;
        }
        if (options.namespace || stdinParsed?.namespace) {
          updates.push('namespace = ?');
          args.push(options.namespace || stdinParsed!.namespace!);
        }
        if (options.category || stdinParsed?.category) {
          updates.push('category = ?');
          args.push(options.category || stdinParsed!.category!);
        }
        if (options.tags || stdinParsed?.tags?.length) {
          updates.push('tags = ?');
          args.push(JSON.stringify(options.tags || stdinParsed!.tags));
          contentChanged = true;
        }
        if (options.origin || stdinParsed?.originTicketId) {
          updates.push('origin_ticket_id = ?');
          args.push(options.origin || stdinParsed!.originTicketId!);
        }
        if (options.confidence || stdinParsed?.confidence !== undefined) {
          updates.push('confidence = ?');
          const conf = options.confidence
            ? clampConfidence(parseFloat(options.confidence))
            : clampConfidence(stdinParsed!.confidence!);
          args.push(conf);
        }
        if (options.scope || stdinParsed?.scope) {
          updates.push('decision_scope = ?');
          args.push(options.scope || stdinParsed!.scope!);
        }

        // Add comment if provided
        if (options.comment) {
          const commentId = generateId('COMMENT');
          const author = options.author || stdinParsed?.author || getGitUsername();
          await client.execute({
            sql: `INSERT INTO comments (id, parent_type, parent_id, author, text) VALUES (?, ?, ?, ?, ?)`,
            args: [commentId, 'knowledge', id, author, options.comment],
          });
        }

        if (updates.length === 0 && !options.comment) {
          const response: CliResponse = {
            success: false,
            error: 'No fields to update',
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        if (updates.length === 0) {
          // Only a comment was added, no field updates needed
          const response: CliResponse<{ id: string; status: string }> = {
            success: true,
            data: { id, status: 'updated' },
          };
          console.log(JSON.stringify(response));
          return;
        }

        // Re-generate embedding if title, content, or tags changed
        if (contentChanged) {
          const current = await client.execute({
            sql: 'SELECT title, content, tags FROM knowledge WHERE id = ?',
            args: [id],
          });
          if (current.rows.length > 0) {
            const row = current.rows[0] as Record<string, unknown>;
            const newTitle = options.title || stdinParsed?.title || row.title;
            const newContent = stdinParsed?.content || row.content;
            const newTags: string[] = options.tags || stdinParsed?.tags || (row.tags ? JSON.parse(row.tags as string) : []);
            const tagsText = newTags?.length ? ' ' + newTags.join(' ') : '';
            const embedding = await embed(`${newTitle} ${newContent}${tagsText}`);
            updates.push('embedding = vector32(?)');
            args.push(JSON.stringify(embedding));
          }
        }

        updates.push("updated_at = datetime('now')");
        args.push(id);
        const sql = `UPDATE knowledge SET ${updates.join(', ')} WHERE id = ?`;
        const result = await client.execute({ sql, args });

        if (result.rowsAffected === 0) {
          const response: CliResponse = {
            success: false,
            error: `Knowledge ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const response: CliResponse<{ id: string; status: string }> = {
          success: true,
          data: { id, status: 'updated' },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to update knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Deactivate subcommand
knowledgeCommand
  .command('deactivate')
  .description('Mark a knowledge entry as inactive')
  .argument('<id>', 'Knowledge ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        const result = await client.execute({
          sql: 'UPDATE knowledge SET active = 0 WHERE id = ?',
          args: [id],
        });

        if (result.rowsAffected === 0) {
          const response: CliResponse = {
            success: false,
            error: `Knowledge ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const response: CliResponse<{ id: string; status: string }> = {
          success: true,
          data: { id, status: 'deactivated' },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to deactivate knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Activate subcommand
knowledgeCommand
  .command('activate')
  .description('Mark a knowledge entry as active')
  .argument('<id>', 'Knowledge ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        const result = await client.execute({
          sql: 'UPDATE knowledge SET active = 1 WHERE id = ?',
          args: [id],
        });

        if (result.rowsAffected === 0) {
          const response: CliResponse = {
            success: false,
            error: `Knowledge ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const response: CliResponse<{ id: string; status: string }> = {
          success: true,
          data: { id, status: 'activated' },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to activate knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Promote subcommand — set branch to 'main'
knowledgeCommand
  .command('promote')
  .description('Promote a knowledge entry to main branch')
  .argument('<id>', 'Knowledge ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        const result = await client.execute({
          sql: "UPDATE knowledge SET branch = 'main', updated_at = datetime('now') WHERE id = ?",
          args: [id],
        });

        if (result.rowsAffected === 0) {
          const response: CliResponse = {
            success: false,
            error: `Knowledge ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const response: CliResponse<{ id: string; status: string }> = {
          success: true,
          data: { id, status: 'promoted to main' },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to promote knowledge: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Recalculate confidence subcommand
knowledgeCommand
  .command('recalculate')
  .description('Recalculate confidence scores based on usage patterns')
  .option('--dry-run', 'Preview changes without applying')
  .action(async (options) => {
    try {
      const client = await getClient();
      try {
        // Fetch all active knowledge with usage data
        const result = await client.execute({
          sql: `SELECT id, title, confidence, usage_count, last_used_at, created_at
                FROM knowledge WHERE active = 1`,
          args: [],
        });

        const now = new Date();
        const adjustments: {
          id: string;
          title: string;
          oldConfidence: number;
          newConfidence: number;
          reason: string;
        }[] = [];

        for (const row of result.rows) {
          const id = row.id as string;
          const title = row.title as string;
          const currentConfidence = row.confidence as number;
          const usageCount = (row.usage_count as number) || 0;
          const lastUsedAt = row.last_used_at as string | null;
          const createdAt = row.created_at as string;

          let adjustment = 0;
          const reasons: string[] = [];

          // Usage-based growth
          if (usageCount > 10) {
            adjustment += 0.10;
            reasons.push(`high usage (${usageCount}): +0.10`);
          } else if (usageCount > 5) {
            adjustment += 0.05;
            reasons.push(`good usage (${usageCount}): +0.05`);
          }

          // Staleness-based decay
          const referenceDate = lastUsedAt || createdAt;
          if (referenceDate) {
            const daysSince = Math.floor(
              (now.getTime() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24)
            );

            if (daysSince > 180) {
              adjustment -= 0.20;
              reasons.push(`very stale (${daysSince}d): -0.20`);
            } else if (daysSince > 90) {
              adjustment -= 0.10;
              reasons.push(`stale (${daysSince}d): -0.10`);
            }
          }

          // Skip if no adjustment needed
          if (adjustment === 0) continue;

          // Calculate new confidence, clamped between 0.1 and 1.0
          const newConfidence = Math.max(0.1, Math.min(1.0, currentConfidence + adjustment));

          // Skip if no actual change (already at bounds)
          if (Math.abs(newConfidence - currentConfidence) < 0.001) continue;

          adjustments.push({
            id,
            title: title.slice(0, 50),
            oldConfidence: currentConfidence,
            newConfidence: Math.round(newConfidence * 100) / 100,
            reason: reasons.join(', '),
          });

          // Apply update unless dry-run
          if (!options.dryRun) {
            await client.execute({
              sql: 'UPDATE knowledge SET confidence = ? WHERE id = ?',
              args: [newConfidence, id],
            });
          }
        }

        const response: CliResponse<{
          dryRun: boolean;
          total: number;
          adjusted: number;
          adjustments: typeof adjustments;
        }> = {
          success: true,
          data: {
            dryRun: !!options.dryRun,
            total: result.rows.length,
            adjusted: adjustments.length,
            adjustments,
          },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to recalculate confidence: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

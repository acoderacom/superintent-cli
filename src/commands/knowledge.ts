import { Command } from 'commander';
import { getClient, closeClient } from '../db/client.js';
import { parseKnowledgeRow, parseTicketRow } from '../db/parsers.js';
import { performVectorSearch } from '../db/search.js';
import { embed } from '../embed/model.js';

import { generateId } from '../utils/id.js';
import { getProjectNamespace } from '../utils/config.js';
import { getGitUsername, getGitBranch } from '../utils/git.js';
import { validateCitation, computeContentHash } from '../utils/hash.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateExtractProposals } from './ticket.js';
import type { Knowledge, SearchResult, KnowledgeInput, CliResponse, KnowledgeCategory, DecisionScope, KnowledgeSource, TicketType, TicketPlan, Citation } from '../types.js';

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
  citations?: Citation[];
  author?: string;
  branch?: string;
}

/**
 * Parse JSON knowledge input.
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
    if (parsed.citations !== undefined) {
      if (!Array.isArray(parsed.citations)) {
        throw new Error('citations must be an array');
      }
      const fileHashCache = new Map<string, string>();
      const cwd = process.cwd();
      result.citations = parsed.citations.map((c: unknown, i: number) => {
        if (typeof c !== 'object' || c === null) {
          throw new Error(`citations[${i}] must be an object`);
        }
        const citation = c as Record<string, unknown>;
        if (typeof citation.path !== 'string' || !citation.path.trim()) {
          throw new Error(`citations[${i}].path must be a non-empty string`);
        }
        const citationPath = (citation.path as string).trim();

        // Auto-compute fileHash from file path if omitted
        let fileHash: string;
        if (typeof citation.fileHash === 'string' && citation.fileHash.trim()) {
          fileHash = citation.fileHash.trim();
        } else {
          // Validate line number as navigation hint
          const colonIdx = citationPath.lastIndexOf(':');
          if (colonIdx === -1) {
            throw new Error(`citations[${i}].path must be file:line format`);
          }
          const filePath = citationPath.slice(0, colonIdx);
          const lineNum = parseInt(citationPath.slice(colonIdx + 1), 10);
          if (isNaN(lineNum) || lineNum < 1) {
            throw new Error(`citations[${i}].path has invalid line number`);
          }

          // Hash entire file (cached per file path)
          let cached = fileHashCache.get(filePath);
          if (cached === undefined) {
            try {
              const absPath = resolve(cwd, filePath);
              const content = readFileSync(absPath, 'utf-8');
              cached = computeContentHash(content);
              fileHashCache.set(filePath, cached);
            } catch {
              throw new Error(`citations[${i}]: file not found: ${filePath}`);
            }
          }
          fileHash = cached;
        }

        return { path: citationPath, fileHash };
      });
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
      throw new Error(`Invalid JSON: ${error.message}`, { cause: error });
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
  .option('--json <data>', 'JSON input')
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
      let citations: Citation[] | null;
      let source: KnowledgeSource;
      let originTicketId: string | null;
      let originTicketType: TicketType | null;
      let confidence: number;
      let scope: string;
      let author: string;
      let branch: string;

      if (options.json) {
        const raw = options.json;
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
        citations = parsed.citations?.length ? parsed.citations : null;
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
            error: 'Required: --title, --namespace, --content, --scope (or use --json)',
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
        citations = null;
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
            category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
            author, branch
          ) VALUES (?, ?, 0, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          args: [
            id,
            namespace,
            title,
            content,
            JSON.stringify(embedding),
            category,
            tags ? JSON.stringify(tags) : null,
            citations ? JSON.stringify(citations) : null,
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
                category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
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
                category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
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
  .option('--branch-auto', 'Filter by main + current git branch together')
  .option('--status <status>', 'Filter by status (active|inactive|all)', 'active')
  .option('--limit <n>', 'Limit results', '20')
  .option('--offset <n>', 'Skip results (for pagination)', '0')
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

        if (options.branchAuto) {
          const current = getGitBranch();
          if (current === 'main') {
            conditions.push('branch = ?');
            args.push('main');
          } else {
            conditions.push('branch IN (?, ?)');
            args.push('main', current);
          }
        } else if (options.branch) {
          conditions.push('branch = ?');
          args.push(options.branch);
        }

        let sql = `SELECT id, namespace, chunk_index, title, content,
                   category, tags, citations, source, origin_ticket_id, origin_ticket_type, confidence, active, decision_scope,
                   usage_count, last_used_at, author, branch, created_at
                   FROM knowledge`;
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        args.push(parseInt(options.limit, 10));
        args.push(parseInt(options.offset, 10));

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
  .option('--json <data>', 'JSON input')
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
        // Read JSON from --json flag
        let jsonParsed: KnowledgeJsonInput | undefined;
        if (options.json) {
          const raw = options.json;
          jsonParsed = parseJsonKnowledge(raw);
        }

        // Build dynamic update — CLI flags take priority over JSON fields
        const updates: string[] = [];
        const args: (string | number | null)[] = [];
        let contentChanged = false;

        if (options.title || jsonParsed?.title) {
          updates.push('title = ?');
          args.push(options.title || jsonParsed!.title!);
          contentChanged = true;
        }
        if (jsonParsed?.content) {
          updates.push('content = ?');
          args.push(jsonParsed.content);
          contentChanged = true;
        }
        if (options.namespace || jsonParsed?.namespace) {
          updates.push('namespace = ?');
          args.push(options.namespace || jsonParsed!.namespace!);
        }
        if (options.category || jsonParsed?.category) {
          updates.push('category = ?');
          args.push(options.category || jsonParsed!.category!);
        }
        if (options.tags || jsonParsed?.tags?.length) {
          updates.push('tags = ?');
          args.push(JSON.stringify(options.tags || jsonParsed!.tags));
          contentChanged = true;
        }
        if (jsonParsed?.citations !== undefined) {
          updates.push('citations = ?');
          args.push(jsonParsed.citations.length > 0 ? JSON.stringify(jsonParsed.citations) : null);
        }
        if (options.origin || jsonParsed?.originTicketId) {
          updates.push('origin_ticket_id = ?');
          args.push(options.origin || jsonParsed!.originTicketId!);
        }
        if (options.confidence || jsonParsed?.confidence !== undefined) {
          updates.push('confidence = ?');
          const conf = options.confidence
            ? clampConfidence(parseFloat(options.confidence))
            : clampConfidence(jsonParsed!.confidence!);
          args.push(conf);
        }
        if (options.scope || jsonParsed?.scope) {
          const scopeValue = options.scope || jsonParsed!.scope!;
          if (!VALID_SCOPES.includes(scopeValue as DecisionScope)) {
            const response: CliResponse = {
              success: false,
              error: `Invalid scope '${scopeValue}'. Must be one of: ${VALID_SCOPES.join(', ')}`,
            };
            console.log(JSON.stringify(response));
            process.exit(1);
          }
          updates.push('decision_scope = ?');
          args.push(scopeValue);
        }

        // Add comment if provided
        if (options.comment) {
          const commentId = generateId('COMMENT');
          const author = options.author || jsonParsed?.author || getGitUsername();
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
            const newTitle = options.title || jsonParsed?.title || row.title;
            const newContent = jsonParsed?.content || row.content;
            const newTags: string[] = options.tags || jsonParsed?.tags || (row.tags ? JSON.parse(row.tags as string) : []);
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

// Validate citations subcommand
knowledgeCommand
  .command('validate')
  .description('Validate knowledge citations against the filesystem')
  .argument('[id]', 'Knowledge ID or comma-separated IDs (or use --all/--main)')
  .option('--all', 'Validate all active entries with citations')
  .option('--main', 'Validate main branch entries with citations')
  .option('--dry-run', 'Preview only, no side effects')
  .action(async (id: string | undefined, options: Record<string, unknown>) => {
    try {
      if (!id && !options.all && !options.main) {
        const response: CliResponse = {
          success: false,
          error: 'Provide a knowledge ID or use --all or --main',
        };
        console.log(JSON.stringify(response));
        process.exit(1);
      }

      const client = await getClient();
      try {
        let rows;
        if (id) {
          const ids = id.split(',').map((s) => s.trim()).filter(Boolean);
          const placeholders = ids.map(() => '?').join(', ');
          const result = await client.execute({
            sql: `SELECT id, title, citations FROM knowledge WHERE id IN (${placeholders})`,
            args: ids,
          });
          if (result.rows.length === 0) {
            const response: CliResponse = {
              success: false,
              error: `Knowledge not found: ${ids.join(', ')}`,
            };
            console.log(JSON.stringify(response));
            process.exit(1);
          }
          const foundIds = new Set(result.rows.map((r) => r.id as string));
          const notFound = ids.filter((i) => !foundIds.has(i));
          if (notFound.length > 0) {
            const response: CliResponse = {
              success: false,
              error: `Knowledge not found: ${notFound.join(', ')}`,
            };
            console.log(JSON.stringify(response));
            process.exit(1);
          }
          rows = result.rows;
        } else {
          const sql = options.main
            ? "SELECT id, title, citations FROM knowledge WHERE active = 1 AND citations IS NOT NULL AND branch = 'main'"
            : 'SELECT id, title, citations FROM knowledge WHERE active = 1 AND citations IS NOT NULL';
          const result = await client.execute({ sql, args: [] });
          rows = result.rows;
        }

        const cwd = process.cwd();
        const fileHashCache = new Map<string, string | null>();
        const entries: {
          id: string;
          title: string;
          total: number;
          valid: number;
          changed: number;
          missing: number;
          details: { path: string; status: string; currentFileHash?: string }[];
        }[] = [];
        let uncited = 0;

        for (const row of rows) {
          const entryId = row.id as string;
          const title = row.title as string;
          const citationsRaw = row.citations as string | null;

          if (!citationsRaw) {
            uncited++;
            continue;
          }

          const citations: Citation[] = JSON.parse(citationsRaw);
          if (citations.length === 0) {
            uncited++;
            continue;
          }

          const details = citations.map((c) => validateCitation(c, cwd, fileHashCache));
          const valid = details.filter((d) => d.status === 'valid').length;
          const changed = details.filter((d) => d.status === 'changed').length;
          const missing = details.filter((d) => d.status === 'missing').length;

          entries.push({
            id: entryId,
            title: title.slice(0, 60),
            total: citations.length,
            valid,
            changed,
            missing,
            details,
          });
        }

        const response: CliResponse<{
          validated: number;
          uncited: number;
          entries: typeof entries;
        }> = {
          success: true,
          data: {
            validated: entries.length,
            uncited,
            entries,
          },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to validate citations: ${(error as Error).message}`,
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
        // Fetch all active knowledge with usage data and citations
        const result = await client.execute({
          sql: `SELECT id, title, category, confidence, usage_count, last_used_at, citations, created_at
                FROM knowledge WHERE active = 1`,
          args: [],
        });

        const cwd = process.cwd();
        const fileHashCache = new Map<string, string | null>();

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
          const category = row.category as string;
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

          // Staleness-based decay — reduced for stable categories
          const slowDecay = category === 'truth' || category === 'architecture';
          const referenceDate = lastUsedAt || createdAt;
          if (referenceDate) {
            const daysSince = Math.floor(
              (now.getTime() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24)
            );

            if (daysSince > 180) {
              const penalty = slowDecay ? 0.05 : 0.20;
              adjustment -= penalty;
              reasons.push(`very stale (${daysSince}d): -${penalty.toFixed(2)}`);
            } else if (daysSince > 90) {
              const penalty = slowDecay ? 0.02 : 0.10;
              adjustment -= penalty;
              reasons.push(`stale (${daysSince}d): -${penalty.toFixed(2)}`);
            }
          }

          // Citation penalty — only missing files (deleted source) affect confidence
          const citationsRaw = row.citations as string | null;
          if (citationsRaw) {
            const citations: Citation[] = JSON.parse(citationsRaw);
            if (citations.length > 0) {
              const results = citations.map((c) => validateCitation(c, cwd, fileHashCache));
              const missingCount = results.filter((r) => r.status === 'missing').length;
              if (missingCount > 0) {
                const citationPenalty = -(missingCount / citations.length) * 0.15;
                adjustment += citationPenalty;
                reasons.push(`citations ${missingCount}/${citations.length} missing: ${citationPenalty.toFixed(2)}`);
              }
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

// Search subcommand
knowledgeCommand
  .command('search')
  .description('Semantic search knowledge base')
  .argument('<query>', 'Search query')
  .option('--namespace <namespace>', 'Filter by namespace (project)')
  .option('--category <category>', 'Filter by category')
  .option('--ticket-type <type>', 'Filter by origin ticket type (feature|bugfix|refactor|docs|chore|test)')
  .option('--tags <tags...>', 'Filter by tags (OR logic)')
  .option('--author <author>', 'Filter by author')
  .option('--branch <branch>', 'Filter by branch')
  .option('--branch-auto', 'Search main + current git branch together')
  .option('--min-score <n>', 'Minimum similarity score 0-1', '0')
  .option('--limit <n>', 'Max results', '5')
  .action(async (query: string, options: Record<string, string | string[]>) => {
    try {
      const client = await getClient();
      try {
        const queryEmbedding = await embed(query, true);

        let branches: string[] | undefined;
        if (options.branchAuto) {
          const current = getGitBranch();
          branches = current === 'main' ? ['main'] : ['main', current];
        }

        const results = await performVectorSearch(client, queryEmbedding, {
          namespace: options.namespace as string | undefined,
          category: options.category as string | undefined,
          ticketType: options.ticketType as string | undefined,
          tags: options.tags as string[] | undefined,
          author: options.author as string | undefined,
          branch: options.branchAuto ? undefined : options.branch as string | undefined,
          branches,
          minScore: parseFloat(options.minScore as string),
          limit: parseInt(options.limit as string, 10),
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

// Extract subcommand
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

knowledgeCommand
  .command('extract')
  .description('Extract knowledge from a completed ticket')
  .argument('<ticket-id>', 'Ticket ID to extract knowledge from')
  .option('--namespace <namespace>', 'Override namespace (default: derived from ticket)')
  .action(async (ticketId: string, options: Record<string, string>) => {
    try {
      const client = await getClient();
      let result;
      try {
        result = await client.execute({
          sql: 'SELECT * FROM tickets WHERE id = ?',
          args: [ticketId],
        });
      } finally {
        closeClient();
      }

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

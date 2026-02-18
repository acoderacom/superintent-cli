import { Command } from 'commander';
import { getClient, closeClient } from '../db/client.js';
import { parseSpecRow } from '../db/parsers.js';
import { readStdin } from '../utils/io.js';
import { generateId } from '../utils/id.js';
import { getGitUsername } from '../utils/git.js';
import type { Spec, CliResponse } from '../types.js';

interface SpecInput {
  title?: string;
  content?: string;
  author?: string;
}

/**
 * Parse JSON spec input from stdin.
 * Expected format: {"title": "...", "content": "...", "author": "..."}
 */
function parseJsonSpec(raw: string): SpecInput {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    const result: SpecInput = {};
    if (parsed.title !== undefined) {
      if (typeof parsed.title !== 'string') throw new Error('title must be a string');
      result.title = parsed.title.trim();
    }
    if (parsed.content !== undefined) {
      if (typeof parsed.content !== 'string') throw new Error('content must be a string');
      result.content = parsed.content.trim();
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

export const specCommand = new Command('spec')
  .description('Manage specs');

// Create subcommand
specCommand
  .command('create')
  .description('Create a new spec from JSON stdin')
  .option('--stdin', 'Read spec JSON from stdin')
  .option('--title <title>', 'Spec title')
  .option('--content <content>', 'Spec content')
  .option('--author <author>', 'Author (default: git user.name)')
  .action(async (options) => {
    try {
      let id: string;
      let title: string;
      let content: string;
      let author: string | undefined;

      if (options.stdin) {
        const raw = await readStdin();
        const parsed = parseJsonSpec(raw);

        // Field-level validation
        const missing: string[] = [];
        if (!parsed.title) missing.push('title: Missing or empty title');
        if (!parsed.content) missing.push('content: Missing or empty content');
        if (missing.length > 0) {
          const response: CliResponse = {
            success: false,
            error: missing.join('; '),
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        id = generateId('SPEC');
        title = parsed.title!;
        content = parsed.content!;
        author = parsed.author;
      } else {
        if (!options.title) {
          const response: CliResponse = {
            success: false,
            error: 'Required: --title (or use --stdin)',
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        id = generateId('SPEC');
        title = options.title;
        content = options.content || '';
      }

      const finalAuthor = author || options.author || getGitUsername();
      const client = await getClient();
      try {
        await client.execute({
          sql: `INSERT INTO specs (id, title, content, author) VALUES (?, ?, ?, ?)`,
          args: [id, title, content, finalAuthor],
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
        error: `Failed to create spec: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Get subcommand
specCommand
  .command('get')
  .description('Get a spec by ID')
  .argument('<id>', 'Spec ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      let result;
      try {
        result = await client.execute({
          sql: 'SELECT * FROM specs WHERE id = ?',
          args: [id],
        });
      } finally {
        closeClient();
      }

      if (result.rows.length === 0) {
        const response: CliResponse = {
          success: false,
          error: `Spec ${id} not found`,
        };
        console.log(JSON.stringify(response));
        process.exit(1);
      }

      const spec = parseSpecRow(result.rows[0] as Record<string, unknown>);

      const response: CliResponse<Spec> = {
        success: true,
        data: spec,
      };
      console.log(JSON.stringify(response));
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to get spec: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Preview subcommand — returns formatted markdown for review
specCommand
  .command('preview')
  .description('Preview a spec as formatted markdown')
  .argument('<id>', 'Spec ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        const result = await client.execute({
          sql: 'SELECT * FROM specs WHERE id = ?',
          args: [id],
        });

        if (result.rows.length === 0) {
          const response: CliResponse = {
            success: false,
            error: `Spec ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        const spec = parseSpecRow(result.rows[0] as Record<string, unknown>);

        const lines: string[] = [
          `# ${spec.title}`,
          '',
          spec.content,
        ];

        const response: CliResponse<{ id: string; preview: string }> = {
          success: true,
          data: { id: spec.id, preview: lines.join('\n') },
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to preview spec: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// List subcommand
specCommand
  .command('list')
  .description('List specs')
  .option('--limit <n>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const client = await getClient();
      try {
        const result = await client.execute({
          sql: 'SELECT * FROM specs ORDER BY created_at DESC LIMIT ?',
          args: [parseInt(options.limit, 10)],
        });

        const specs = result.rows.map((row) =>
          parseSpecRow(row as Record<string, unknown>)
        );

        const response: CliResponse<Spec[]> = {
          success: true,
          data: specs,
        };
        console.log(JSON.stringify(response));
      } finally {
        closeClient();
      }
    } catch (error) {
      const response: CliResponse = {
        success: false,
        error: `Failed to list specs: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Update subcommand
specCommand
  .command('update')
  .description('Update a spec')
  .argument('<id>', 'Spec ID')
  .option('--stdin', 'Read JSON updates from stdin')
  .option('--title <title>', 'New title')
  .option('--comment <comment>', 'Add a comment')
  .option('--author <author>', 'Comment author (default: git user.name)')
  .action(async (id, options) => {
    try {
      const client = await getClient();
      try {
        const updates: string[] = [];
        const args: (string | number)[] = [];

        // Read JSON from stdin
        let stdinParsed: SpecInput | undefined;
        if (options.stdin) {
          const raw = await readStdin();
          stdinParsed = parseJsonSpec(raw);
        }

        if (options.title || stdinParsed?.title) {
          updates.push('title = ?');
          args.push(options.title || stdinParsed!.title!);
        }
        if (stdinParsed?.content) {
          updates.push('content = ?');
          args.push(stdinParsed.content);
        }

        // Add comment if provided
        if (options.comment) {
          const commentId = generateId('COMMENT');
          const author = options.author || stdinParsed?.author || getGitUsername();
          await client.execute({
            sql: `INSERT INTO comments (id, parent_type, parent_id, author, text) VALUES (?, ?, ?, ?, ?)`,
            args: [commentId, 'spec', id, author, options.comment],
          });
        }

        if (updates.length === 0 && !options.comment) {
          const response: CliResponse = {
            success: false,
            error: 'No updates provided. Use --stdin, --title, or --comment',
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        if (updates.length === 0) {
          // Only a comment was added
          const response: CliResponse<{ id: string; status: string }> = {
            success: true,
            data: { id, status: 'updated' },
          };
          console.log(JSON.stringify(response));
          return;
        }

        updates.push("updated_at = datetime('now')");
        args.push(id);

        const result = await client.execute({
          sql: `UPDATE specs SET ${updates.join(', ')} WHERE id = ?`,
          args,
        });

        if (result.rowsAffected === 0) {
          const response: CliResponse = {
            success: false,
            error: `Spec ${id} not found`,
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
        error: `Failed to update spec: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

// Delete subcommand
specCommand
  .command('delete')
  .description('Delete a spec by ID')
  .argument('<id>', 'Spec ID')
  .action(async (id) => {
    try {
      const client = await getClient();
      try {
        const existing = await client.execute({
          sql: 'SELECT id FROM specs WHERE id = ?',
          args: [id],
        });

        if (existing.rows.length === 0) {
          const response: CliResponse = {
            success: false,
            error: `Spec ${id} not found`,
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        await client.execute({
          sql: 'DELETE FROM specs WHERE id = ?',
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
        error: `Failed to delete spec: ${(error as Error).message}`,
      };
      console.log(JSON.stringify(response));
      process.exit(1);
    }
  });

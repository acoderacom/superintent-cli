import { Command } from 'commander';
import { getClient, closeClient } from '../db/client.js';
import { parseSpecRow } from '../db/parsers.js';
import { readStdin } from '../utils/io.js';
import { generateId } from '../utils/id.js';
import { getGitUsername } from '../utils/git.js';
import type { Spec, CliResponse } from '../types.js';

interface ParsedSpec {
  title: string;
  content: string;
}

/**
 * Parse markdown spec format matching SKILL.md:
 *
 * # {spec name}
 *
 * ## Summary
 * ...rest of spec content...
 */
function parseMarkdownSpec(markdown: string): ParsedSpec {
  const lines = markdown.split('\n');
  const result: ParsedSpec = { title: '', content: '' };

  let contentStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Parse title: # {spec name}
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      result.title = trimmed.substring(2).trim();
      contentStartIndex = i + 1;
      break;
    }
  }

  // Everything after the title line is content
  result.content = lines.slice(contentStartIndex).join('\n').trim();

  return result;
}

export const specCommand = new Command('spec')
  .description('Manage specs');

// Create subcommand
specCommand
  .command('create')
  .description('Create a new spec from stdin')
  .option('--stdin', 'Read spec markdown from stdin')
  .option('--title <title>', 'Spec title')
  .option('--content <content>', 'Spec content')
  .action(async (options) => {
    try {
      let id: string;
      let title: string;
      let content: string;

      if (options.stdin) {
        const markdown = await readStdin();
        const parsed = parseMarkdownSpec(markdown);

        // Field-level validation
        const missing: string[] = [];
        if (!parsed.title) missing.push('title: Missing # Title header');
        if (!parsed.content) missing.push('content: No content found after header');
        if (missing.length > 0) {
          const response: CliResponse = {
            success: false,
            error: missing.join('; '),
          };
          console.log(JSON.stringify(response));
          process.exit(1);
        }

        id = generateId('SPEC');
        title = parsed.title;
        content = parsed.content;
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

      const client = await getClient();
      try {
        await client.execute({
          sql: `INSERT INTO specs (id, title, content) VALUES (?, ?, ?)`,
          args: [id, title, content],
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
  .option('--title <title>', 'New title')
  .option('--content-stdin', 'Read new content from stdin')
  .option('--comment <comment>', 'Add a comment')
  .option('--author <author>', 'Comment author (default: git user.name)')
  .action(async (id, options) => {
    try {
      const client = await getClient();
      try {
        const updates: string[] = [];
        const args: (string | number)[] = [];

        // Read stdin — parse as full spec markdown if it has a # title
        let stdinParsed: ParsedSpec | undefined;
        if (options.contentStdin) {
          const raw = await readStdin();
          const parsed = parseMarkdownSpec(raw);
          if (parsed.title) {
            stdinParsed = parsed;
          } else {
            // Plain content text (no title header)
            updates.push('content = ?');
            args.push(raw.trim());
          }
        }

        if (options.title) {
          updates.push('title = ?');
          args.push(options.title);
        } else if (stdinParsed?.title) {
          updates.push('title = ?');
          args.push(stdinParsed.title);
        }
        if (stdinParsed?.content) {
          updates.push('content = ?');
          args.push(stdinParsed.content);
        }

        // Add comment if provided
        if (options.comment) {
          const commentId = generateId('COMMENT');
          const author = options.author || getGitUsername();
          await client.execute({
            sql: `INSERT INTO comments (id, parent_type, parent_id, author, text) VALUES (?, ?, ?, ?, ?)`,
            args: [commentId, 'spec', id, author, options.comment],
          });
        }

        if (updates.length === 0 && !options.comment) {
          const response: CliResponse = {
            success: false,
            error: 'No updates provided. Use --title, --content-stdin, or --comment',
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

// Knowledge-to-code matching engine
// Three-tier strategy: tag match → content match → vector match (cheapest first)

import type { Client } from '@libsql/client';
import type { ASTFileResult, ASTFunction, ASTClass } from './scanner.js';
import { embed } from '../embed/model.js';
import { performVectorSearch } from '../db/search.js';
import { generateId } from '../utils/id.js';

export interface WikiCitation {
  id: string;
  wiki_page_id: string;
  knowledge_id: string;
  function_name: string;
  start_line: number;
  end_line: number;
  match_type: 'tag' | 'content' | 'vector';
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

// Build a summary string for vector matching
export function buildCodeElementSummary(file: ASTFileResult, element: ASTFunction | ASTClass): string {
  const kind = 'methods' in element ? 'class' : element.kind;
  const params = 'params' in element ? `(${element.params.join(', ')})` : '';
  return `${kind} ${element.name}${params} in ${file.relativePath}`;
}

// Tokenize text into significant tokens (>3 chars, lowercase)
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3)
  );
}

// Load all active knowledge entries for matching
async function loadKnowledgeEntries(client: Client): Promise<KnowledgeEntry[]> {
  const result = await client.execute({
    sql: "SELECT id, title, content, tags FROM knowledge WHERE active = 1 AND branch = 'main'",
    args: [],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    tags: row.tags ? (row.tags as string).split(',').map(t => t.trim()).filter(Boolean) : [],
  }));
}

// Tier 1: Tag match — compare knowledge tags against element name (case-insensitive)
function tagMatch(elementName: string, entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const nameLC = elementName.toLowerCase();
  return entries.filter(entry =>
    entry.tags.some(tag => tag.toLowerCase() === nameLC)
  );
}

// Tier 2: Content match — tokenize knowledge title+content, compare overlap with element name
function contentMatch(elementName: string, entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const nameTokens = tokenize(elementName);
  if (nameTokens.size === 0) return [];

  return entries.filter(entry => {
    const entryTokens = tokenize(entry.title + ' ' + entry.content);
    let overlap = 0;
    for (const token of nameTokens) {
      if (entryTokens.has(token)) overlap++;
    }
    return overlap / nameTokens.size >= 0.3;
  });
}

// Match knowledge to a single file's code elements
export async function matchKnowledgeToFile(
  client: Client,
  file: ASTFileResult,
  wikiPageId: string,
  knowledgeEntries: KnowledgeEntry[],
): Promise<WikiCitation[]> {
  const citations: WikiCitation[] = [];

  // Collect all code elements (functions + classes)
  interface CodeElement { name: string; line: number; endLine: number; isClass: boolean }
  const elements: CodeElement[] = [];

  for (const fn of file.functions) {
    elements.push({ name: fn.name, line: fn.line, endLine: fn.endLine, isClass: false });
  }
  for (const cls of file.classes) {
    elements.push({ name: cls.name, line: cls.line, endLine: cls.endLine, isClass: true });
  }

  if (elements.length === 0 || knowledgeEntries.length === 0) return citations;

  for (const el of elements) {
    // Tier 1: Tag match
    const tagMatches = tagMatch(el.name, knowledgeEntries);
    if (tagMatches.length > 0) {
      for (const entry of tagMatches) {
        citations.push({
          id: generateId('WCITE'),
          wiki_page_id: wikiPageId,
          knowledge_id: entry.id,
          function_name: el.name,
          start_line: el.line,
          end_line: el.endLine,
          match_type: 'tag',
        });
      }
      continue;
    }

    // Tier 2: Content match
    const contentMatches = contentMatch(el.name, knowledgeEntries);
    if (contentMatches.length > 0) {
      for (const entry of contentMatches) {
        citations.push({
          id: generateId('WCITE'),
          wiki_page_id: wikiPageId,
          knowledge_id: entry.id,
          function_name: el.name,
          start_line: el.line,
          end_line: el.endLine,
          match_type: 'content',
        });
      }
      continue;
    }

    // Tier 3: Vector match (expensive — only for unmatched elements)
    try {
      const source = el.isClass
        ? file.classes.find(c => c.name === el.name && c.line === el.line)!
        : file.functions.find(f => f.name === el.name && f.line === el.line)!;
      const summary = buildCodeElementSummary(file, source);
      const queryEmbedding = await embed(summary, true);
      const vectorResults = await performVectorSearch(client, queryEmbedding, {
        limit: 3,
        minScore: 0.45,
        trackUsage: false,
      });

      for (const result of vectorResults) {
        citations.push({
          id: generateId('WCITE'),
          wiki_page_id: wikiPageId,
          knowledge_id: result.id,
          function_name: el.name,
          start_line: el.line,
          end_line: el.endLine,
          match_type: 'vector',
        });
      }
    } catch {
      // Vector search failed — skip this element
    }
  }

  return citations;
}

// Match knowledge to all files in a scan result
export async function matchKnowledgeToProject(
  client: Client,
  files: ASTFileResult[],
  pageIdMap: Map<string, string>,
): Promise<WikiCitation[]> {
  const knowledgeEntries = await loadKnowledgeEntries(client);
  if (knowledgeEntries.length === 0) return [];

  const allCitations: WikiCitation[] = [];

  for (const file of files) {
    const wikiPageId = pageIdMap.get(file.relativePath);
    if (!wikiPageId) continue;

    const fileCitations = await matchKnowledgeToFile(client, file, wikiPageId, knowledgeEntries);
    allCitations.push(...fileCitations);
  }

  return allCitations;
}

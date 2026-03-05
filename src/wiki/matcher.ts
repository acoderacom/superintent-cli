// Knowledge-to-code matching engine
// Three-tier strategy: tag match → content match → vector match (cheapest first)

import type { Client } from '@libsql/client';
import { performVectorSearch } from '../db/search.js';
import { embed } from '../embed/model.js';
import { generateId } from '../utils/id.js';
import type { ASTClass, ASTFileResult, ASTFunction } from './scanner.js';

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
  citations: { path: string }[];
}

// Check if a knowledge entry cites a specific file (optionally near a line range)
function entryCitesFile(
  entry: KnowledgeEntry,
  filePath: string,
  lineRange?: { start: number; end: number; proximity: number },
): boolean {
  if (entry.citations.length === 0) return false;
  return entry.citations.some((c) => {
    const colonIdx = c.path.lastIndexOf(':');
    const citedFile = colonIdx > 0 ? c.path.slice(0, colonIdx) : c.path;
    if (citedFile !== filePath) return false;
    if (!lineRange) return true;
    if (colonIdx <= 0) return true;
    const citedLine = parseInt(c.path.slice(colonIdx + 1), 10);
    if (Number.isNaN(citedLine) || citedLine <= 1) return false; // whole-file citation, no line proximity
    return citedLine >= lineRange.start - lineRange.proximity && citedLine <= lineRange.end + lineRange.proximity;
  });
}

// Check if entry has citations but none point to a given file
function entryCitesOtherFiles(entry: KnowledgeEntry, filePath: string): boolean {
  if (entry.citations.length === 0) return false;
  return !entry.citations.some((c) => {
    const colonIdx = c.path.lastIndexOf(':');
    const citedFile = colonIdx > 0 ? c.path.slice(0, colonIdx) : c.path;
    return citedFile === filePath;
  });
}

// Build a summary string for vector matching
export function buildCodeElementSummary(file: ASTFileResult, element: ASTFunction | ASTClass): string {
  if ('methods' in element) return `class ${element.name} in ${file.relativePath}`;
  const params = `(${element.params.join(', ')})`;
  return `${element.kind} ${element.name}${params} in ${file.relativePath}`;
}

// Common code tokens that appear in many function names but carry no semantic meaning
const CODE_STOPWORDS = new Set([
  'get', 'set', 'has', 'can', 'did', 'will', 'should',
  'create', 'make', 'build', 'init', 'setup',
  'update', 'delete', 'remove', 'add', 'insert',
  'find', 'search', 'filter', 'map', 'reduce',
  'load', 'save', 'read', 'write', 'fetch', 'send',
  'parse', 'format', 'render', 'display', 'show', 'hide',
  'handle', 'process', 'run', 'exec', 'call',
  'check', 'test', 'verify', 'assert',
  'start', 'stop', 'open', 'close', 'reset', 'clear',
  'from', 'into', 'with', 'data', 'item', 'list', 'result',
  'error', 'value', 'index', 'count', 'name', 'type', 'status',
]);

// Split camelCase/PascalCase/snake_case into sub-words, then tokenize (>2 chars, lowercase)
// When isElementName=true, filters out common code stopwords to reduce false matches
function tokenize(text: string, isElementName = false): Set<string> {
  // Split camelCase boundaries: "clampConfidence" → "clamp Confidence"
  const expanded = text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return new Set(
    expanded
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && (!isElementName || !CODE_STOPWORDS.has(t))),
  );
}

// Build inverse document frequency map — tokens in many entries get lower weight
function buildIDF(entries: KnowledgeEntry[], entryTokenCache: Map<string, Set<string>>): Map<string, number> {
  const docFreq = new Map<string, number>();
  for (const entry of entries) {
    let tokens = entryTokenCache.get(entry.id);
    if (!tokens) {
      tokens = tokenize(`${entry.title} ${entry.content}`);
      entryTokenCache.set(entry.id, tokens);
    }
    for (const token of tokens) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }
  const N = entries.length;
  const idf = new Map<string, number>();
  for (const [token, df] of docFreq) {
    idf.set(token, Math.log(N / df));
  }
  return idf;
}

// Load all active knowledge entries for matching
async function loadKnowledgeEntries(client: Client): Promise<KnowledgeEntry[]> {
  const result = await client.execute({
    sql: "SELECT id, title, content, tags, citations FROM knowledge WHERE active = 1 AND branch = 'main'",
    args: [],
  });

  return result.rows.map((row) => {
    let citations: { path: string }[] = [];
    if (row.citations) {
      try {
        citations = JSON.parse(row.citations as string);
      } catch { /* malformed */ }
    }
    return {
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      tags: row.tags
        ? (row.tags as string)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      citations,
    };
  });
}

// Tier 1: Tag match — compare knowledge tags against element name (case-insensitive)
function tagMatch(elementName: string, entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const nameLC = elementName.toLowerCase();
  return entries.filter((entry) => entry.tags.some((tag) => tag.toLowerCase() === nameLC));
}

// Tier 2: Content match — IDF-weighted overlap with minimum absolute match requirement
const CONTENT_MIN_RAW_MATCHES = 2;
const CONTENT_SCORE_THRESHOLD = 0.35;

function contentMatch(
  elementName: string,
  filePath: string,
  elementLine: number,
  elementEndLine: number,
  entries: KnowledgeEntry[],
  entryTokenCache: Map<string, Set<string>>,
  idf: Map<string, number>,
): KnowledgeEntry[] {
  const nameTokens = tokenize(elementName, true);
  if (nameTokens.size < CONTENT_MIN_RAW_MATCHES) return [];

  // Pre-compute max possible IDF score for this element name
  let maxScore = 0;
  for (const token of nameTokens) {
    maxScore += idf.get(token) || 0;
  }
  if (maxScore === 0) return [];

  const span = elementEndLine - elementLine;
  const proximity = Math.max(5, Math.min(30, Math.floor(span / 2)));

  return entries.filter((entry) => {
    // Skip entries that cite only other files
    if (entryCitesOtherFiles(entry, filePath)) return false;

    // If entry cites this file with specific line numbers, check proximity
    if (entry.citations.length > 0 && entryCitesFile(entry, filePath)) {
      const hasSpecificLine = entry.citations.some((c) => {
        const ci = c.path.lastIndexOf(':');
        if (ci <= 0) return false;
        const f = c.path.slice(0, ci);
        if (f !== filePath) return false;
        const ln = parseInt(c.path.slice(ci + 1), 10);
        return !Number.isNaN(ln) && ln > 1;
      });
      // Only apply proximity filter when entry has specific line citations for this file
      if (hasSpecificLine) {
        const nearElement = entryCitesFile(entry, filePath, {
          start: elementLine, end: elementEndLine, proximity,
        });
        if (!nearElement) return false;
      }
    }

    let tokens = entryTokenCache.get(entry.id);
    if (!tokens) {
      tokens = tokenize(`${entry.title} ${entry.content}`);
      entryTokenCache.set(entry.id, tokens);
    }
    let rawMatches = 0;
    let weightedScore = 0;
    for (const token of nameTokens) {
      if (tokens.has(token)) {
        rawMatches++;
        weightedScore += idf.get(token) || 0;
      }
    }
    return rawMatches >= CONTENT_MIN_RAW_MATCHES && weightedScore / maxScore >= CONTENT_SCORE_THRESHOLD;
  });
}

// Match knowledge to a single file's code elements
export async function matchKnowledgeToFile(
  client: Client,
  file: ASTFileResult,
  wikiPageId: string,
  knowledgeEntries: KnowledgeEntry[],
  entryTokenCache?: Map<string, Set<string>>,
  idfMap?: Map<string, number>,
): Promise<WikiCitation[]> {
  const tokenCache = entryTokenCache || new Map<string, Set<string>>();
  const idf = idfMap || buildIDF(knowledgeEntries, tokenCache);
  const citations: WikiCitation[] = [];

  // Collect code elements for matching (functions + classes only)
  // Variables and interfaces are excluded — their names are too generic
  // and produce many false-positive matches against knowledge entries.
  type ElementKind = 'function' | 'class';
  interface CodeElement {
    name: string;
    line: number;
    endLine: number;
    elementKind: ElementKind;
  }
  const elements: CodeElement[] = [];

  for (const fn of file.functions) {
    elements.push({ name: fn.name, line: fn.line, endLine: fn.endLine, elementKind: 'function' });
  }
  for (const cls of file.classes) {
    elements.push({ name: cls.name, line: cls.line, endLine: cls.endLine, elementKind: 'class' });
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
    const contentMatches = contentMatch(el.name, file.relativePath, el.line, el.endLine, knowledgeEntries, tokenCache, idf);
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
    // Post-filter: if a result cites this file, only keep it when the cited line
    // falls within (or near) the element's line span. This prevents entries about
    // one function from being linked to unrelated functions in the same file.
    try {
      let source: ASTFunction | ASTClass | undefined;
      if (el.elementKind === 'class') source = file.classes.find((c) => c.name === el.name && c.line === el.line);
      else source = file.functions.find((f) => f.name === el.name && f.line === el.line);
      if (!source) continue;
      const summary = buildCodeElementSummary(file, source);
      const queryEmbedding = await embed(summary, true);
      const vectorResults = await performVectorSearch(client, queryEmbedding, {
        limit: 3,
        minScore: 0.45,
        trackUsage: false,
      });

      // Scale proximity to function size: half the span, clamped 5–30
      const span = el.endLine - el.line;
      const LINE_PROXIMITY = Math.max(5, Math.min(30, Math.floor(span / 2)));
      const VECTOR_HIGH_SCORE = 0.75;
      for (const result of vectorResults) {
        const asEntry: KnowledgeEntry = {
          id: result.id, title: result.title, content: result.content,
          tags: result.tags || [], citations: result.citations || [],
        };

        if (asEntry.citations.length === 0) {
          // Uncited entry — require high score for any match
          if (result.score < VECTOR_HIGH_SCORE) continue;
        } else if (entryCitesOtherFiles(asEntry, file.relativePath)) {
          // Entry cites other files only — skip entirely
          // Citation-aware entries should only vector-match within their cited files
          continue;
        } else if (entryCitesFile(asEntry, file.relativePath)) {
          // Entry cites this file — check line proximity
          const nearElement = entryCitesFile(asEntry, file.relativePath, {
            start: el.line, end: el.endLine, proximity: LINE_PROXIMITY,
          });
          if (!nearElement && result.score < VECTOR_HIGH_SCORE) continue;
        }
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

  // Pre-shared token cache and IDF across all files for content matching perf
  const entryTokenCache = new Map<string, Set<string>>();
  const idfMap = buildIDF(knowledgeEntries, entryTokenCache);
  const allCitations: WikiCitation[] = [];

  for (const file of files) {
    const wikiPageId = pageIdMap.get(file.relativePath);
    if (!wikiPageId) continue;

    const fileCitations = await matchKnowledgeToFile(client, file, wikiPageId, knowledgeEntries, entryTokenCache, idfMap);
    allCitations.push(...fileCitations);
  }

  return allCitations;
}

// Wiki indexer — orchestrates scan + match + persist to DB

import type { Client } from '@libsql/client';
import { scanProject, collectFilesWithMtimes, scanFiles, getMtimeForFile, buildScanResult } from './scanner.js';
import { scanCache } from './cache.js';
import { matchKnowledgeToProject } from './matcher.js';
import type { WikiCitation } from './matcher.js';
import { generateId } from '../utils/id.js';
import type { ASTFileResult } from './scanner.js';

export interface IndexStats {
  totalCitations: number;
  totalFiles: number;
  duration: number;
}

export interface IncrementalIndexStats extends IndexStats {
  skippedFiles: number;
}

export interface CoverageStats {
  totalFiles: number;
  coveredFiles: number;
  totalElements: number;
  coveredElements: number;
  coveragePercent: number;
}

export interface CitationWithKnowledge extends WikiCitation {
  knowledge_title: string;
  knowledge_category: string | null;
  knowledge_confidence: number | null;
}

// Full pipeline: scan → upsert pages → match → persist citations
export async function indexProject(client: Client): Promise<IndexStats> {
  const start = Date.now();

  // 1. Scan project
  scanCache.invalidateAll();
  const scan = await scanProject(process.cwd());

  // 2. Upsert wiki_pages — one row per scanned file
  const pageIdMap = new Map<string, string>();

  for (const file of scan.files) {
    const mtime = getMtimeForFile(file.path);

    // Check if page already exists
    const existing = await client.execute({
      sql: 'SELECT id FROM wiki_pages WHERE path = ?',
      args: [file.relativePath],
    });

    let pageId: string;
    if (existing.rows.length > 0) {
      pageId = existing.rows[0].id as string;
      await client.execute({
        sql: `UPDATE wiki_pages SET data = ?, mtime = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [JSON.stringify(file), mtime, pageId],
      });
    } else {
      pageId = generateId('WPAGE');
      await client.execute({
        sql: `INSERT INTO wiki_pages (id, path, type, data, mtime, updated_at) VALUES (?, ?, 'file', ?, ?, datetime('now'))`,
        args: [pageId, file.relativePath, JSON.stringify(file), mtime],
      });
    }

    pageIdMap.set(file.relativePath, pageId);
  }

  // 3. Match knowledge to code elements
  const citations = await matchKnowledgeToProject(client, scan.files, pageIdMap);

  // 4. Clear old citations
  await client.execute({ sql: 'DELETE FROM wiki_citations', args: [] });

  // 5. Batch insert new citations
  for (const c of citations) {
    await client.execute({
      sql: `INSERT INTO wiki_citations (id, wiki_page_id, knowledge_id, function_name, start_line, end_line, match_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [c.id, c.wiki_page_id, c.knowledge_id, c.function_name, c.start_line, c.end_line, c.match_type],
    });
  }

  return {
    totalCitations: citations.length,
    totalFiles: scan.totalFiles,
    duration: Date.now() - start,
  };
}

// Incremental pipeline: only re-scan changed files based on mtime comparison
export async function indexProjectIncremental(client: Client): Promise<IncrementalIndexStats> {
  const start = Date.now();
  const rootPath = process.cwd();

  // 1. Collect current filesystem state with mtimes
  const currentFiles = collectFilesWithMtimes(rootPath);
  const currentPathSet = new Set(currentFiles.map(f => f.relativePath));

  // 2. Load stored wiki_pages with their mtimes from DB
  const storedResult = await client.execute({
    sql: 'SELECT id, path, data, mtime FROM wiki_pages WHERE type = ?',
    args: ['file'],
  });

  const storedByPath = new Map<string, { id: string; mtime: number | null; data: string }>();
  for (const row of storedResult.rows) {
    storedByPath.set(row.path as string, {
      id: row.id as string,
      mtime: row.mtime as number | null,
      data: row.data as string,
    });
  }

  // 3. Diff: find changed, new, and deleted files
  const toScan: string[] = []; // absolute paths to re-scan
  const toScanRelative: string[] = []; // relative paths for tracking
  const unchanged: ASTFileResult[] = []; // loaded from DB

  for (const entry of currentFiles) {
    const stored = storedByPath.get(entry.relativePath);
    if (!stored || stored.mtime === null || stored.mtime !== entry.mtimeMs) {
      // Changed or new file — needs re-scanning
      toScan.push(entry.absolutePath);
      toScanRelative.push(entry.relativePath);
    } else {
      // Unchanged — load from DB
      try {
        const data = JSON.parse(stored.data) as ASTFileResult;
        unchanged.push(data);
      } catch {
        // Malformed data — re-scan
        toScan.push(entry.absolutePath);
        toScanRelative.push(entry.relativePath);
      }
    }
  }

  // 4. Detect deleted files
  const deletedPaths: string[] = [];
  const deletedPageIds: string[] = [];
  for (const [path, stored] of storedByPath) {
    if (!currentPathSet.has(path)) {
      deletedPaths.push(path);
      deletedPageIds.push(stored.id);
    }
  }

  // Remove deleted wiki_pages and their citations
  for (const pageId of deletedPageIds) {
    await client.execute({ sql: 'DELETE FROM wiki_citations WHERE wiki_page_id = ?', args: [pageId] });
    await client.execute({ sql: 'DELETE FROM wiki_pages WHERE id = ?', args: [pageId] });
  }

  // 5. Parse only changed files
  const freshlyScanned = await scanFiles(toScan, rootPath);

  // 6. Upsert wiki_pages for changed files with mtime
  const pageIdMap = new Map<string, string>();

  // Add unchanged page IDs from stored data
  for (const file of unchanged) {
    const stored = storedByPath.get(file.relativePath);
    if (stored) {
      pageIdMap.set(file.relativePath, stored.id);
    }
  }

  // Upsert changed files
  for (const file of freshlyScanned) {
    const mtime = getMtimeForFile(file.path);
    const existing = storedByPath.get(file.relativePath);

    let pageId: string;
    if (existing) {
      pageId = existing.id;
      await client.execute({
        sql: `UPDATE wiki_pages SET data = ?, mtime = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [JSON.stringify(file), mtime, pageId],
      });
    } else {
      pageId = generateId('WPAGE');
      await client.execute({
        sql: `INSERT INTO wiki_pages (id, path, type, data, mtime, updated_at) VALUES (?, ?, 'file', ?, ?, datetime('now'))`,
        args: [pageId, file.relativePath, JSON.stringify(file), mtime],
      });
    }

    pageIdMap.set(file.relativePath, pageId);
  }

  // 7. Delete old citations for changed files only, then re-match
  const changedPageIds = toScanRelative
    .map(rp => pageIdMap.get(rp))
    .filter((id): id is string => !!id);

  for (const pageId of changedPageIds) {
    await client.execute({ sql: 'DELETE FROM wiki_citations WHERE wiki_page_id = ?', args: [pageId] });
  }

  // Match knowledge to changed files only (if any changed)
  let newCitations: WikiCitation[] = [];
  if (freshlyScanned.length > 0) {
    newCitations = await matchKnowledgeToProject(client, freshlyScanned, pageIdMap);

    for (const c of newCitations) {
      await client.execute({
        sql: `INSERT INTO wiki_citations (id, wiki_page_id, knowledge_id, function_name, start_line, end_line, match_type)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [c.id, c.wiki_page_id, c.knowledge_id, c.function_name, c.start_line, c.end_line, c.match_type],
      });
    }
  }

  // 8. Rebuild scan cache with merged results
  const allFiles = [...unchanged, ...freshlyScanned];
  const mergedResult = buildScanResult(rootPath, allFiles);

  // Build mtime map for cache validator
  const mtimeMap: Record<string, number> = {};
  for (const entry of currentFiles) {
    mtimeMap[entry.relativePath] = entry.mtimeMs;
  }
  scanCache.set(rootPath, mergedResult, mtimeMap);

  return {
    totalCitations: newCitations.length,
    totalFiles: allFiles.length,
    skippedFiles: unchanged.length,
    duration: Date.now() - start,
  };
}

// Coverage metrics from DB
export async function getCoverageStats(client: Client): Promise<CoverageStats> {
  // Total files with code elements
  const pagesResult = await client.execute({
    sql: 'SELECT id, data FROM wiki_pages WHERE type = ?',
    args: ['file'],
  });

  let totalElements = 0;
  const fileIds = new Set<string>();

  for (const row of pagesResult.rows) {
    const pageId = row.id as string;
    fileIds.add(pageId);
    try {
      const data = JSON.parse(row.data as string);
      // Only count functions + classes — matcher only links knowledge to these
      totalElements += (data.functions?.length || 0) + (data.classes?.length || 0);
    } catch {
      // skip malformed data
    }
  }

  // Covered files and elements from citations
  const citationsResult = await client.execute({
    sql: `SELECT DISTINCT wiki_page_id, function_name FROM wiki_citations`,
    args: [],
  });

  const coveredFileIds = new Set<string>();
  const coveredElementKeys = new Set<string>();

  for (const row of citationsResult.rows) {
    coveredFileIds.add(row.wiki_page_id as string);
    coveredElementKeys.add(`${row.wiki_page_id}:${row.function_name}`);
  }

  const totalFiles = fileIds.size;
  const coveredFiles = coveredFileIds.size;
  const coveredElements = coveredElementKeys.size;
  const coveragePercent = totalElements > 0 ? Math.round(coveredElements / totalElements * 100) : 0;

  return { totalFiles, coveredFiles, totalElements, coveredElements, coveragePercent };
}

// Get citations for a specific file path, joined with knowledge metadata
export async function getCitationsForFile(client: Client, filePath: string): Promise<CitationWithKnowledge[]> {
  const result = await client.execute({
    sql: `SELECT wc.id, wc.wiki_page_id, wc.knowledge_id, wc.function_name,
                 wc.start_line, wc.end_line, wc.match_type,
                 k.title AS knowledge_title, k.category AS knowledge_category, k.confidence AS knowledge_confidence
          FROM wiki_citations wc
          JOIN wiki_pages wp ON wp.id = wc.wiki_page_id
          JOIN knowledge k ON k.id = wc.knowledge_id
          WHERE wp.path = ?
          ORDER BY wc.start_line ASC`,
    args: [filePath],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    wiki_page_id: row.wiki_page_id as string,
    knowledge_id: row.knowledge_id as string,
    function_name: row.function_name as string,
    start_line: row.start_line as number,
    end_line: row.end_line as number,
    match_type: row.match_type as WikiCitation['match_type'],
    knowledge_title: row.knowledge_title as string,
    knowledge_category: row.knowledge_category as string | null,
    knowledge_confidence: row.knowledge_confidence as number | null,
  }));
}

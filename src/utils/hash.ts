import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Citation } from '../types.js';

/**
 * Compute a content hash from trimmed text content.
 * Returns SHA-256 truncated to 16 hex chars.
 */
export function computeContentHash(content: string): string {
  return createHash('sha256')
    .update(content.trim())
    .digest('hex')
    .slice(0, 16);
}

export interface CitationValidationResult {
  path: string;
  status: 'valid' | 'stale' | 'missing';
  currentHash?: string;
}

/**
 * Validate a single citation against the filesystem.
 * Uses a file cache to avoid re-reading the same file for multiple citations.
 */
export function validateCitation(
  citation: Citation,
  cwd: string,
  fileCache: Map<string, string[] | null>,
): CitationValidationResult {
  // Parse file:line from path
  const colonIdx = citation.path.lastIndexOf(':');
  if (colonIdx === -1) {
    return { path: citation.path, status: 'missing' };
  }

  const filePath = citation.path.slice(0, colonIdx);
  const lineNum = parseInt(citation.path.slice(colonIdx + 1), 10);

  if (isNaN(lineNum) || lineNum < 1) {
    return { path: citation.path, status: 'missing' };
  }

  // Read file (cached)
  let lines = fileCache.get(filePath);
  if (lines === undefined) {
    try {
      const absPath = resolve(cwd, filePath);
      const content = readFileSync(absPath, 'utf-8');
      lines = content.split('\n');
      fileCache.set(filePath, lines);
    } catch {
      fileCache.set(filePath, null);
      lines = null;
    }
  }

  if (lines === null) {
    return { path: citation.path, status: 'missing' };
  }

  // Check line exists
  if (lineNum > lines.length) {
    return { path: citation.path, status: 'missing' };
  }

  const lineContent = lines[lineNum - 1]; // 1-indexed
  const currentHash = computeContentHash(lineContent);

  if (currentHash === citation.contentHash) {
    return { path: citation.path, status: 'valid', currentHash };
  }

  return { path: citation.path, status: 'stale', currentHash };
}

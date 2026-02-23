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
  status: 'valid' | 'changed' | 'missing';
  currentFileHash?: string;
}

/**
 * Validate a citation against the filesystem using file-level hashing.
 * Citations are provenance links — line numbers are navigation hints only.
 * File hash detects when the source file has evolved since knowledge was written.
 * Uses a file hash cache to avoid re-reading the same file for multiple citations.
 */
export function validateCitation(
  citation: Citation,
  cwd: string,
  fileHashCache: Map<string, string | null>,
): CitationValidationResult {
  // Parse file path from file:line
  const colonIdx = citation.path.lastIndexOf(':');
  const filePath = colonIdx === -1 ? citation.path : citation.path.slice(0, colonIdx);

  // Check cache for computed file hash
  let fileHash = fileHashCache.get(filePath);
  if (fileHash === undefined) {
    try {
      const absPath = resolve(cwd, filePath);
      const content = readFileSync(absPath, 'utf-8');
      fileHash = computeContentHash(content);
      fileHashCache.set(filePath, fileHash);
    } catch {
      fileHashCache.set(filePath, null);
      fileHash = null;
    }
  }

  if (fileHash === null) {
    return { path: citation.path, status: 'missing' };
  }

  // Compare stored hash with current file hash
  const storedHash = citation.fileHash;
  if (storedHash === fileHash) {
    return { path: citation.path, status: 'valid', currentFileHash: fileHash };
  }

  return { path: citation.path, status: 'changed', currentFileHash: fileHash };
}

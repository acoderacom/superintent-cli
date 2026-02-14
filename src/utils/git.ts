import { execSync } from 'child_process';

let cachedUsername: string | null = null;
let cachedBranch: string | null = null;

/**
 * Get the git config user.name, cached for the process lifetime.
 * Falls back to 'anonymous' if not configured.
 */
export function getGitUsername(): string {
  if (cachedUsername !== null) return cachedUsername;
  try {
    cachedUsername = execSync('git config user.name', { encoding: 'utf-8' }).trim() || 'anonymous';
  } catch {
    cachedUsername = 'anonymous';
  }
  return cachedUsername;
}

/**
 * Get the current git branch, cached for the process lifetime.
 * Falls back to 'main' on error or detached HEAD.
 */
export function getGitBranch(): string {
  if (cachedBranch !== null) return cachedBranch;
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    cachedBranch = (branch && branch !== 'HEAD') ? branch : 'main';
  } catch {
    cachedBranch = 'main';
  }
  return cachedBranch;
}

import { execSync } from 'child_process';

let cachedUsername: string | null = null;

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

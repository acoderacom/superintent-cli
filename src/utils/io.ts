/**
 * Shared I/O utilities for CLI commands.
 */

/**
 * Read all input from stdin as a string.
 * Used for reading piped content like markdown tickets or knowledge.
 */
export async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data); });
  });
}

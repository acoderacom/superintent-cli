/**
 * Shared I/O utilities for CLI commands.
 */

const STDIN_TIMEOUT_MS = 5_000;
const STDIN_MAX_BYTES = 1_024 * 1_024; // 1 MB

/**
 * Read all input from stdin as a string.
 * Used for reading piped content like markdown tickets or knowledge.
 * Fails fast if stdin is a TTY (no piped data), and enforces a timeout and size limit.
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('No input piped to stdin. Usage: command --stdin <<\'EOF\'\n...\nEOF');
  }

  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;

    const timer = setTimeout(() => {
      process.stdin.destroy();
      reject(new Error(`Stdin read timed out after ${STDIN_TIMEOUT_MS / 1000}s — is input being piped?`));
    }, STDIN_TIMEOUT_MS);

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > STDIN_MAX_BYTES) {
        clearTimeout(timer);
        process.stdin.destroy();
        reject(new Error(`Stdin input exceeds ${STDIN_MAX_BYTES / 1024 / 1024} MB limit`));
        return;
      }
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });

    process.stdin.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

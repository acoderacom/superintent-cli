/**
 * Shared I/O utilities for CLI commands.
 */
/**
 * Read all input from stdin as a string.
 * Used for reading piped content like markdown tickets or knowledge.
 */
export declare function readStdin(): Promise<string>;

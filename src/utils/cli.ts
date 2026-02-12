/**
 * Shared CLI response utilities.
 * Provides consistent response formatting for CLI commands.
 */

import type { CliResponse } from '../types.js';

/**
 * Create an error response object.
 */
export function errorResponse(message: string): CliResponse {
  return { success: false, error: message };
}

/**
 * Create a success response object with optional data.
 */
export function successResponse<T>(data?: T): CliResponse<T> {
  return data !== undefined
    ? { success: true, data }
    : { success: true } as CliResponse<T>;
}

/**
 * Output an error response and exit with code 1.
 */
export function exitWithError(message: string): never {
  console.log(JSON.stringify(errorResponse(message)));
  process.exit(1);
}

/**
 * Output a success response and optionally exit.
 */
export function outputSuccess<T>(data?: T): void {
  console.log(JSON.stringify(successResponse(data)));
}

/**
 * Shared CLI response utilities.
 * Provides consistent response formatting for CLI commands.
 */
import type { CliResponse } from '../types.js';
/**
 * Create an error response object.
 */
export declare function errorResponse(message: string): CliResponse;
/**
 * Create a success response object with optional data.
 */
export declare function successResponse<T>(data?: T): CliResponse<T>;
/**
 * Output an error response and exit with code 1.
 */
export declare function exitWithError(message: string): never;
/**
 * Output a success response and optionally exit.
 */
export declare function outputSuccess<T>(data?: T): void;

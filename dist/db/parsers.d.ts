/**
 * Shared database row parsers for Ticket, Knowledge, and SearchResult types.
 * Consolidates duplicated parsing logic from command files.
 */
import type { Ticket, Knowledge, SearchResult, Spec } from '../types.js';
/**
 * Parse a database row into a Ticket object.
 * Handles JSON parsing for array/object fields.
 */
export declare function parseTicketRow(row: Record<string, unknown>): Ticket;
/**
 * Parse a database row into a Knowledge object.
 * Handles JSON parsing for tags array and provides defaults.
 */
export declare function parseKnowledgeRow(row: Record<string, unknown>): Knowledge;
/**
 * Parse a database row into a Spec object.
 */
export declare function parseSpecRow(row: Record<string, unknown>): Spec;
/**
 * Parse a database row from a vector search into a SearchResult.
 * Converts distance to similarity score (1 - distance).
 */
export declare function parseSearchRow(row: Record<string, unknown>): SearchResult;

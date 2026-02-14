/**
 * Shared database row parsers for Ticket, Knowledge, and SearchResult types.
 * Consolidates duplicated parsing logic from command files.
 */

import type { Ticket, Knowledge, SearchResult, Spec, Comment, TicketType } from '../types.js';

/**
 * Parse a database row into a Ticket object.
 * Handles JSON parsing for array/object fields.
 */
export function parseTicketRow(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as string,
    type: row.type as TicketType | undefined,
    title: row.title as string | undefined,
    status: row.status as Ticket['status'],
    intent: row.intent as string,
    context: row.context as string | undefined,
    constraints_use: row.constraints_use ? JSON.parse(row.constraints_use as string) : undefined,
    constraints_avoid: row.constraints_avoid ? JSON.parse(row.constraints_avoid as string) : undefined,
    assumptions: row.assumptions ? JSON.parse(row.assumptions as string) : undefined,
    tasks: row.tasks ? JSON.parse(row.tasks as string) : undefined,
    definition_of_done: row.definition_of_done ? JSON.parse(row.definition_of_done as string) : undefined,
    change_class: row.change_class as Ticket['change_class'],
    change_class_reason: row.change_class_reason as string | undefined,
    plan: row.plan ? JSON.parse(row.plan as string) : undefined,
    origin_spec_id: row.origin_spec_id as string | undefined,
    derived_knowledge: row.derived_knowledge ? JSON.parse(row.derived_knowledge as string) : undefined,
    author: row.author as string | undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

/**
 * Parse a database row into a Knowledge object.
 * Handles JSON parsing for tags array and provides defaults.
 */
export function parseKnowledgeRow(row: Record<string, unknown>): Knowledge {
  return {
    id: row.id as string,
    namespace: row.namespace as string,
    chunk_index: row.chunk_index as number,
    title: row.title as string,
    content: row.content as string,
    category: row.category as Knowledge['category'],
    tags: row.tags ? JSON.parse(row.tags as string) : undefined,
    source: (row.source as Knowledge['source']) || 'manual',
    origin_ticket_id: row.origin_ticket_id as string | undefined,
    origin_ticket_type: row.origin_ticket_type as TicketType | undefined,
    confidence: row.confidence as number,
    active: Boolean(row.active),
    decision_scope: (row.decision_scope as Knowledge['decision_scope']) || 'global',
    usage_count: (row.usage_count as number) || 0,
    last_used_at: row.last_used_at as string | undefined,
    author: row.author as string | undefined,
    branch: row.branch as string | undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

/**
 * Parse a database row into a Spec object.
 */
export function parseSpecRow(row: Record<string, unknown>): Spec {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

/**
 * Parse a database row into a Comment object.
 */
export function parseCommentRow(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    parent_type: row.parent_type as Comment['parent_type'],
    parent_id: row.parent_id as string,
    author: row.author as string,
    text: row.text as string,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

/**
 * Parse a database row from a vector search into a SearchResult.
 * Converts distance to similarity score (1 - distance).
 */
export function parseSearchRow(row: Record<string, unknown>): SearchResult {
  const distance = row.distance as number;
  return {
    ...parseKnowledgeRow(row),
    score: 1 - distance,
  };
}

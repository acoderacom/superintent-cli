/**
 * Shared database row parsers for Ticket, Knowledge, and SearchResult types.
 * Consolidates duplicated parsing logic from command files.
 */
/**
 * Parse a database row into a Ticket object.
 * Handles JSON parsing for array/object fields.
 */
export function parseTicketRow(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        status: row.status,
        intent: row.intent,
        context: row.context,
        constraints_use: row.constraints_use ? JSON.parse(row.constraints_use) : undefined,
        constraints_avoid: row.constraints_avoid ? JSON.parse(row.constraints_avoid) : undefined,
        assumptions: row.assumptions ? JSON.parse(row.assumptions) : undefined,
        tasks: row.tasks ? JSON.parse(row.tasks) : undefined,
        definition_of_done: row.definition_of_done ? JSON.parse(row.definition_of_done) : undefined,
        change_class: row.change_class,
        change_class_reason: row.change_class_reason,
        plan: row.plan ? JSON.parse(row.plan) : undefined,
        origin_spec_id: row.origin_spec_id,
        derived_knowledge: row.derived_knowledge ? JSON.parse(row.derived_knowledge) : undefined,
        comments: row.comments ? JSON.parse(row.comments) : undefined,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
/**
 * Parse a database row into a Knowledge object.
 * Handles JSON parsing for tags array and provides defaults.
 */
export function parseKnowledgeRow(row) {
    return {
        id: row.id,
        namespace: row.namespace,
        chunk_index: row.chunk_index,
        title: row.title,
        content: row.content,
        category: row.category,
        tags: row.tags ? JSON.parse(row.tags) : undefined,
        source: row.source || 'manual',
        origin_ticket_id: row.origin_ticket_id,
        origin_ticket_type: row.origin_ticket_type,
        confidence: row.confidence,
        active: Boolean(row.active),
        decision_scope: row.decision_scope || 'global',
        usage_count: row.usage_count || 0,
        last_used_at: row.last_used_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
/**
 * Parse a database row into a Spec object.
 */
export function parseSpecRow(row) {
    return {
        id: row.id,
        title: row.title,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
/**
 * Parse a database row from a vector search into a SearchResult.
 * Converts distance to similarity score (1 - distance).
 */
export function parseSearchRow(row) {
    const distance = row.distance;
    return {
        ...parseKnowledgeRow(row),
        score: 1 - distance,
    };
}

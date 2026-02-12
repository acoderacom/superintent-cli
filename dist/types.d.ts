export interface TicketPlan {
    files: string[];
    taskSteps: {
        task: string;
        steps: string[];
    }[];
    dodVerification: {
        dod: string;
        verify: string;
    }[];
    decisions: {
        choice: string;
        reason: string;
    }[];
    tradeOffs: {
        considered: string;
        rejected: string;
    }[];
    rollback?: {
        steps: string[];
        reversibility: 'full' | 'partial' | 'none';
    };
    irreversibleActions: string[];
    edgeCases: string[];
}
export type TicketType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'test';
export interface Ticket {
    id: string;
    type?: TicketType;
    title?: string;
    status: 'Backlog' | 'In Progress' | 'In Review' | 'Done' | 'Blocked' | 'Paused' | 'Abandoned' | 'Superseded';
    intent: string;
    context?: string;
    constraints_use?: string[];
    constraints_avoid?: string[];
    assumptions?: string[];
    tasks?: TaskItem[];
    definition_of_done?: TaskItem[];
    change_class?: 'A' | 'B' | 'C';
    change_class_reason?: string;
    plan?: TicketPlan;
    origin_spec_id?: string;
    derived_knowledge?: string[];
    comments?: TicketComment[];
    created_at?: string;
    updated_at?: string;
}
export interface TaskItem {
    text: string;
    done: boolean;
}
export interface TicketComment {
    text: string;
    timestamp: string;
}
export interface TicketInput {
    id: string;
    type?: TicketType;
    title?: string;
    intent: string;
    context?: string;
    constraints?: {
        use?: string[];
        avoid?: string[];
    };
    assumptions?: string[];
    tasks?: string[] | TaskItem[];
    definitionOfDone?: string[] | TaskItem[];
    changeClass?: 'A' | 'B' | 'C';
    changeClassReason?: string;
}
export type KnowledgeCategory = 'pattern' | 'truth' | 'principle' | 'architecture' | 'gotcha';
export type DecisionScope = 'new-only' | 'backward-compatible' | 'global' | 'legacy-frozen';
export type KnowledgeSource = 'ticket' | 'discovery' | 'manual';
export interface Knowledge {
    id: string;
    namespace: string;
    chunk_index: number;
    title: string;
    content: string;
    category?: KnowledgeCategory;
    tags?: string[];
    source: KnowledgeSource;
    origin_ticket_id?: string;
    origin_ticket_type?: TicketType;
    confidence: number;
    active: boolean;
    decision_scope: DecisionScope;
    usage_count: number;
    last_used_at?: string;
    created_at?: string;
    updated_at?: string;
}
export interface KnowledgeInput {
    namespace?: string;
    title: string;
    content: string;
    category?: KnowledgeCategory;
    tags?: string[];
    source?: KnowledgeSource;
    originTicketId?: string;
    originTicketType?: TicketType;
    confidence?: number;
    decisionScope?: DecisionScope;
}
export interface SearchResult extends Knowledge {
    score: number;
}
export interface Spec {
    id: string;
    title: string;
    content: string;
    created_at?: string;
    updated_at?: string;
}
export interface CliResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

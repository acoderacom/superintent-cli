import { ColumnData } from './utils.js';
export declare function renderTicketCard(ticket: {
    id: string;
    type?: string;
    title?: string;
    intent: string;
    change_class?: string;
    change_class_reason?: string;
    tasks?: {
        text: string;
        done: boolean;
    }[];
}, options?: {
    isBacklog?: boolean;
}): string;
export declare function renderKanbanView(): string;
export declare function renderKanbanColumns(columns: ColumnData[]): string;
export declare function renderColumnMore(tickets: {
    id: string;
    type?: string;
    title?: string;
    intent: string;
    change_class?: string;
    change_class_reason?: string;
    tasks?: {
        text: string;
        done: boolean;
    }[];
}[], status: string, nextOffset: number, hasMore: boolean): string;
export declare function renderTicketModal(ticket: {
    id: string;
    type?: string;
    title?: string;
    status: string;
    intent: string;
    context?: string;
    constraints_use?: string[];
    constraints_avoid?: string[];
    assumptions?: string[];
    tasks?: {
        text: string;
        done: boolean;
    }[];
    definition_of_done?: {
        text: string;
        done: boolean;
    }[];
    change_class?: string;
    change_class_reason?: string;
    origin_spec_id?: string;
    plan?: {
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
    };
    derived_knowledge?: string[];
    comments?: {
        text: string;
        timestamp: string;
    }[];
    created_at?: string;
    updated_at?: string;
}): string;
export declare function renderNewTicketModal(): string;
export declare function renderEditTicketModal(ticket: {
    id: string;
    type?: string;
    title?: string;
    intent: string;
}): string;

import type { Spec } from '../../types.js';
export declare function renderSpecView(): string;
export declare function renderSpecList(specs: Spec[], ticketCounts?: Record<string, number>): string;
export declare function renderSpecCard(spec: Spec, ticketCount?: number): string;
export declare function renderSpecModal(spec: Spec, relatedTickets?: {
    id: string;
    title?: string;
    status: string;
}[]): string;
export declare function renderNewSpecModal(): string;
export declare function renderEditSpecModal(spec: Spec): string;

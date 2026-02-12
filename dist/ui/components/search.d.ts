export declare function renderSearchView(): string;
export declare function renderSearchResults(results: {
    id: string;
    title: string;
    content: string;
    category?: string;
    namespace: string;
    source?: string;
    origin_ticket_type?: string;
    decision_scope: string;
    tags?: string[];
    score: number;
    confidence: number;
    active: boolean;
}[]): string;

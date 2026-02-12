export declare function escapeHtml(str: string): string;
export declare function renderMarkdownEditor(opts: {
    name: string;
    id: string;
    placeholder?: string;
    rows?: number;
    required?: boolean;
    value?: string;
}): string;
export interface ColumnData {
    status: string;
    tickets: {
        id: string;
        type?: string;
        title?: string;
        status: string;
        intent: string;
        change_class?: string;
        change_class_reason?: string;
        tasks?: {
            text: string;
            done: boolean;
        }[];
    }[];
    hasMore: boolean;
}

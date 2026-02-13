import type { Client } from '@libsql/client';
import type { SearchResult } from '../types.js';
export interface VectorSearchOptions {
    namespace?: string;
    category?: string;
    ticketType?: string;
    tags?: string[];
    minScore?: number;
    limit: number;
}
export declare function performVectorSearch(client: Client, queryEmbedding: number[], options: VectorSearchOptions): Promise<SearchResult[]>;

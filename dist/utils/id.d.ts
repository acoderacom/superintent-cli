type IdPrefix = 'TICKET' | 'SPEC' | 'KNOWLEDGE';
/**
 * Generate a timestamp-based ID in format: PREFIX-YYYYMMDD-HHMMSS
 */
export declare function generateId(prefix: IdPrefix): string;
export {};

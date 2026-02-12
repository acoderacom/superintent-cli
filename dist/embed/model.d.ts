/**
 * Generate embedding for a single text.
 * Returns a 384-dimensional normalized vector.
 */
export declare function embed(text: string): Promise<number[]>;

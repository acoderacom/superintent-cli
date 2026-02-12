/**
 * Knowledge usage tracking utilities.
 */
/**
 * Track usage for knowledge entries by incrementing usage_count and updating last_used_at.
 * Silently fails on error since usage tracking is non-critical.
 */
export declare function trackUsage(ids: string[]): Promise<void>;

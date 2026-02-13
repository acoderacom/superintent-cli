import { pipeline, env } from '@huggingface/transformers';

// Suppress model loading warnings
env.allowLocalModels = true;
env.allowRemoteModels = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * Get or initialize the embedding pipeline.
 * First call downloads the model (~23MB), subsequent calls use cache.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEmbedder(): Promise<any> {
  if (extractor) {
    return extractor;
  }

  extractor = await pipeline('feature-extraction', MODEL_NAME, {
    dtype: 'fp32',  // Explicitly set to suppress warning
  });
  return extractor;
}

const MAX_CACHE_SIZE = 100;
const embeddingCache = new Map<string, number[]>();

/**
 * Generate embedding for a single text.
 * Returns a 384-dimensional normalized vector.
 * Results are cached in memory (LRU, up to MAX_CACHE_SIZE entries).
 */
/**
 * Dispose the embedding pipeline to release onnxruntime native resources.
 * Safe to call even if the pipeline was never initialized (no-op).
 */
export async function disposeEmbedder(): Promise<void> {
  if (extractor) {
    await extractor.dispose();
    extractor = null;
    embeddingCache.clear();
  }
}

export async function embed(text: string): Promise<number[]> {
  const cached = embeddingCache.get(text);
  if (cached) {
    // Move to end for LRU freshness
    embeddingCache.delete(text);
    embeddingCache.set(text, cached);
    return cached;
  }

  const embedder = await getEmbedder();
  const result = await embedder(text, {
    pooling: 'mean',
    normalize: true,
  });

  const embedding = Array.from(result.data as Float32Array);

  // Evict oldest entry if at capacity
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    const oldest = embeddingCache.keys().next().value!;
    embeddingCache.delete(oldest);
  }

  embeddingCache.set(text, embedding);
  return embedding;
}

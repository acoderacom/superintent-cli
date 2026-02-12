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

/**
 * Generate embedding for a single text.
 * Returns a 384-dimensional normalized vector.
 */
export async function embed(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const result = await embedder(text, {
    pooling: 'mean',
    normalize: true,
  });

  // Convert Float32Array to regular array
  return Array.from(result.data as Float32Array);
}

import { pipeline, env, type ProgressInfo } from '@huggingface/transformers';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Suppress model loading warnings
env.allowLocalModels = true;
env.allowRemoteModels = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;

const MODEL_NAME = 'Xenova/bge-small-en-v1.5';
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

/**
 * Get or initialize the embedding pipeline.
 * First call downloads the model (~67MB), subsequent calls use cache.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEmbedder(): Promise<any> {
  if (extractor) {
    return extractor;
  }

  // Check if model is already cached
  const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '@huggingface', 'transformers', '.cache', ...MODEL_NAME.split('/'));
  const isCached = existsSync(join(cacheDir, 'onnx', 'model_quantized.onnx'));

  let downloading = false;
  const origWarn = console.warn;

  extractor = await pipeline('feature-extraction', MODEL_NAME, {
    dtype: 'fp32',
    model_file_name: 'model_quantized',
    progress_callback: !isCached ? (info: ProgressInfo) => {
      if (info.status === 'download' && !downloading) {
        downloading = true;
        console.warn = () => {};
        process.stderr.write('* Downloading embedding model...\n');
      }
      if (info.status === 'progress' && downloading && 'loaded' in info && info.file?.includes('onnx') && info.loaded > 0) {
        const mb = (info.loaded / 1024 / 1024).toFixed(1);
        process.stderr.write(`\r* Downloading... ${mb} MB`);
      }
      if (info.status === 'ready') {
        console.warn = origWarn;
        if (downloading) {
          process.stderr.write('\r* Model ready.              \n');
        }
      }
    } : undefined,
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
/**
 * Eagerly load the embedding model (triggers download on first run).
 */
export async function preloadModel(): Promise<void> {
  await getEmbedder();
}

export async function disposeEmbedder(): Promise<void> {
  if (extractor) {
    await extractor.dispose();
    extractor = null;
    embeddingCache.clear();
  }
}

export async function embed(text: string, isQuery = false): Promise<number[]> {
  const input = isQuery ? QUERY_PREFIX + text : text;
  const cached = embeddingCache.get(input);
  if (cached) {
    // Move to end for LRU freshness
    embeddingCache.delete(input);
    embeddingCache.set(input, cached);
    return cached;
  }

  const embedder = await getEmbedder();
  const result = await embedder(input, {
    pooling: 'cls',
    normalize: true,
  });

  const embedding = Array.from(result.data as Float32Array);

  // Evict oldest entry if at capacity
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    const oldest = embeddingCache.keys().next().value!;
    embeddingCache.delete(oldest);
  }

  embeddingCache.set(input, embedding);
  return embedding;
}

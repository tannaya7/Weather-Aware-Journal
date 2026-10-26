import { MODEL_ID } from './semantic.js';

// Loads the language model that turns text into vectors, only when search
// by meaning is turned on. The model (about 25 MB) is fetched once from
// Hugging Face and kept by the browser; after that it runs on this device,
// and no journal text is ever sent anywhere. The library itself is a
// separate chunk, so people who never turn this on never download it.

let factory = defaultFactory;
let loading = null;

// Overall download progress (0-100) across the model's files, from the
// per-file events the library reports.
export function makeProgressTracker(report) {
  const files = new Map();
  return (event) => {
    if (!event || typeof report !== 'function') return;
    if (event.status === 'progress' && event.total) {
      files.set(event.file, { loaded: event.loaded, total: event.total });
    } else if (event.status === 'done' && files.has(event.file)) {
      const f = files.get(event.file);
      files.set(event.file, { loaded: f.total, total: f.total });
    } else {
      return;
    }
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    report(total ? Math.min(100, Math.round((loaded / total) * 100)) : 0);
  };
}

async function defaultFactory(onProgress) {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'q8',
    progress_callback: makeProgressTracker(onProgress),
  });
  return {
    async embed(texts) {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist().map((v) => Float32Array.from(v));
    },
  };
}

// One shared embedder. A failed load is not remembered, so trying again
// (for example once back online) works.
export function getEmbedder(onProgress) {
  if (!loading) {
    loading = factory(onProgress).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export function isEmbedderLoaded() {
  return loading !== null;
}

// For tests: swap the model for a fake one (or restore the real one).
export function setEmbedderFactory(next) {
  factory = next || defaultFactory;
  loading = null;
}

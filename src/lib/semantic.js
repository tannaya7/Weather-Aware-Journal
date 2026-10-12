import { getEntryTitle } from './entryTitle.js';
import { stripMarkdown } from './richText.js';

// Search by meaning. Each entry is turned into a few short "chunks" of
// text, each chunk into a vector (a list of numbers, made by a small
// language model that runs in the browser), and two texts are alike when
// their vectors point the same way. Everything here is plain math and
// bookkeeping, so it works with any model that can turn texts into
// normalized vectors (see embedder.js).

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const DIMENSIONS = 384;
// The model reads about 256 word pieces; staying near 150 words per chunk
// keeps whole chunks inside that.
const CHUNK_WORDS = 150;
const CHUNK_OVERLAP = 25;
const MAX_CHUNKS = 8;
// Below this cosine similarity a result is more noise than meaning. Chosen
// from trying the real model: real matches score about 0.28-0.4, and
// unrelated queries top out near 0.2.
export const MIN_SCORE = 0.25;

// --- Text ------------------------------------------------------------------

// What gets embedded for an entry: the words, plus the mood, weather, and
// place so a search like "rainy and low" can match on them too.
export function entryDocument(entry) {
  const title = getEntryTitle(entry);
  const body = stripMarkdown(entry.content || '');
  const context = [entry.mood, entry.weatherType, entry.locationName, ...(entry.tags || [])].filter(Boolean).join(', ');
  return { title, body, context };
}

export function chunkEntry(entry) {
  const { body, context } = entryDocument(entry);
  const words = body.split(/\s+/).filter(Boolean);
  const chunks = [];
  if (words.length === 0) {
    // No text: the title is just a placeholder, so only the context counts.
    return context ? [context] : [];
  }
  const step = CHUNK_WORDS - CHUNK_OVERLAP;
  for (let start = 0; start < words.length && chunks.length < MAX_CHUNKS; start += step) {
    const slice = words.slice(start, start + CHUNK_WORDS).join(' ');
    // The context rides along with the first chunk only.
    chunks.push(start === 0 && context ? `${slice}. ${context}` : slice);
    if (start + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
}

// A short fingerprint of an entry's searchable text, to know when it changed.
export function entryHash(entry) {
  const text = chunkEntry(entry).join('\u0001');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

// --- Vectors ---------------------------------------------------------------

export function normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return Float32Array.from(vec, (v) => v / norm);
}

export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Vectors are stored as one byte per number (-127..127), as base64: a
// quarter of the size, and the loss does not change which results rank
// first in practice.
export function encodeVector(vec) {
  const bytes = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) bytes[i] = Math.max(-127, Math.min(127, Math.round(vec[i] * 127)));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] & 0xff);
  return btoa(binary);
}

export function decodeVector(text) {
  const binary = atob(text);
  const out = new Float32Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i);
    out[i] = (byte > 127 ? byte - 256 : byte) / 127;
  }
  return normalize(out);
}

// --- The index -------------------------------------------------------------
// index = { [entryId]: { hash, chunks: [base64 vector, ...] } }

export function indexPlan(entries, index = {}) {
  const ids = new Set(entries.map((e) => String(e.id)));
  const stale = entries.filter((e) => index[String(e.id)]?.hash !== entryHash(e) && chunkEntry(e).length > 0);
  const removed = Object.keys(index).filter((id) => !ids.has(id));
  return { stale, removed };
}

// Brings the index up to date: embeds only new or changed entries, drops
// deleted ones. `embed(texts)` resolves to one vector per text. Calls
// `onProgress(done, total)` as batches finish and `onBatch(index)` with the
// index so far, so a long run can be saved part-way.
export async function updateIndex({ entries, index = {}, embed, batchSize = 8, onProgress, onBatch, shouldStop }) {
  const { stale, removed } = indexPlan(entries, index);
  const next = { ...index };
  for (const id of removed) delete next[id];

  for (let i = 0; i < stale.length; i += batchSize) {
    if (shouldStop?.()) break;
    const batch = stale.slice(i, i + batchSize);
    const pieces = batch.map((entry) => chunkEntry(entry));
    const vectors = await embed(pieces.flat());
    let at = 0;
    batch.forEach((entry, j) => {
      const count = pieces[j].length;
      next[String(entry.id)] = {
        hash: entryHash(entry),
        chunks: vectors.slice(at, at + count).map((v) => encodeVector(normalize(v))),
      };
      at += count;
    });
    onProgress?.(Math.min(i + batchSize, stale.length), stale.length);
    onBatch?.(next);
  }
  return { index: next, embedded: stale.length, removed: removed.length };
}

// Entries most like the query vector, best first. Each entry scores as its
// best chunk.
export function searchIndex(queryVector, index, { limit = 50, minScore = MIN_SCORE, exclude } = {}) {
  const query = normalize(queryVector);
  const results = [];
  for (const [id, record] of Object.entries(index)) {
    if (exclude !== undefined && id === String(exclude)) continue;
    let best = -1;
    for (const chunk of record.chunks) {
      const score = dot(query, decodeVector(chunk));
      if (score > best) best = score;
    }
    if (best >= minScore) results.push({ id, score: best });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Entries most like an already-indexed entry (the mean of its chunks).
export function similarEntries(entryId, index, options = {}) {
  const record = index[String(entryId)];
  if (!record || record.chunks.length === 0) return [];
  const vectors = record.chunks.map(decodeVector);
  const mean = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < mean.length; i++) mean[i] += v[i];
  return searchIndex(mean, index, { minScore: 0.45, limit: 5, ...options, exclude: entryId });
}

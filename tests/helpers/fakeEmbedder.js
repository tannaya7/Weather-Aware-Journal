import { normalize } from '../../src/lib/semantic.js';

// A stand-in for the language model: words in the same group share a
// dimension, so "nervous" and "anxious" land close together while "sunny"
// does not. Deterministic, instant, and good enough to check ranking.
const GROUPS = [
  ['anxious', 'nervous', 'worried', 'overwhelmed', 'stress', 'stressed', 'panic'],
  ['happy', 'joy', 'glad', 'delighted', 'cheerful', 'excited'],
  ['rain', 'rainy', 'storm', 'drizzle', 'wet', 'umbrella'],
  ['sun', 'sunny', 'bright', 'warm', 'beach'],
  ['work', 'deadline', 'meeting', 'boss', 'office'],
];
export const DIMS = GROUPS.length + 8;

function bucketOf(word) {
  const group = GROUPS.findIndex((g) => g.includes(word));
  if (group >= 0) return group;
  let h = 0;
  for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUPS.length + (h % 8);
}

export function fakeVector(text) {
  const vec = new Float32Array(DIMS);
  for (const word of text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2)) {
    // Group words count much more than filler words.
    vec[bucketOf(word)] += bucketOf(word) < GROUPS.length ? 3 : 0.3;
  }
  return normalize(vec);
}

// Records every call so tests can see what was embedded and when.
export function makeFakeFactory({ fail = false, onEmbed } = {}) {
  const calls = { loads: 0, texts: [] };
  const factory = async (onProgress) => {
    calls.loads += 1;
    if (fail) throw new Error('network down');
    onProgress?.(100);
    return {
      embed: async (texts) => {
        calls.texts.push(...texts);
        onEmbed?.(texts);
        return texts.map(fakeVector);
      },
    };
  };
  return { factory, calls };
}

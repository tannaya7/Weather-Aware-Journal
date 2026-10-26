import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chunkEntry,
  decodeVector,
  dot,
  encodeVector,
  entryHash,
  indexPlan,
  normalize,
  searchIndex,
  similarEntries,
  updateIndex,
} from '../../src/lib/semantic.js';
import { getEmbedder, isEmbedderLoaded, makeProgressTracker, setEmbedderFactory } from '../../src/lib/embedder.js';
import { fakeVector, makeFakeFactory } from '../helpers/fakeEmbedder.js';

function entry(id, content, extra = {}) {
  return { id, content, date: '2026-10-01T10:00', ...extra };
}

const embedAll = async (texts) => texts.map(fakeVector);

describe('chunkEntry', () => {
  it('keeps a short entry whole, with its mood, weather, and place on the end', () => {
    const chunks = chunkEntry(entry(1, 'A quiet walk by the river.', { mood: 'Peaceful', weatherType: 'Rain', locationName: 'Oslo', tags: ['walk'] }));
    expect(chunks).toEqual(['A quiet walk by the river.. Peaceful, Rain, Oslo, walk']);
  });

  it('splits a long entry into overlapping chunks and caps how many', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkEntry(entry(1, words));
    expect(chunks).toHaveLength(8);
    expect(chunks[0].split(' ')).toHaveLength(150);
    // 25 words overlap between neighbours.
    expect(chunks[1].split(' ')[0]).toBe('w125');
  });

  it('puts the context on the first chunk only', () => {
    const words = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkEntry(entry(1, words, { mood: 'Happy' }));
    expect(chunks[0]).toMatch(/Happy$/);
    expect(chunks[1]).not.toMatch(/Happy/);
  });

  it('strips formatting, and uses only mood, weather, and place when there is no text', () => {
    expect(chunkEntry(entry(1, '**bold** and _soft_'))[0]).toBe('bold and soft');
    expect(chunkEntry(entry(1, '', { mood: 'Sad' }))).toEqual(['Sad']);
    expect(chunkEntry(entry(1, ''))).toEqual([]);
  });
});

describe('entryHash', () => {
  it('is stable, and changes when the searchable text changes', () => {
    const a = entry(1, 'hello there');
    expect(entryHash(a)).toBe(entryHash({ ...a }));
    expect(entryHash(a)).not.toBe(entryHash({ ...a, content: 'hello there!' }));
    expect(entryHash(a)).not.toBe(entryHash({ ...a, mood: 'Happy' }));
    // Things that are not searched do not matter.
    expect(entryHash(a)).toBe(entryHash({ ...a, date: '2020-01-01T00:00', images: ['x'] }));
  });
});

describe('vectors', () => {
  it('normalizes to length 1', () => {
    const v = normalize([3, 4]);
    expect(dot(v, v)).toBeCloseTo(1, 6);
    expect(Array.from(normalize([0, 0]))).toEqual([0, 0]);
  });

  it('survives being stored as one byte per number', () => {
    const v = fakeVector('anxious about the deadline at work');
    const back = decodeVector(encodeVector(v));
    expect(back).toHaveLength(v.length);
    expect(dot(v, back)).toBeGreaterThan(0.99);
    expect(encodeVector(v).length).toBeLessThan(v.length * 2);
  });
});

describe('indexPlan / updateIndex', () => {
  const entries = [entry(1, 'nervous about work'), entry(2, 'sunny beach day'), entry(3, '')];

  it('plans new entries as stale, and skips ones with nothing to embed', () => {
    const { stale, removed } = indexPlan(entries, {});
    expect(stale.map((e) => e.id)).toEqual([1, 2]);
    expect(removed).toEqual([]);
  });

  it('embeds only what is new or changed, and drops deleted entries', async () => {
    const first = await updateIndex({ entries, embed: embedAll });
    expect(first.embedded).toBe(2);
    expect(Object.keys(first.index).sort()).toEqual(['1', '2']);

    const embed = vi.fn(embedAll);
    const edited = [{ ...entries[0], content: 'nervous about work today' }, entries[1], entry(4, 'rain all day')];
    const second = await updateIndex({ entries: edited, index: first.index, embed });
    expect(second.embedded).toBe(2); // the edit and the new one
    expect(embed.mock.calls.flat(2)).not.toContain('sunny beach day');
    expect(Object.keys(second.index).sort()).toEqual(['1', '2', '4']);

    const third = await updateIndex({ entries: [entries[1]], index: second.index, embed: embedAll });
    expect(third.removed).toBe(2);
    expect(Object.keys(third.index)).toEqual(['2']);
  });

  it('reports progress per batch and passes the index so far', async () => {
    const many = Array.from({ length: 20 }, (_, i) => entry(i + 1, `entry number ${i} about rain`));
    const progress = [];
    const sizes = [];
    await updateIndex({
      entries: many,
      embed: embedAll,
      batchSize: 8,
      onProgress: (done, total) => progress.push([done, total]),
      onBatch: (index) => sizes.push(Object.keys(index).length),
    });
    expect(progress).toEqual([[8, 20], [16, 20], [20, 20]]);
    expect(sizes).toEqual([8, 16, 20]);
  });

  it('can be stopped part-way and keeps what it finished', async () => {
    const many = Array.from({ length: 20 }, (_, i) => entry(i + 1, `entry ${i}`));
    let batches = 0;
    const result = await updateIndex({
      entries: many,
      embed: embedAll,
      batchSize: 5,
      onBatch: () => {
        batches += 1;
      },
      shouldStop: () => batches >= 2,
    });
    expect(Object.keys(result.index)).toHaveLength(10);
  });

  it('gives each entry of a multi-chunk entry its own vectors', async () => {
    const long = entry(1, Array.from({ length: 400 }, () => 'rain').join(' '));
    const { index } = await updateIndex({ entries: [long], embed: embedAll });
    expect(index['1'].chunks.length).toBeGreaterThan(1);
  });
});

describe('searchIndex / similarEntries', () => {
  const entries = [
    entry(1, 'I felt so nervous before the meeting at the office'),
    entry(2, 'Sunny day at the beach, warm and bright'),
    entry(3, 'Stressed about the deadline, my boss is worried too'),
    entry(4, 'Rain all day, I stayed in with an umbrella by the door'),
  ];

  it('finds entries by meaning even when no words match', async () => {
    const { index } = await updateIndex({ entries, embed: embedAll });
    const hits = searchIndex(fakeVector('a day I felt overwhelmed by work'), index);
    expect(hits.map((h) => h.id).slice(0, 2).sort()).toEqual(['1', '3']);
    expect(hits[0].score).toBeGreaterThan(hits[hits.length - 1].score);
  });

  it('drops weak matches, honors the limit, and handles an empty index', async () => {
    const { index } = await updateIndex({ entries, embed: embedAll });
    const hits = searchIndex(fakeVector('beach'), index);
    expect(hits.map((h) => h.id)).toEqual(['2']);
    expect(searchIndex(fakeVector('work'), index, { limit: 1 })).toHaveLength(1);
    expect(searchIndex(fakeVector('work'), {})).toEqual([]);
  });

  it('scores an entry by its best chunk', async () => {
    const filler = Array.from({ length: 300 }, () => 'unrelated').join(' ');
    const long = entry(9, `${filler} beach beach beach`);
    const { index } = await updateIndex({ entries: [long], embed: embedAll });
    expect(searchIndex(fakeVector('beach sunny'), index, { minScore: 0.3 }).map((h) => h.id)).toEqual(['9']);
  });

  it('finds entries like another entry, leaving that entry out', async () => {
    const { index } = await updateIndex({ entries, embed: embedAll });
    const like1 = similarEntries(1, index, { minScore: 0.5 });
    expect(like1.map((h) => h.id)).toEqual(['3']);
    expect(similarEntries(99, index)).toEqual([]);
  });
});

describe('embedder', () => {
  afterEach(() => setEmbedderFactory(null));

  it('loads the model once and shares it', async () => {
    const { factory, calls } = makeFakeFactory();
    setEmbedderFactory(factory);
    expect(isEmbedderLoaded()).toBe(false);
    const [a, b] = await Promise.all([getEmbedder(), getEmbedder()]);
    expect(a).toBe(b);
    expect(calls.loads).toBe(1);
    expect(isEmbedderLoaded()).toBe(true);
  });

  it('does not remember a failed load, so it can be retried', async () => {
    const bad = makeFakeFactory({ fail: true });
    setEmbedderFactory(bad.factory);
    await expect(getEmbedder()).rejects.toThrow('network down');
    expect(isEmbedderLoaded()).toBe(false);
    const good = makeFakeFactory();
    setEmbedderFactory(good.factory);
    await expect(getEmbedder()).resolves.toBeTruthy();
  });

  it('turns per-file download events into one overall percentage', () => {
    const seen = [];
    const track = makeProgressTracker((p) => seen.push(p));
    track({ status: 'progress', file: 'a.onnx', loaded: 10, total: 100 });
    track({ status: 'progress', file: 'b.json', loaded: 50, total: 100 });
    track({ status: 'progress', file: 'a.onnx', loaded: 100, total: 100 });
    track({ status: 'done', file: 'b.json' });
    track({ status: 'initiate', file: 'c' });
    track(undefined);
    expect(seen).toEqual([10, 30, 75, 100]);
  });
});

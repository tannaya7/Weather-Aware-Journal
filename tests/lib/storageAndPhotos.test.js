import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CRITICAL_AT,
  SYNC_LIMIT_BYTES,
  WARN_AT,
  dataUrlBytes,
  formatBytes,
  getStorageStatus,
  journalBreakdown,
  requestPersistence,
  syncSize,
} from '../../src/lib/storageQuota.js';
import { SHRINK_DEFAULTS, shrinkDataUrl, shrinkPhotos, shrinkable } from '../../src/lib/photoShrink.js';
import { classifyFailure } from '../../src/lib/syncStatus.js';

// A data URL that holds exactly `bytes` bytes of picture.
function photo(bytes, type = 'image/jpeg') {
  return `data:${type};base64,${btoa('x'.repeat(bytes))}`;
}
const KB = 1024;
const MB = 1024 * 1024;

describe('formatBytes', () => {
  it('writes sizes people can read', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * MB)).toBe('5 MB');
    expect(formatBytes(123.4 * MB)).toBe('123 MB');
    expect(formatBytes(3.2 * 1024 * MB)).toBe('3.2 GB');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('getStorageStatus', () => {
  const storage = (usage, quota, persisted = false) => ({
    estimate: async () => ({ usage, quota }),
    persisted: async () => persisted,
  });

  it('reports usage as a share of the quota, with a level', async () => {
    expect(await getStorageStatus(storage(10 * MB, 1000 * MB))).toMatchObject({ supported: true, fraction: 0.01, level: 'ok', persisted: false });
    expect((await getStorageStatus(storage(WARN_AT * 100, 100))).level).toBe('warn');
    expect((await getStorageStatus(storage(CRITICAL_AT * 100, 100))).level).toBe('critical');
    expect((await getStorageStatus(storage(79, 100))).level).toBe('ok');
  });

  it('knows whether the browser promised to keep the data', async () => {
    expect((await getStorageStatus(storage(1, 100, true))).persisted).toBe(true);
  });

  it('copes with a browser that cannot say', async () => {
    expect(await getStorageStatus(undefined)).toEqual({ supported: false });
    expect(await getStorageStatus({})).toEqual({ supported: false });
    expect(await getStorageStatus({ estimate: async () => { throw new Error('no'); } })).toEqual({ supported: false });
    expect((await getStorageStatus({ estimate: async () => ({ usage: 5, quota: 0 }) })).fraction).toBe(0);
    expect((await getStorageStatus({ estimate: async () => ({ usage: 1, quota: 10 }) })).persisted).toBeNull();
  });
});

describe('requestPersistence', () => {
  it('says whether the browser agreed', async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe(true);
    expect(await requestPersistence({ persist: async () => false })).toBe(false);
    expect(await requestPersistence({ persist: async () => { throw new Error('no'); } })).toBe(false);
    expect(await requestPersistence(undefined)).toBe(false);
  });
});

describe('dataUrlBytes / journalBreakdown / syncSize', () => {
  it('measures the picture, not its text form', () => {
    expect(dataUrlBytes(photo(300))).toBe(300);
    expect(dataUrlBytes(photo(301))).toBe(301); // base64 padding handled
    expect(dataUrlBytes(photo(302))).toBe(302);
    expect(dataUrlBytes('')).toBe(0);
    expect(dataUrlBytes(undefined)).toBe(0);
  });

  it('adds up writing, photos (new and old style), and voice memos', () => {
    const entries = [
      { content: 'hello', images: [photo(1000), photo(2000)], tags: ['a'] },
      { content: 'x'.repeat(100), image: photo(500), history: [{ content: 'older text' }] },
      { content: '', audio: [{ src: photo(4000, 'audio/webm') }] },
    ];
    const b = journalBreakdown(entries);
    expect(b).toMatchObject({ photos: 3, photoBytes: 3500, voice: 1, voiceBytes: 4000 });
    expect(b.text).toBe(5 + 1 + 100 + 'older text'.length);
    expect(b.total).toBe(b.text + 3500 + 4000);
    expect(journalBreakdown([])).toMatchObject({ total: 0, photos: 0 });
  });

  it('compares the journal with what sync accepts, allowing for encoding overhead', () => {
    const small = syncSize([{ content: 'hi' }]);
    expect(small.level).toBe('ok');
    const big = syncSize([{ images: [photo(10 * MB)] }]);
    expect(big.estimated).toBeCloseTo(10 * MB * (4 / 3), -3);
    expect(big.level).toBe('ok'); // 13.3 of 20 MB
    expect(syncSize([{ images: [photo(11 * MB)] }]).level).toBe('close'); // 14.7 MB is 73%
    expect(syncSize([{ images: [photo(16 * MB)] }]).level).toBe('over'); // 21.3 MB
    expect(small.limit).toBe(SYNC_LIMIT_BYTES);
  });
});

describe('shrinkDataUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubBrowser({ width = 4000, height = 3000, out = 'data:image/jpeg;base64,SMALL' } = {}) {
    const close = vi.fn();
    const drawImage = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(out);
    return { close, drawImage, toDataURL };
  }

  it('draws the photo smaller and saves it as JPEG', async () => {
    const { drawImage, toDataURL, close } = stubBrowser();
    const result = await shrinkDataUrl(photo(2000, 'image/png'));
    expect(result).toBe('data:image/jpeg;base64,SMALL');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 960);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.78);
    expect(close).toHaveBeenCalled();
  });

  it('does not enlarge a photo that is already smaller than the limit', async () => {
    const { drawImage } = stubBrowser({ width: 800, height: 600 });
    await shrinkDataUrl(photo(2000));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
  });

  it('gives up quietly when the browser cannot, or the photo is not readable', async () => {
    expect(await shrinkDataUrl(photo(100))).toBeNull(); // no createImageBitmap in the test browser
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad image')));
    expect(await shrinkDataUrl(photo(100))).toBeNull();
    expect(await shrinkDataUrl('https://example.com/a.jpg')).toBeNull();
    expect(await shrinkDataUrl(null)).toBeNull();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(await shrinkDataUrl(photo(100))).toBeNull();
  });
});

describe('shrinkPhotos', () => {
  const BIG = 400 * KB;
  const SMALL = 20 * KB;
  const half = (url) => photo(Math.round(dataUrlBytes(url) / 2));

  function makeEntries() {
    return [
      { id: 1, images: [photo(BIG), photo(SMALL)] },
      { id: 2, image: photo(BIG) }, // old single-photo style
      { id: 3, images: [photo(SMALL)] }, // nothing to do
      { id: 4, content: 'no photos' },
    ];
  }

  it('shrinks the big photos, leaves small ones, and saves each entry', async () => {
    const saved = [];
    const shrink = vi.fn(async (url) => half(url));
    const progress = [];
    const result = await shrinkPhotos({
      entries: makeEntries(),
      shrink,
      update: async (id, data) => saved.push([id, data]),
      onProgress: (p) => progress.push(p),
    });

    expect(shrink).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ photosShrunk: 2, failed: 0, stopped: false, total: 2 });
    expect(result.bytesSaved).toBe(BIG); // two photos, each saved half of 400 KB
    expect(saved.map(([id]) => id)).toEqual([1, 2]);
    expect(dataUrlBytes(saved[0][1].images[0])).toBe(BIG / 2);
    expect(saved[0][1].images[1]).toBe(makeEntries()[0].images[1]); // the small one is untouched
    expect(saved[1][1]).toMatchObject({ image: undefined }); // old style moves to images
    expect(saved[1][1].images).toHaveLength(1);
    expect(progress.map((p) => [p.done, p.total])).toEqual([[1, 2], [2, 2]]);
  });

  it('keeps a photo that would not get at least 15% smaller', async () => {
    const saved = [];
    const result = await shrinkPhotos({
      entries: [{ id: 1, images: [photo(BIG)] }],
      shrink: async (url) => photo(Math.round(dataUrlBytes(url) * 0.9)),
      update: async (...args) => saved.push(args),
    });
    expect(result.photosShrunk).toBe(0);
    expect(saved).toEqual([]);
  });

  it('keeps a photo the browser could not shrink, and counts a crash as a failure', async () => {
    const saved = [];
    let calls = 0;
    const result = await shrinkPhotos({
      entries: [
        { id: 1, images: [photo(BIG)] },
        { id: 2, images: [photo(BIG)] },
      ],
      shrink: async () => {
        if (calls++ === 0) throw new Error('boom');
        return null; // the browser could not do it
      },
      update: async (...args) => saved.push(args),
    });
    expect(result.photosShrunk).toBe(0);
    expect(result.failed).toBe(1);
    expect(saved).toEqual([]);
  });

  it('can be stopped, keeping what was finished, and carried on later', async () => {
    const saved = [];
    const entries = makeEntries();
    // A real shrink lands near the same size again, so a second pass has
    // nothing to gain; model that with a fixed result.
    const shrink = async () => photo(100 * KB);
    const update = async (id, data) => {
      saved.push(id);
      Object.assign(entries.find((e) => e.id === id), data);
    };

    let asked = 0;
    const first = await shrinkPhotos({ entries, shrink, update, shouldStop: () => asked++ >= 1 });
    expect(first).toMatchObject({ stopped: true, photosShrunk: 1 });
    expect(saved).toEqual([1]);

    // A second run finds only what is left.
    const again = await shrinkPhotos({ entries, shrink, update });
    expect(again).toMatchObject({ stopped: false, photosShrunk: 1, total: 1 });
    expect(saved).toEqual([1, 2]);

    // And a third has nothing left to do.
    const nothing = await shrinkPhotos({ entries, shrink, update });
    expect(nothing).toMatchObject({ photosShrunk: 0, total: 0 });
    expect(saved).toEqual([1, 2]);
  });

  it('reports what a run would work on', () => {
    const entries = makeEntries();
    expect(shrinkable(entries)).toEqual({ photos: 2, bytes: 2 * BIG });
    expect(shrinkable([])).toEqual({ photos: 0, bytes: 0 });
    expect(shrinkable(entries, { ...SHRINK_DEFAULTS, skipBelowBytes: 10 }).photos).toBe(4);
  });
});

describe('a journal that is too big to sync', () => {
  it('pauses with advice instead of retrying forever', () => {
    const failure = classifyFailure({ code: 'too-large' });
    expect(failure.kind).toBe('paused');
    expect(failure.message).toMatch(/too big for the sync server/);
    expect(failure.message).toMatch(/Storage/);
  });
});

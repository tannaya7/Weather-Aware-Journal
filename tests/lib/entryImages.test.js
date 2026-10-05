import { describe, expect, it } from 'vitest';
import { getEntryImages } from '../../src/lib/entryImages.js';

describe('getEntryImages', () => {
  it('returns the images array for new entries', () => {
    expect(getEntryImages({ images: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('reads the single image field from older entries', () => {
    expect(getEntryImages({ image: 'old' })).toEqual(['old']);
  });

  it('prefers images over the old field when both exist', () => {
    expect(getEntryImages({ images: ['new'], image: 'old' })).toEqual(['new']);
  });

  it('returns an empty list when there are no photos', () => {
    expect(getEntryImages({})).toEqual([]);
    expect(getEntryImages(null)).toEqual([]);
    expect(getEntryImages({ images: [null, ''] })).toEqual([]);
  });
});

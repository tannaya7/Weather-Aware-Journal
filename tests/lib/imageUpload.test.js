import { describe, expect, it } from 'vitest';
import { readImageFile } from '../../src/lib/imageUpload.js';

function makeFile({ type = 'image/png', size = 100 } = {}) {
  const bytes = new Uint8Array(size);
  return new File([bytes], 'photo.png', { type });
}

describe('readImageFile', () => {
  it('rejects non-image files', async () => {
    await expect(readImageFile(makeFile({ type: 'text/plain' }))).rejects.toThrow(
      'Please choose an image file.',
    );
  });

  it('rejects files over the size cap', async () => {
    await expect(readImageFile(makeFile({ size: 4 * 1024 * 1024 }))).rejects.toThrow(/too large/);
  });

  it('resolves with a data URL for a valid image', async () => {
    const result = await readImageFile(makeFile());
    expect(result).toMatch(/^data:image\/png/);
  });
});

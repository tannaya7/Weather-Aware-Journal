import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('rejects files that are far too big to be a photo', async () => {
    await expect(readImageFile(makeFile({ size: 21 * 1024 * 1024 }))).rejects.toThrow(/max 20MB/);
  });
});

describe('readImageFile shrinking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubBrowserImageApis({ width, height }) {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,SMALL');
    return { drawImage, close };
  }

  it('scales a large photo down to 2048px and re-encodes it as JPEG', async () => {
    const { drawImage, close } = stubBrowserImageApis({ width: 4000, height: 3000 });

    // Bigger than the 3MB cap, but fine because it gets shrunk.
    const result = await readImageFile(makeFile({ size: 6 * 1024 * 1024 }));

    expect(result).toBe('data:image/jpeg;base64,SMALL');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2048, 1536);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    expect(close).toHaveBeenCalled();
  });

  it('keeps a small photo as it is', async () => {
    const { drawImage } = stubBrowserImageApis({ width: 800, height: 600 });

    const result = await readImageFile(makeFile({ size: 1000 }));

    expect(result).toMatch(/^data:image\/png/);
    expect(drawImage).not.toHaveBeenCalled();
  });
});

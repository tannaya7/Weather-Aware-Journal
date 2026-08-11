const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB — localStorage has a small total quota

// Reads an <input type="file"> image into a base64 data URL for storage,
// since this app has no backend to upload to.
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error('That image is too large (max 3MB).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

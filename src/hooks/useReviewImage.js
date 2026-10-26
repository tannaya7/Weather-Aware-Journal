import { useEffect, useState } from 'react';
import { REVIEW_SIZE } from '../lib/yearReview.js';

const REVOKE_DELAY_MS = 10000;

// Renders a review card to a PNG blob (and a preview URL) by drawing the
// summary with `draw(ctx, summary)`. Null until drawn, or when there is no
// summary or no canvas support.
export function useReviewImage(summary, draw) {
  const [image, setImage] = useState(null); // { url, blob }

  useEffect(() => {
    if (!summary) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = REVIEW_SIZE.width;
    canvas.height = REVIEW_SIZE.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let cancelled = false;
    draw(ctx, summary);
    canvas.toBlob((blob) => {
      if (cancelled || !blob) return;
      setImage({ url: URL.createObjectURL(blob), blob });
    }, 'image/png');

    return () => {
      cancelled = true;
    };
  }, [summary, draw]);

  // A URL is freed a little after it stops being shown (a redraw, or leaving
  // the page). Freeing it at once can pull it out from under an <img> that
  // is still loading it, which fails with "file not found".
  useEffect(() => {
    if (!image) return undefined;
    return () => {
      setTimeout(() => URL.revokeObjectURL(image.url), REVOKE_DELAY_MS);
    };
  }, [image]);

  return image;
}

import { useEffect, useState } from 'react';
import { REVIEW_SIZE } from '../lib/yearReview.js';

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
    let url = null;
    draw(ctx, summary);
    canvas.toBlob((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setImage({ url, blob });
    }, 'image/png');

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [summary, draw]);

  return image;
}

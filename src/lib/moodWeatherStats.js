const POSITIVE_MOODS = new Set(['Happy', 'Peaceful', 'Excited']);
const NEGATIVE_MOODS = new Set(['Sad', 'Angry', 'Anxious']);

// Builds a weatherType x mood count matrix from entries that have both, plus
// a plain-language insight ("you tend to feel low on rainy days") computed
// from whichever weather condition has the strongest negative/positive mood
// lean — ignored below a small sample size so it doesn't over-claim from one
// entry.
export function computeMoodWeatherStats(entries) {
  const usable = entries.filter((e) => e.mood && e.weatherType);

  const weatherTypes = [];
  const moods = [];
  const matrix = {};

  for (const entry of usable) {
    if (!matrix[entry.weatherType]) {
      matrix[entry.weatherType] = {};
      weatherTypes.push(entry.weatherType);
    }
    if (!moods.includes(entry.mood)) moods.push(entry.mood);
    matrix[entry.weatherType][entry.mood] = (matrix[entry.weatherType][entry.mood] || 0) + 1;
  }

  let maxCount = 0;
  for (const weather of weatherTypes) {
    for (const mood of moods) {
      maxCount = Math.max(maxCount, matrix[weather][mood] || 0);
    }
  }

  const MIN_SAMPLE = 3;
  let insight = null;
  let bestLean = 0;

  for (const weather of weatherTypes) {
    const counts = matrix[weather];
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total < MIN_SAMPLE) continue;

    const negative = Object.entries(counts).reduce(
      (sum, [mood, n]) => sum + (NEGATIVE_MOODS.has(mood) ? n : 0),
      0,
    );
    const positive = Object.entries(counts).reduce(
      (sum, [mood, n]) => sum + (POSITIVE_MOODS.has(mood) ? n : 0),
      0,
    );

    const negativeShare = negative / total;
    const positiveShare = positive / total;

    if (negativeShare > 0.5 && negativeShare - positiveShare > bestLean) {
      bestLean = negativeShare - positiveShare;
      insight = { tone: 'negative', weatherType: weather, share: negativeShare };
    } else if (positiveShare > 0.5 && positiveShare - negativeShare > bestLean) {
      bestLean = positiveShare - negativeShare;
      insight = { tone: 'positive', weatherType: weather, share: positiveShare };
    }
  }

  return { weatherTypes, moods, matrix, maxCount, insight, sampleSize: usable.length };
}

export function insightText(stats) {
  if (!stats.insight) {
    return stats.sampleSize < 3
      ? 'Add a few more entries with weather and mood to see patterns here.'
      : "No strong mood/weather pattern yet — you're pretty steady across conditions.";
  }

  const { tone, weatherType, share } = stats.insight;
  const percent = Math.round(share * 100);
  return tone === 'negative'
    ? `Your mood runs lower on ${weatherType.toLowerCase()} days — ${percent}% of those entries were a low mood.`
    : `Your mood runs highest on ${weatherType.toLowerCase()} days — ${percent}% of those entries were a good mood.`;
}

// Aggregates entries into { mood: count } and returns them sorted by count desc.
export function computeMoodCounts(entries) {
  const counts = entries.reduce((acc, entry) => {
    const key = entry.mood || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const total = entries.length;

  return Object.entries(counts)
    .map(([mood, count]) => ({ mood, count, percent: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

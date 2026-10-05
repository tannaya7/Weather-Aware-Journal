// Export/import helpers for backing up and restoring journal entries as JSON.

export function buildExportFilename(date = new Date()) {
  const iso = date.toISOString().slice(0, 10);
  return `weather-journal-export-${iso}.json`;
}

export function serializeEntries(entries) {
  return JSON.stringify(entries, null, 2);
}

// Content is the only required field. Titles are derived from the first
// line (see lib/entryTitle.js), so current entries have none — an explicit
// title only appears on older entries and must then be a string.
function isEntryShaped(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.content === 'string' &&
    (value.title === undefined || typeof value.title === 'string')
  );
}

// Parses an imported JSON string and merges new entries into the existing list,
// skipping any whose id already exists. Returns { entries, importedCount, skippedCount }.
export function mergeImportedEntries(existingEntries, jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array of journal entries.');
  }

  const existingIds = new Set(existingEntries.map((e) => e.id));
  const toImport = [];
  let skippedCount = 0;

  for (const item of parsed) {
    if (!isEntryShaped(item)) {
      skippedCount += 1;
      continue;
    }
    const withId = item.id ? item : { ...item, id: Date.now() + Math.random() };
    if (existingIds.has(withId.id)) {
      skippedCount += 1;
      continue;
    }
    existingIds.add(withId.id);
    toImport.push(withId);
  }

  return {
    entries: [...existingEntries, ...toImport],
    importedCount: toImport.length,
    skippedCount,
  };
}

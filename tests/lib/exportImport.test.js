import { describe, expect, it } from 'vitest';
import { mergeImportedEntries, serializeEntries } from '../../src/lib/exportImport.js';

describe('mergeImportedEntries', () => {
  it('throws on invalid JSON', () => {
    expect(() => mergeImportedEntries([], 'not json')).toThrow('not valid JSON');
  });

  it('throws when the JSON is not an array', () => {
    expect(() => mergeImportedEntries([], JSON.stringify({ foo: 'bar' }))).toThrow('JSON array');
  });

  it('imports entry-shaped objects and skips malformed ones', () => {
    const incoming = JSON.stringify([
      { id: 1, title: 'A', content: 'a' },
      { title: 'no content' },
      { id: 3, title: 'C', content: 'c' },
    ]);
    const result = mergeImportedEntries([], incoming);
    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.entries.map((e) => e.id)).toEqual([1, 3]);
  });

  it('skips entries whose id already exists', () => {
    const existing = [{ id: 1, title: 'Existing', content: 'x' }];
    const incoming = JSON.stringify([{ id: 1, title: 'Dup', content: 'y' }]);
    const result = mergeImportedEntries(existing, incoming);
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.entries).toHaveLength(1);
  });
});

describe('serializeEntries', () => {
  it('serializes entries as pretty JSON', () => {
    const json = serializeEntries([{ id: 1 }]);
    expect(JSON.parse(json)).toEqual([{ id: 1 }]);
  });
});

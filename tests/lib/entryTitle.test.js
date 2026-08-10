import { describe, expect, it } from 'vitest';
import { getEntryTitle } from '../../src/lib/entryTitle.js';

describe('getEntryTitle', () => {
  it('prefers an explicit stored title', () => {
    expect(getEntryTitle({ title: 'My Title', content: 'Something else entirely' })).toBe(
      'My Title',
    );
  });

  it('derives the title from the first non-blank line of content', () => {
    expect(getEntryTitle({ content: '\n\nHiked to the summit today.\nIt rained later.' })).toBe(
      'Hiked to the summit today.',
    );
  });

  it('truncates a long first line with an ellipsis', () => {
    const longLine = 'a'.repeat(80);
    const result = getEntryTitle({ content: longLine }, 60);
    expect(result).toHaveLength(60);
    expect(result.endsWith('…')).toBe(true);
  });

  it('falls back to the formatted date when content is empty', () => {
    expect(getEntryTitle({ content: '   ', date: '2025-11-28T10:00' })).toBe('28 Nov 2025');
  });

  it('falls back to "Untitled entry" when there is nothing to go on', () => {
    expect(getEntryTitle({ content: '' })).toBe('Untitled entry');
    expect(getEntryTitle(null)).toBe('Untitled entry');
  });
});

import { describe, expect, it } from 'vitest';
import { formatDateLong, getDateBadgeParts } from '../../src/lib/dateFormat.js';

describe('formatDateLong', () => {
  it('formats as "Weekday, D Month YYYY"', () => {
    expect(formatDateLong('2025-11-28T10:00')).toBe('Friday, 28 November 2025');
  });

  it('returns an empty string for a falsy input', () => {
    expect(formatDateLong('')).toBe('');
  });
});

describe('getDateBadgeParts', () => {
  it('returns day and short weekday', () => {
    expect(getDateBadgeParts('2025-11-28T10:00')).toEqual({ day: '28', weekday: 'Fri' });
  });

  it('falls back gracefully for missing/invalid dates', () => {
    expect(getDateBadgeParts('')).toEqual({ day: '—', weekday: '' });
    expect(getDateBadgeParts('garbage')).toEqual({ day: '—', weekday: '' });
  });
});

import { describe, expect, it } from 'vitest';
import { formatDateForCard, isSameDay } from '../../src/lib/dateFormat.js';

describe('formatDateForCard', () => {
  it('formats an ISO date as "DD Mon YYYY"', () => {
    expect(formatDateForCard('2025-11-28T10:00')).toBe('28 Nov 2025');
  });

  it('returns an empty string for a falsy input', () => {
    expect(formatDateForCard('')).toBe('');
    expect(formatDateForCard(undefined)).toBe('');
  });

  it('returns the original string when the date is invalid', () => {
    expect(formatDateForCard('not-a-date')).toBe('not-a-date');
  });
});

describe('isSameDay', () => {
  it('matches dates on the same calendar day', () => {
    const ref = new Date(2025, 10, 28, 23, 0);
    expect(isSameDay('2025-11-28T01:00', ref)).toBe(true);
  });

  it('does not match a different day', () => {
    const ref = new Date(2025, 10, 28);
    expect(isSameDay('2025-11-27T23:59', ref)).toBe(false);
  });

  it('returns false for invalid or missing input', () => {
    const ref = new Date();
    expect(isSameDay('', ref)).toBe(false);
    expect(isSameDay('garbage', ref)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { groupByPlace, namesToLocate } from '../../src/lib/mapPlaces.js';

describe('namesToLocate', () => {
  it('lists place names of entries that have no coordinates, once each', () => {
    expect(
      namesToLocate([
        { locationName: 'Paris, France' },
        { locationName: 'Paris, France' },
        { locationName: 'Oslo, Norway', latitude: 59.9, longitude: 10.7 },
        { locationName: '  ' },
        {},
      ]),
    ).toEqual(['Paris, France']);
  });
});

describe('groupByPlace', () => {
  it('puts entries from (almost) the same spot on one pin, newest first', () => {
    const places = groupByPlace([
      { id: 1, latitude: 17.3851, longitude: 78.4867, locationName: 'Hyderabad', date: '2026-01-01' },
      { id: 2, latitude: 17.38512, longitude: 78.48668, locationName: 'Hyderabad', date: '2026-03-01' },
      { id: 3, latitude: 59.91, longitude: 10.75, locationName: 'Oslo', date: '2026-02-01' },
    ]);

    expect(places).toHaveLength(2);
    const hyd = places.find((p) => p.locationName === 'Hyderabad');
    expect(hyd.entries.map((e) => e.id)).toEqual([2, 1]);
  });

  it('uses looked-up coordinates for entries that only have a name', () => {
    const located = new Map([['Paris, France', { latitude: 48.85, longitude: 2.35 }]]);
    const places = groupByPlace([{ id: 1, locationName: 'Paris, France', date: '2026-01-01' }], located);
    expect(places[0]).toMatchObject({ latitude: 48.85, longitude: 2.35, locationName: 'Paris, France' });
  });

  it('leaves out entries with no place at all', () => {
    expect(groupByPlace([{ id: 1, content: 'Somewhere' }])).toEqual([]);
  });
});

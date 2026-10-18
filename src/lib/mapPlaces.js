// Coordinates rounded to ~100m, so entries written at "the same place" share
// one pin instead of stacking dozens of markers on top of each other.
function placeKey(latitude, longitude) {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

function hasCoords(entry) {
  return typeof entry.latitude === 'number' && typeof entry.longitude === 'number';
}

// Place names of entries that have a location but no coordinates (saved
// before coordinates were stored). These get looked up once for the map.
export function namesToLocate(entries) {
  const names = new Set();
  for (const entry of entries) {
    if (!hasCoords(entry) && entry.locationName?.trim()) names.add(entry.locationName.trim());
  }
  return [...names];
}

// Groups entries into map pins. `located` maps a place name to coordinates
// found for entries without their own.
export function groupByPlace(entries, located = new Map()) {
  const places = new Map();

  for (const entry of entries) {
    let coords = hasCoords(entry) ? entry : located.get(entry.locationName?.trim());
    if (!coords) continue;
    const key = placeKey(coords.latitude, coords.longitude);
    if (!places.has(key)) {
      places.set(key, {
        key,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationName: entry.locationName || 'Unnamed place',
        entries: [],
      });
    }
    places.get(key).entries.push(entry);
  }

  return [...places.values()].map((place) => ({
    ...place,
    entries: place.entries.sort((a, b) => new Date(b.date) - new Date(a.date)),
  }));
}

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { geocodeCity } from '../lib/weatherApi.js';
import { groupByPlace, namesToLocate } from '../lib/mapPlaces.js';
import { getEntryTitle } from '../lib/entryTitle.js';
import { formatDateForCard } from '../lib/dateFormat.js';
import { emojiForMood } from '../lib/moods.js';
import styles from './MapPage.module.css';

const MAX_IN_POPUP = 5;

// Place-name lookups for older entries, kept for the session so revisiting
// the map doesn't look them up again.
const locatedCache = new Map();

function locate(name) {
  if (!locatedCache.has(name)) {
    locatedCache.set(
      name,
      geocodeCity(name).catch(() => null),
    );
  }
  return locatedCache.get(name);
}

// Popup content is built with DOM nodes and textContent: entry text is the
// user's own, but it's still never treated as HTML.
function popupContent(place) {
  const root = document.createElement('div');
  root.className = styles.popup;

  const heading = document.createElement('strong');
  heading.textContent = `${place.locationName} · ${place.entries.length} ${
    place.entries.length === 1 ? 'entry' : 'entries'
  }`;
  root.appendChild(heading);

  const list = document.createElement('ul');
  for (const entry of place.entries.slice(0, MAX_IN_POPUP)) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#/entry/${entry.id}`;
    const mood = entry.mood ? `${emojiForMood(entry.mood)} ` : '';
    link.textContent = `${mood}${getEntryTitle(entry)}`;
    const date = document.createElement('span');
    date.textContent = formatDateForCard(entry.date);
    item.append(link, date);
    list.appendChild(item);
  }
  root.appendChild(list);

  if (place.entries.length > MAX_IN_POPUP) {
    const more = document.createElement('p');
    more.textContent = `and ${place.entries.length - MAX_IN_POPUP} more`;
    root.appendChild(more);
  }
  return root;
}

function pinIcon(place) {
  const count = place.entries.length;
  const latestMood = place.entries[0]?.mood;
  const span = document.createElement('span');
  span.className = styles.pin;
  span.textContent = latestMood ? emojiForMood(latestMood) : '📍';
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = styles.badge;
    badge.textContent = String(count);
    span.appendChild(badge);
  }
  // Emoji pins instead of Leaflet's default image markers, which need image
  // files the bundler doesn't copy.
  return L.divIcon({ html: span, className: styles.pinWrap, iconSize: [36, 36], iconAnchor: [18, 18] });
}

export function MapPage() {
  const { entries } = useEntriesContext();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [located, setLocated] = useState(() => new Map());
  const [locating, setLocating] = useState(0);

  const names = useMemo(() => namesToLocate(entries), [entries]);
  const places = useMemo(() => groupByPlace(entries, located), [entries, located]);
  const unplaced = entries.filter((e) => !e.locationName && typeof e.latitude !== 'number').length;

  // Look up coordinates for older entries that only have a place name.
  useEffect(() => {
    let cancelled = false;
    const missing = names.filter((name) => !located.has(name));
    if (missing.length === 0) return undefined;
    setLocating(missing.length);
    Promise.all(missing.map((name) => locate(name).then((place) => [name, place]))).then((results) => {
      if (cancelled) return;
      setLocated((prev) => {
        const next = new Map(prev);
        for (const [name, place] of results) if (place) next.set(name, place);
        return next;
      });
      setLocating(0);
    });
    return () => {
      cancelled = true;
    };
  }, [names, located]);

  // Create the map once.
  useEffect(() => {
    if (!mapEl.current) return undefined;
    const map = L.map(mapEl.current, { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw pins whenever the places change, and fit the view to them.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const place of places) {
      L.marker([place.latitude, place.longitude], {
        icon: pinIcon(place),
        title: `${place.locationName}: ${place.entries.length} ${place.entries.length === 1 ? 'entry' : 'entries'}`,
        keyboard: true,
      })
        .bindPopup(popupContent(place))
        .addTo(layer);
    }
    if (places.length === 1) {
      map.setView([places[0].latitude, places[0].longitude], 10);
    } else if (places.length > 1) {
      map.fitBounds(
        places.map((p) => [p.latitude, p.longitude]),
        { padding: [40, 40], maxZoom: 10 },
      );
    }
  }, [places]);

  const placedCount = places.reduce((n, p) => n + p.entries.length, 0);

  return (
    <>
      <Header title="Map" icon="🗺️">
        <ThemeToggle />
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        <p className={styles.summary} role="status">
          {locating > 0
            ? `Finding ${locating} ${locating === 1 ? 'place' : 'places'}…`
            : places.length === 0
              ? 'Entries with a place will show up here. Add a city or use your location when you write.'
              : `${placedCount} ${placedCount === 1 ? 'entry' : 'entries'} in ${places.length} ${
                  places.length === 1 ? 'place' : 'places'
                }${unplaced ? ` · ${unplaced} without a place` : ''}`}
        </p>
        <div
          ref={mapEl}
          className={styles.map}
          role="region"
          aria-label="Map of where your entries were written"
        />
        {places.length > 0 && (
          <details className={styles.listToggle}>
            <summary>List of places</summary>
            <ul className={styles.placeList}>
              {places.map((place) => (
                <li key={place.key}>
                  <strong>{place.locationName}</strong> — {place.entries.length}{' '}
                  {place.entries.length === 1 ? 'entry' : 'entries'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}

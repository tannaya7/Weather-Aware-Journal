import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { WeatherBox } from '../WeatherBox/WeatherBox.jsx';
import { useWeather } from '../../hooks/useWeather.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { MOODS } from '../../lib/moods.js';
import styles from './EntryForm.module.css';

function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EntryForm({ mode, initialEntry, onSubmit }) {
  const isEdit = mode === 'edit';
  const { announce } = useAnnouncer();

  const [content, setContent] = useState(initialEntry?.content || '');
  const [mood, setMood] = useState(initialEntry?.mood || '');
  const [date, setDate] = useState(toDatetimeLocal(initialEntry?.date));
  const [tagsRaw, setTagsRaw] = useState((initialEntry?.tags || []).join(', '));
  const [background, setBackground] = useState(initialEntry?.background || 'default');
  const [font, setFont] = useState(initialEntry?.font || 'default');
  const [location, setLocation] = useState(initialEntry?.locationName || '');
  const [contentError, setContentError] = useState(false);

  const initialWeather = initialEntry?.weatherIcon
    ? {
        icon: initialEntry.weatherIcon,
        temperature: initialEntry.temperature,
        weatherType: initialEntry.weatherType,
        humidity: initialEntry.humidity,
        windSpeed: initialEntry.windSpeed,
        locationName: initialEntry.locationName,
      }
    : null;

  const { weather, status, statusMessage, fetchForCity } = useWeather(initialWeather);

  function handleSubmit(e) {
    e.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setContentError(true);
      announce('Form validation failed. Write something before saving.', 'assertive');
      document.getElementById('contentInput')?.focus();
      return;
    }
    setContentError(false);

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSubmit({
      content: trimmedContent,
      mood,
      date: date || toDatetimeLocal(),
      tags,
      background,
      font,
      weatherIcon: weather?.icon,
      temperature: weather?.temperature,
      weatherType: weather?.weatherType,
      humidity: weather?.humidity,
      windSpeed: weather?.windSpeed,
      locationName: weather?.locationName || location.trim() || undefined,
    });

    announce(isEdit ? 'Journal entry updated successfully.' : 'Journal entry saved.', 'assertive');
  }

  return (
    <form id="entryForm" className={styles.form} noValidate onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="contentInput">
        What&apos;s on your mind?
      </label>
      <textarea
        id="contentInput"
        className={styles.contentField}
        placeholder="Dear journal…"
        aria-required="true"
        aria-invalid={contentError}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {contentError ? 'Write something before saving.' : ''}
      </div>

      <fieldset className={styles.moodFieldset}>
        <legend className={styles.quietLabel}>
          Mood <span className={styles.optional}>(optional)</span>
        </legend>
        <div className={styles.moodChips}>
          {MOODS.map((m) => (
            <label key={m.value} className={styles.moodChip}>
              <input
                type="radio"
                name="mood"
                value={m.value}
                checked={mood === m.value}
                onChange={() => setMood(m.value)}
                className="sr-only"
              />
              <span aria-hidden="true">{m.emoji}</span> {m.value}
            </label>
          ))}
          {mood && (
            <button type="button" className={styles.clearMood} onClick={() => setMood('')}>
              Clear
            </button>
          )}
        </div>
      </fieldset>

      <div className={styles.metaRow}>
        <label className={styles.quietLabel} htmlFor="dateInput">
          Date &amp; time
        </label>
        <input
          id="dateInput"
          className={styles.dateInput}
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <WeatherBox
        location={location}
        onLocationChange={setLocation}
        weather={weather}
        status={status}
        statusMessage={statusMessage}
        onFetch={() => fetchForCity(location)}
      />

      <div className={styles.field}>
        <label className={styles.quietLabel} htmlFor="tagsInput">
          Tags <span className={styles.optional}>(optional, comma-separated)</span>
        </label>
        <input
          id="tagsInput"
          className={styles.inputBox}
          type="text"
          placeholder="travel, inspiration, goals"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
        />
      </div>

      <details className={styles.appearanceDetails}>
        <summary className={styles.quietLabel}>Customize appearance</summary>
        <div className={styles.appearanceGrid}>
          <div>
            <label className={styles.quietLabel} htmlFor="backgroundInput">
              Background
            </label>
            <select
              id="backgroundInput"
              className={styles.inputBox}
              aria-label="Choose background style"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            >
              <option value="default">Default</option>
              <option value="light-blue">Light Blue</option>
              <option value="peach">Peach</option>
              <option value="dark">Dark Mode</option>
            </select>
          </div>

          <div>
            <label className={styles.quietLabel} htmlFor="fontInput">
              Font Style
            </label>
            <select
              id="fontInput"
              className={styles.inputBox}
              aria-label="Choose font style"
              value={font}
              onChange={(e) => setFont(e.target.value)}
            >
              <option value="default">Default</option>
              <option value="serif">Serif</option>
              <option value="handwritten">Handwritten</option>
              <option value="monospace">Monospace</option>
            </select>
          </div>
        </div>
      </details>

      <Button type="submit" className={styles.submitBtn}>
        {isEdit ? 'Save Changes' : 'Save Entry'}
      </Button>
    </form>
  );
}

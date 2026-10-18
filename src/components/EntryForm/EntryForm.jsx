import { useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { WeatherBox } from '../WeatherBox/WeatherBox.jsx';
import { useWeather } from '../../hooks/useWeather.js';
import { useDraftAutosave } from '../../hooks/useDraftAutosave.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { WritingPrompt } from '../WritingPrompt/WritingPrompt.jsx';
import { DictationButton } from '../DictationButton/DictationButton.jsx';
import { MOODS } from '../../lib/moods.js';
import { readImageFile } from '../../lib/imageUpload.js';
import { MAX_PHOTOS, getEntryImages } from '../../lib/entryImages.js';
import { pickSky } from '../../lib/sky.js';
import { cleanHabitValues } from '../../lib/habits.js';
import { HabitFields } from '../HabitFields/HabitFields.jsx';
import styles from './EntryForm.module.css';

function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function weatherOf(entry) {
  return entry?.weatherIcon
    ? {
        icon: entry.weatherIcon,
        temperature: entry.temperature,
        weatherType: entry.weatherType,
        humidity: entry.humidity,
        windSpeed: entry.windSpeed,
        locationName: entry.locationName,
        latitude: entry.latitude,
        longitude: entry.longitude,
        ...pickSky(entry),
      }
    : null;
}

// The form fields as a plain object: what a draft stores (photos are left
// out, they're too big to rewrite on every keystroke).
function formValuesOf(entry) {
  return {
    content: entry?.content || '',
    mood: entry?.mood || '',
    date: toDatetimeLocal(entry?.date),
    tagsRaw: (entry?.tags || []).join(', '),
    font: entry?.font || 'default',
    location: entry?.locationName || '',
    weather: weatherOf(entry),
    habits: entry?.habits || {},
  };
}

// The tracked habits' current values, plus whatever the entry already had
// for habits that are no longer tracked (so turning a habit off in
// Settings never erases old data).
function mergeHabits(saved, values, habits) {
  const tracked = new Set(habits.map((h) => h.id));
  const untracked = Object.fromEntries(Object.entries(saved || {}).filter(([id]) => !tracked.has(id)));
  const merged = { ...untracked, ...cleanHabitValues(values, habits) };
  return Object.keys(merged).length ? merged : undefined;
}

function formatSavedAt(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// `draft` (optional) is unsaved work restored from an earlier visit; it
// fills the form instead of initialEntry. onDraftChange receives the form's
// values as they change (or null when there's nothing to keep), and
// onDiscardDraft resets the form to the saved entry.
export function EntryForm({
  mode,
  initialEntry,
  onSubmit,
  draft,
  onDraftChange,
  onDiscardDraft,
  habits = [],
}) {
  const isEdit = mode === 'edit';
  const { announce } = useAnnouncer();

  const [baseline] = useState(() => formValuesOf(initialEntry));
  const start = draft || baseline;

  const [content, setContent] = useState(start.content);
  const [mood, setMood] = useState(start.mood);
  const [date, setDate] = useState(start.date);
  const [tagsRaw, setTagsRaw] = useState(start.tagsRaw);
  const [font, setFont] = useState(start.font);
  const [location, setLocation] = useState(start.location);
  const [habitValues, setHabitValues] = useState(start.habits || {});
  const [contentError, setContentError] = useState(false);
  const [images, setImages] = useState(() => getEntryImages(initialEntry));
  const [imageError, setImageError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const { weather, status, statusMessage, fetchForCity, fetchForCurrentLocation } = useWeather(
    start.weather,
  );

  const { stop: stopAutosave } = useDraftAutosave(
    { content, mood, date, tagsRaw, font, location, weather: weather || null, habits: habitValues },
    baseline,
    (values, meta) => onDraftChange?.(values && { ...values, savedAt: Date.now() }, meta),
  );

  async function handleImageChange(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length === 0) return;

    const room = MAX_PHOTOS - images.length;
    const added = [];
    let error = files.length > room ? `You can add up to ${MAX_PHOTOS} photos per entry.` : '';

    for (const file of files.slice(0, room)) {
      try {
        added.push(await readImageFile(file));
      } catch (err) {
        error = err.message;
      }
    }

    setImages((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    setImageError(error);
  }

  function handleRemoveImage(index) {
    setImages((current) => current.filter((_, i) => i !== index));
    setImageError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

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

    setSaving(true);
    const saved = await onSubmit({
      content: trimmedContent,
      mood,
      date: date || toDatetimeLocal(),
      tags,
      habits: mergeHabits(initialEntry?.habits, habitValues, habits),
      font,
      images: images.length ? images : undefined,
      image: undefined, // replaced by `images`; clears it on older entries
      weatherIcon: weather?.icon,
      temperature: weather?.temperature,
      weatherType: weather?.weatherType,
      humidity: weather?.humidity,
      windSpeed: weather?.windSpeed,
      locationName: weather?.locationName || location.trim() || undefined,
      latitude: weather?.latitude,
      longitude: weather?.longitude,
      ...pickSky(weather),
    });
    if (saved === false) {
      setSaving(false);
      return;
    }

    stopAutosave();
    announce(isEdit ? 'Journal entry updated successfully.' : 'Journal entry saved.', 'assertive');
  }

  // Dictated phrases are added at the end: on the current line after a
  // space, or right on a fresh line (e.g. under a writing prompt).
  function handleDictatedText(text) {
    if (!text) return;
    setContent((current) => {
      if (!current.trim()) return text;
      if (current.endsWith('\n')) return current + text;
      return `${current.replace(/[ \t]+$/, '')} ${text}`;
    });
    setContentError(false);
  }

  // The prompt becomes the entry's first line (and so its title), with the
  // cursor left on a fresh line below it.
  function handleUsePrompt(prompt) {
    const next = content.trim() ? `${prompt}\n\n${content}` : `${prompt}\n\n`;
    setContent(next);
    setContentError(false);

    const textarea = document.getElementById('contentInput');
    if (textarea) {
      textarea.focus();
      requestAnimationFrame(() => textarea.setSelectionRange(next.length, next.length));
    }
  }

  return (
    <form id="entryForm" className={styles.form} noValidate onSubmit={handleSubmit}>
      {draft && (
        <div className={styles.draftNotice} role="status">
          <span>
            Restored your unsaved draft{draft.savedAt ? ` from ${formatSavedAt(draft.savedAt)}` : ''}.
          </span>
          <button type="button" className={styles.discardDraft} onClick={onDiscardDraft}>
            Discard draft
          </button>
        </div>
      )}
      {!isEdit && <WritingPrompt weatherType={weather?.weatherType} onUse={handleUsePrompt} />}
      <DictationButton onText={handleDictatedText} />
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

      <HabitFields habits={habits} values={habitValues} onChange={setHabitValues} />

      <WeatherBox
        location={location}
        onLocationChange={setLocation}
        weather={weather}
        status={status}
        statusMessage={statusMessage}
        date={date}
        onFetch={() => fetchForCity(location, date)}
        onUseLocation={() => fetchForCurrentLocation(date)}
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

      <div className={styles.field}>
        <label className={styles.quietLabel} htmlFor="imageInput">
          Photos <span className={styles.optional}>(optional, up to {MAX_PHOTOS})</span>
        </label>
        {images.length > 0 && (
          <ul className={styles.imagePreviewList}>
            {images.map((src, index) => (
              <li key={index} className={styles.imagePreviewItem}>
                <img src={src} alt="" className={styles.imagePreview} />
                <button
                  type="button"
                  className={styles.removeImage}
                  onClick={() => handleRemoveImage(index)}
                  aria-label={`Remove photo ${index + 1}`}
                  title="Remove photo"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {images.length < MAX_PHOTOS && (
          <Button
            type="button"
            small
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            {images.length ? 'Add more photos' : 'Add photos'}
          </Button>
        )}
        <input
          ref={fileInputRef}
          id="imageInput"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={handleImageChange}
        />
        {imageError && (
          <p className={styles.imageError} role="alert">
            {imageError}
          </p>
        )}
      </div>

      <details className={styles.appearanceDetails}>
        <summary className={styles.quietLabel}>Customize appearance</summary>
        <div className={styles.appearanceGrid}>
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
        <p className={styles.appearanceNote}>
          Card color is set automatically from the weather you add below.
        </p>
      </details>

      <Button type="submit" className={styles.submitBtn} disabled={saving}>
        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Entry'}
      </Button>
    </form>
  );
}

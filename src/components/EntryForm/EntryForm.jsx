import { useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { WeatherBox } from '../WeatherBox/WeatherBox.jsx';
import { useWeather } from '../../hooks/useWeather.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { WritingPrompt } from '../WritingPrompt/WritingPrompt.jsx';
import { MOODS } from '../../lib/moods.js';
import { readImageFile } from '../../lib/imageUpload.js';
import { MAX_PHOTOS, getEntryImages } from '../../lib/entryImages.js';
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
  const [font, setFont] = useState(initialEntry?.font || 'default');
  const [location, setLocation] = useState(initialEntry?.locationName || '');
  const [contentError, setContentError] = useState(false);
  const [images, setImages] = useState(() => getEntryImages(initialEntry));
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef(null);

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

    const saved = onSubmit({
      content: trimmedContent,
      mood,
      date: date || toDatetimeLocal(),
      tags,
      font,
      images: images.length ? images : undefined,
      image: undefined, // replaced by `images`; clears it on older entries
      weatherIcon: weather?.icon,
      temperature: weather?.temperature,
      weatherType: weather?.weatherType,
      humidity: weather?.humidity,
      windSpeed: weather?.windSpeed,
      locationName: weather?.locationName || location.trim() || undefined,
    });
    if (saved === false) return;

    announce(isEdit ? 'Journal entry updated successfully.' : 'Journal entry saved.', 'assertive');
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
      {!isEdit && <WritingPrompt weatherType={weather?.weatherType} onUse={handleUsePrompt} />}
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

      <Button type="submit" className={styles.submitBtn}>
        {isEdit ? 'Save Changes' : 'Save Entry'}
      </Button>
    </form>
  );
}

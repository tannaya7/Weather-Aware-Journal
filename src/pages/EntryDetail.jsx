import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header/Header.jsx';
import { Button } from '../components/Button/Button.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { formatDateLong } from '../lib/dateFormat.js';
import { getEntryTitle } from '../lib/entryTitle.js';
import { emojiForMood } from '../lib/moods.js';
import { fontFamilyFor, weatherCardStyle } from '../lib/entryStyle.js';
import { getEntryImages } from '../lib/entryImages.js';
import { allHabits } from '../lib/habits.js';
import { SkyDetails } from '../components/SkyDetails/SkyDetails.jsx';
import { RichText } from '../components/RichText/RichText.jsx';
import { toggleChecklistLine } from '../lib/richText.js';
import { relatedEntries } from '../lib/search.js';
import { formatDuration } from '../hooks/useVoiceRecorder.js';
import { Link } from 'react-router-dom';
import styles from './EntryDetail.module.css';

function RelatedEntries({ entry, entries }) {
  const related = relatedEntries(entry, entries);
  if (related.length === 0) return null;
  return (
    <section className={styles.related} aria-labelledby="related-heading">
      <h2 id="related-heading" className={styles.relatedHeading}>
        Related entries
      </h2>
      <ul>
        {related.map((other) => (
          <li key={other.id}>
            <Link to={`/entry/${other.id}`}>{getEntryTitle(other)}</Link>
            <span>{formatDateLong(other.date)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HabitChips({ values, habits }) {
  const shown = habits.filter((h) => values?.[h.id] !== undefined && values[h.id] !== false);
  if (shown.length === 0) return null;
  return (
    <ul className={styles.habits} aria-label="Habits">
      {shown.map((h) => (
        <li key={h.id}>
          <span aria-hidden="true">{h.emoji}</span> {h.name}
          {h.type === 'number' ? `: ${values[h.id]} ${h.unit}` : ''}
        </li>
      ))}
    </ul>
  );
}

export function EntryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getEntryById, deleteEntry, updateEntry, habitConfig, entries } = useEntriesContext();
  const entry = getEntryById(id);

  if (!entry) {
    return (
      <>
        <Header title="Entry not found">
          <ThemeToggle />
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back to Journal
          </Button>
        </Header>
        <div className={`container ${styles.page}`} id="main-content" role="main">
          <p className={styles.notFound}>That entry couldn&apos;t be found. It may have been deleted.</p>
        </div>
      </>
    );
  }

  const title = getEntryTitle(entry);
  const images = getEntryImages(entry);

  // Leave first, so this page doesn't flash "not found" once the entry is
  // gone; the undo toast shows on the dashboard.
  function handleDelete() {
    navigate('/');
    deleteEntry(entry.id);
  }

  return (
    <>
      <Header title="Journal Entry">
        <ThemeToggle />
        <Button variant="secondary" onClick={() => navigate('/')} aria-label="Back to journal timeline">
          ← Back
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/edit/${entry.id}`)} aria-label={`Edit entry "${title}"`}>
          Edit
        </Button>
        <Button variant="danger" onClick={handleDelete} aria-label={`Delete entry "${title}"`}>
          Delete
        </Button>
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        <article
          className={styles.article}
          style={{ fontFamily: fontFamilyFor(entry), ...weatherCardStyle(entry) }}
        >
          <p className={styles.date}>{formatDateLong(entry.date)}</p>
          <h1 className={styles.title}>{title}</h1>

          <div className={styles.metaRow}>
            {entry.mood && (
              <span>
                <span aria-hidden="true">{emojiForMood(entry.mood)}</span> {entry.mood}
              </span>
            )}
            {entry.weatherIcon && (
              <span>
                <span aria-hidden="true">{entry.weatherIcon}</span> {entry.temperature} ·{' '}
                {entry.weatherType}
                {entry.locationName ? ` · ${entry.locationName}` : ''}
              </span>
            )}
          </div>
          <SkyDetails data={entry} date={entry.date} />
          <HabitChips values={entry.habits} habits={allHabits(habitConfig)} />

          {entry.tags?.length > 0 && (
            <div className={styles.tags}>
              {entry.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {images.length === 1 && <img src={images[0]} alt="" className={styles.image} decoding="async" />}
          {images.length > 1 && (
            <div className={styles.imageGrid}>
              {images.map((src, index) => (
                <img key={index} src={src} alt="" className={styles.gridImage} loading="lazy" decoding="async" />
              ))}
            </div>
          )}

          {entry.audio?.length > 0 && (
            <ul className={styles.memos} aria-label="Voice memos">
              {entry.audio.map((memo, i) => (
                <li key={memo.recordedAt || i}>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the person's own voice memo */}
                  <audio controls src={memo.src} preload="metadata" aria-label={`Voice memo ${i + 1}`} />
                  <span>{formatDuration(memo.duration || 0)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.content}>
            <RichText
              text={entry.content}
              onToggleCheck={(line) => updateEntry(entry.id, { content: toggleChecklistLine(entry.content, line) })}
            />
          </div>
        </article>

        <RelatedEntries entry={entry} entries={entries} />
      </div>
    </>
  );
}

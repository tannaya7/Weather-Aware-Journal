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
import styles from './EntryDetail.module.css';

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
  const { getEntryById, deleteEntry, habitConfig } = useEntriesContext();
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

          {images.length === 1 && <img src={images[0]} alt="" className={styles.image} />}
          {images.length > 1 && (
            <div className={styles.imageGrid}>
              {images.map((src, index) => (
                <img key={index} src={src} alt="" className={styles.gridImage} />
              ))}
            </div>
          )}

          <div className={styles.content}>{entry.content}</div>
        </article>
      </div>
    </>
  );
}

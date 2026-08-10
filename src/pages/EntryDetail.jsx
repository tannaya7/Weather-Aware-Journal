import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header/Header.jsx';
import { Button } from '../components/Button/Button.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { formatDateLong } from '../lib/dateFormat.js';
import { getEntryTitle } from '../lib/entryTitle.js';
import { emojiForMood } from '../lib/moods.js';
import { fontFamilyFor } from '../lib/entryStyle.js';
import styles from './EntryDetail.module.css';

const BACKGROUND_CLASS = {
  peach: styles.peach,
  'light-blue': styles.lightBlue,
  dark: styles.dark,
};

export function EntryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getEntryById, deleteEntry } = useEntriesContext();
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
  const extraClass = BACKGROUND_CLASS[entry.background] || '';

  function handleDelete() {
    deleteEntry(entry.id);
    navigate('/');
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
          className={[styles.article, extraClass].filter(Boolean).join(' ')}
          style={{ fontFamily: fontFamilyFor(entry) }}
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

          {entry.tags?.length > 0 && (
            <div className={styles.tags}>
              {entry.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className={styles.content}>{entry.content}</div>
        </article>
      </div>
    </>
  );
}

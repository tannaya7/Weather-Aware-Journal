import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header/Header.jsx';
import { EntryForm } from '../components/EntryForm/EntryForm.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { Button } from '../components/Button/Button.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import styles from './EntryFormPage.module.css';

export function EntryFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addEntry, updateEntry, getEntryById } = useEntriesContext();

  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef(null);

  useEffect(() => {
    if (saveError) saveErrorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [saveError]);

  const isEdit = Boolean(id);
  const existingEntry = isEdit ? getEntryById(id) : null;

  // Returns false when saving failed, so the form keeps what you wrote and
  // doesn't announce success.
  function handleSubmit(data) {
    try {
      if (isEdit && existingEntry) {
        updateEntry(existingEntry.id, data);
      } else {
        addEntry(data);
      }
    } catch (error) {
      setSaveError(error.message || 'Something went wrong saving this entry.');
      return false;
    }
    navigate('/');
    return true;
  }

  return (
    <>
      <Header title={isEdit ? 'Edit Entry' : 'Write'}>
        <ThemeToggle />
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate('/')}
          aria-label="Cancel and return to dashboard"
        >
          Cancel
        </Button>
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        {saveError && (
          <p ref={saveErrorRef} className={styles.saveError} role="alert">
            {saveError}
          </p>
        )}
        {isEdit && !existingEntry ? (
          <p>That entry couldn&apos;t be found. It may have been deleted.</p>
        ) : (
          <EntryForm
            key={id || 'new'}
            mode={isEdit ? 'edit' : 'create'}
            initialEntry={existingEntry}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </>
  );
}

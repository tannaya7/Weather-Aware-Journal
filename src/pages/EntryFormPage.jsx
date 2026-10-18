import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header/Header.jsx';
import { EntryForm } from '../components/EntryForm/EntryForm.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { Button } from '../components/Button/Button.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { enabledHabits } from '../lib/habits.js';
import styles from './EntryFormPage.module.css';

export function EntryFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addEntry, updateEntry, getEntryById, loadDraft, saveDraft, clearDraft, habitConfig } =
    useEntriesContext();
  const habits = useMemo(() => enabledHabits(habitConfig), [habitConfig]);

  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef(null);

  const isEdit = Boolean(id);
  const existingEntry = isEdit ? getEntryById(id) : null;
  const draftId = isEdit ? String(id) : 'new';

  // undefined while loading; null when there's no draft.
  const [draft, setDraft] = useState(undefined);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDraft(undefined);
    loadDraft(draftId)
      .then((value) => !cancelled && setDraft(value))
      .catch(() => !cancelled && setDraft(null));
    return () => {
      cancelled = true;
    };
  }, [draftId, loadDraft]);

  useEffect(() => {
    if (saveError) saveErrorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [saveError]);

  const handleDraftChange = useCallback(
    (value, meta) => {
      const write = value ? saveDraft(draftId, value, meta) : clearDraft(draftId);
      write.catch((error) => console.warn('Could not save the draft', error));
    },
    [draftId, saveDraft, clearDraft],
  );

  function handleDiscardDraft() {
    clearDraft(draftId).catch(() => {});
    setDraft(null);
    setFormKey((k) => k + 1);
  }

  function handleCancel() {
    clearDraft(draftId).catch(() => {});
    navigate('/');
  }

  // Returns false when saving failed, so the form keeps what you wrote and
  // doesn't announce success.
  async function handleSubmit(data) {
    try {
      if (isEdit && existingEntry) {
        await updateEntry(existingEntry.id, data);
      } else {
        await addEntry(data);
      }
    } catch (error) {
      setSaveError(error.message || 'Something went wrong saving this entry.');
      return false;
    }
    clearDraft(draftId).catch(() => {});
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
          onClick={handleCancel}
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
        ) : draft === undefined ? null : (
          <EntryForm
            key={`${draftId}-${formKey}`}
            mode={isEdit ? 'edit' : 'create'}
            initialEntry={existingEntry}
            draft={draft}
            onDraftChange={handleDraftChange}
            onDiscardDraft={handleDiscardDraft}
            onSubmit={handleSubmit}
            habits={habits}
          />
        )}
      </div>
    </>
  );
}

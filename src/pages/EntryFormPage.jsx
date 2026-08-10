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

  const isEdit = Boolean(id);
  const existingEntry = isEdit ? getEntryById(id) : null;

  function handleSubmit(data) {
    if (isEdit && existingEntry) {
      updateEntry(existingEntry.id, data);
    } else {
      addEntry(data);
    }
    navigate('/');
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

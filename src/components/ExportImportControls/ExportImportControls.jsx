import { useRef } from 'react';
import { Button } from '../Button/Button.jsx';
import { buildExportFilename, serializeEntries } from '../../lib/exportImport.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';

export function ExportImportControls({ entries, onImport }) {
  const fileInputRef = useRef(null);
  const { announce } = useAnnouncer();

  function handleExport() {
    const blob = new Blob([serializeEntries(entries)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    announce(`Exported ${entries.length} entries.`);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = onImport(text);
      announce(
        `Imported ${result.importedCount} entr${result.importedCount === 1 ? 'y' : 'ies'}.${
          result.skippedCount ? ` Skipped ${result.skippedCount}.` : ''
        }`,
        'assertive',
      );
    } catch (error) {
      announce(error.message || 'Import failed.', 'assertive');
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" small onClick={handleExport} aria-label="Export all entries as JSON">
        Export
      </Button>
      <Button type="button" variant="secondary" small onClick={handleImportClick} aria-label="Import entries from a JSON file">
        Import
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
    </>
  );
}

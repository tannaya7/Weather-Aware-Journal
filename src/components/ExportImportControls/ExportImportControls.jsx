import { useRef } from 'react';
import { Button } from '../Button/Button.jsx';
import { buildExportFilename, serializeEntries } from '../../lib/exportImport.js';
import { parseImportFiles } from '../../lib/importers.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';

export function ExportImportControls({ entries, onImport }) {
  const fileInputRef = useRef(null);
  const { announce } = useAnnouncer();

  function download(text, type, fileName) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Everything, exactly as stored (it imports back with nothing lost).
  function handleExport() {
    download(serializeEntries(entries), 'application/json', buildExportFilename());
    announce(`Exported ${entries.length} entries.`);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length === 0) return;

    try {
      const { format, entries: found } = await parseImportFiles(files);
      if (found.length === 0) {
        announce('No entries found in that file.', 'assertive');
        return;
      }
      const result = await onImport(found);
      announce(
        `Imported ${result.importedCount} entr${result.importedCount === 1 ? 'y' : 'ies'} from ${format}.${
          result.skippedCount ? ` Skipped ${result.skippedCount} already here or unreadable.` : ''
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
      <Button
        type="button"
        variant="secondary"
        small
        onClick={handleImportClick}
        aria-label="Import entries from this app, Day One, or Markdown files"
      >
        Import
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.zip,.md,.markdown,.txt,application/json,application/zip,text/markdown,text/plain"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
    </>
  );
}

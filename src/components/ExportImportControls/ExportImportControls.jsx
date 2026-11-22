import { useRef } from 'react';
import { Button } from '../Button/Button.jsx';
import { buildExportFilename, serializeEntries } from '../../lib/exportImport.js';
import { parseImportFiles } from '../../lib/importers.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';

export function ExportImportControls({ entries, onImport }) {
  const fileInputRef = useRef(null);
  const { announce } = useAnnouncer();
  const { t } = useI18n();

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
    announce(t('transfer.exported', { count: entries.length }));
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
        announce(t('transfer.noneFound'), 'assertive');
        return;
      }
      const result = await onImport(found);
      const imported = t('transfer.imported', { count: result.importedCount, format });
      const skipped = result.skippedCount ? ` ${t('transfer.skipped', { count: result.skippedCount })}` : '';
      announce(imported + skipped, 'assertive');
    } catch (error) {
      announce(error.message || t('transfer.failed'), 'assertive');
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" small onClick={handleExport} aria-label={t('transfer.exportLabel')}>
        {t('transfer.export')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        small
        onClick={handleImportClick}
        aria-label={t('transfer.importLabel')}
      >
        {t('transfer.import')}
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

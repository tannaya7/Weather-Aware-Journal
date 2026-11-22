import { prefixLines, wrapSelection } from '../../lib/richText.js';
import { applyTemplate, templatesFor } from '../../lib/templates.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './FormatToolbar.module.css';

const ACTIONS = [
  { label: 'format.bold', icon: 'B', className: 'bold', run: (t, s, e) => wrapSelection(t, s, e, '**') },
  { label: 'format.italic', icon: 'I', className: 'italic', run: (t, s, e) => wrapSelection(t, s, e, '*') },
  { label: 'format.heading', icon: 'H', run: (t, s, e) => prefixLines(t, s, e, '# ') },
  { label: 'format.bullets', icon: '•', run: (t, s, e) => prefixLines(t, s, e, '- ') },
  { label: 'format.numbers', icon: '1.', run: (t, s, e) => prefixLines(t, s, e, '1. ') },
  { label: 'format.checklist', icon: '☑', run: (t, s, e) => prefixLines(t, s, e, '- [ ] ') },
];

// Formatting buttons for the entry textarea (they insert the light
// Markdown that richText.js renders) and a template picker.
export function FormatToolbar({ textareaId, content, onChange }) {
  const { t, language } = useI18n();
  const templates = templatesFor(language);

  function apply(action) {
    const textarea = document.getElementById(textareaId);
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const result = action.run(content, start, end);
    onChange(result.text);
    if (textarea) {
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.start, result.end);
      });
    }
  }

  function handleTemplate(e) {
    const template = templates.find((item) => item.id === e.target.value);
    e.target.value = '';
    if (!template) return;
    const next = applyTemplate(content, template);
    onChange(next);
    const textarea = document.getElementById(textareaId);
    textarea?.focus();
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('format.label')}>
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`${styles.button} ${action.className ? styles[action.className] : ''}`}
          onClick={() => apply(action)}
          aria-label={t(action.label)}
          title={t(action.label)}
        >
          <span aria-hidden="true">{action.icon}</span>
        </button>
      ))}
      <select className={styles.templates} aria-label={t('format.template')} defaultValue="" onChange={handleTemplate}>
        <option value="" disabled>
          {t('format.templates')}
        </option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.emoji} {template.name}
          </option>
        ))}
      </select>
    </div>
  );
}

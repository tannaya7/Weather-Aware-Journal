import { prefixLines, wrapSelection } from '../../lib/richText.js';
import { TEMPLATES, applyTemplate } from '../../lib/templates.js';
import styles from './FormatToolbar.module.css';

const ACTIONS = [
  { label: 'Bold', icon: 'B', className: 'bold', run: (t, s, e) => wrapSelection(t, s, e, '**') },
  { label: 'Italic', icon: 'I', className: 'italic', run: (t, s, e) => wrapSelection(t, s, e, '*') },
  { label: 'Heading', icon: 'H', run: (t, s, e) => prefixLines(t, s, e, '# ') },
  { label: 'Bulleted list', icon: '•', run: (t, s, e) => prefixLines(t, s, e, '- ') },
  { label: 'Numbered list', icon: '1.', run: (t, s, e) => prefixLines(t, s, e, '1. ') },
  { label: 'Checklist', icon: '☑', run: (t, s, e) => prefixLines(t, s, e, '- [ ] ') },
];

// Formatting buttons for the entry textarea (they insert the light
// Markdown that richText.js renders) and a template picker.
export function FormatToolbar({ textareaId, content, onChange }) {
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
    const template = TEMPLATES.find((t) => t.id === e.target.value);
    e.target.value = '';
    if (!template) return;
    const next = applyTemplate(content, template);
    onChange(next);
    const textarea = document.getElementById(textareaId);
    textarea?.focus();
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`${styles.button} ${action.className ? styles[action.className] : ''}`}
          onClick={() => apply(action)}
          aria-label={action.label}
          title={action.label}
        >
          <span aria-hidden="true">{action.icon}</span>
        </button>
      ))}
      <select className={styles.templates} aria-label="Use a template" defaultValue="" onChange={handleTemplate}>
        <option value="" disabled>
          Templates…
        </option>
        {TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.emoji} {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

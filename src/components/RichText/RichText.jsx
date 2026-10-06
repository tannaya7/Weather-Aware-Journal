import { parseBlocks, parseInline } from '../../lib/richText.js';
import { Highlight } from '../Highlight/Highlight.jsx';
import styles from './RichText.module.css';

function Inline({ text, highlight }) {
  return parseInline(text).map((part, i) => {
    const content = <Highlight text={part.text} terms={highlight} />;
    if (part.bold) return <strong key={i}>{content}</strong>;
    if (part.italic) return <em key={i}>{content}</em>;
    return <span key={i}>{content}</span>;
  });
}

// Renders an entry's text with its light formatting (see lib/richText.js).
// With onToggleCheck, checklist boxes can be ticked right here.
export function RichText({ text, onToggleCheck, highlight }) {
  const blocks = parseBlocks(text);

  return (
    <div className={styles.rich}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h2' : 'h3';
          return (
            <Tag key={i} className={styles.heading}>
              <Inline text={block.text} highlight={highlight} />
            </Tag>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <p key={i} className={styles.paragraph}>
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  <Inline text={line} highlight={highlight} />
                </span>
              ))}
            </p>
          );
        }
        if (block.type === 'checklist') {
          return (
            <ul key={i} className={styles.checklist}>
              {block.items.map((item) => (
                <li key={item.line} className={item.checked ? styles.done : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={!onToggleCheck}
                      onChange={() => onToggleCheck?.(item.line)}
                    />
                    <span>
                      <Inline text={item.text} highlight={highlight} />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          );
        }
        const List = block.type === 'numbered' ? 'ol' : 'ul';
        return (
          <List key={i} className={styles.list}>
            {block.items.map((item) => (
              <li key={item.line}>
                <Inline text={item.text} highlight={highlight} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

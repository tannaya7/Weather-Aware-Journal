// A small, safe subset of Markdown for entries: **bold**, *italic*,
// # headings, - bullets, 1. numbered lists, and - [ ] checklists. It's
// parsed into plain data and rendered as React elements (RichText.jsx),
// never as HTML, so nothing typed into an entry can inject markup.

const HEADING = /^(#{1,3})\s+(.*)$/;
const CHECK = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

// Splits text into blocks. Each list item keeps its line number, so a
// checklist tick can be written back to the right line.
export function parseBlocks(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let paragraph = null;

  const listOf = (kind) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === kind) return last;
    const list = { type: kind, items: [] };
    blocks.push(list);
    return list;
  };

  lines.forEach((line, index) => {
    let m;
    if (!line.trim()) {
      paragraph = null;
      return;
    }
    if ((m = HEADING.exec(line))) {
      paragraph = null;
      blocks.push({ type: 'heading', level: m[1].length, text: m[2] });
    } else if ((m = CHECK.exec(line))) {
      paragraph = null;
      listOf('checklist').items.push({ text: m[2], checked: m[1] !== ' ', line: index });
    } else if ((m = BULLET.exec(line))) {
      paragraph = null;
      listOf('bullets').items.push({ text: m[1], line: index });
    } else if ((m = NUMBERED.exec(line))) {
      paragraph = null;
      listOf('numbered').items.push({ text: m[2], line: index });
    } else if (paragraph) {
      paragraph.lines.push(line);
    } else {
      paragraph = { type: 'paragraph', lines: [line] };
      blocks.push(paragraph);
    }
  });

  return blocks;
}

// Inline **bold** and *italic* / _italic_, as [{ text, bold, italic }].
export function parseInline(text) {
  const parts = [];
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_)/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    if (m[2] || m[3]) parts.push({ text: m[2] || m[3], bold: true });
    else parts.push({ text: m[4] || m[5], italic: true });
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// Plain text with the formatting marks removed: for titles, previews,
// search, and the print view's word counts.
export function stripMarkdown(text) {
  return (text || '')
    .split('\n')
    .map((line) =>
      line
        .replace(HEADING, '$2')
        .replace(CHECK, '$2')
        .replace(BULLET, '$1')
        .replace(NUMBERED, '$2'),
    )
    .join('\n')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_/g, '$1$2');
}

// Ticks or unticks the checklist item on `line`.
export function toggleChecklistLine(text, line) {
  const lines = text.split('\n');
  lines[line] = lines[line].replace(/\[( |x|X)\]/, (box) => (box === '[ ]' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

export function checklistProgress(text) {
  const items = parseBlocks(text).filter((b) => b.type === 'checklist').flatMap((b) => b.items);
  return { done: items.filter((i) => i.checked).length, total: items.length };
}

// --- Editing helpers for the toolbar ---------------------------------------

// Wraps the selection in `marker` (e.g. ** for bold). Returns the new text
// and the selection to restore.
export function wrapSelection(text, start, end, marker) {
  const selected = text.slice(start, end) || 'text';
  const next = `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`;
  return { text: next, start: start + marker.length, end: start + marker.length + selected.length };
}

// Adds `prefix` (e.g. "- [ ] ") to the start of every line in the selection.
export function prefixLines(text, start, end, prefix) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
  const block = text.slice(lineStart, lineEnd);
  const prefixed = block
    .split('\n')
    .map((l, i) => (prefix === '1. ' ? `${i + 1}. ${l}` : `${prefix}${l}`))
    .join('\n');
  const next = text.slice(0, lineStart) + prefixed + text.slice(lineEnd);
  return { text: next, start: lineStart, end: lineStart + prefixed.length };
}

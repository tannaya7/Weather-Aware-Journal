// Ready-made starting points for an entry. Plain text with the journal's
// light formatting (see richText.js).
export const TEMPLATES = [
  {
    id: 'gratitude',
    name: 'Gratitude',
    emoji: '🙏',
    text: '# Three things I’m grateful for\n1. \n2. \n3. \n\n# One small win today\n',
  },
  {
    id: 'daily-review',
    name: 'Daily review',
    emoji: '🗓️',
    text: '# How today went\n\n# What went well\n- \n\n# What was hard\n- \n\n# Tomorrow\n- [ ] \n- [ ] \n',
  },
  {
    id: 'travel',
    name: 'Travel log',
    emoji: '🧳',
    text: '# Where I am\n\n# What I saw\n- \n\n# What I ate\n- \n\n# The moment I want to remember\n',
  },
  {
    id: 'dream',
    name: 'Dream journal',
    emoji: '🌙',
    text: '# The dream\n\n# How it felt\n\n# People and places\n- \n\n# Anything from real life in it?\n',
  },
];

// Puts a template into the entry: as-is when empty, otherwise after what's
// already written, so nothing is ever lost.
export function applyTemplate(content, template) {
  return content.trim() ? `${content.replace(/\s+$/, '')}\n\n${template.text}` : template.text;
}

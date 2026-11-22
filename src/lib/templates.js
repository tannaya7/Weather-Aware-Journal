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

const TRANSLATED = {
  es: {
    gratitude: {
      name: 'Gratitud',
      text: '# Tres cosas por las que siento gratitud\n1. \n2. \n3. \n\n# Un pequeño logro de hoy\n',
    },
    'daily-review': {
      name: 'Repaso del día',
      text: '# Cómo fue hoy\n\n# Qué salió bien\n- \n\n# Qué fue difícil\n- \n\n# Mañana\n- [ ] \n- [ ] \n',
    },
    travel: {
      name: 'Diario de viaje',
      text: '# Dónde estoy\n\n# Qué vi\n- \n\n# Qué comí\n- \n\n# El momento que quiero recordar\n',
    },
    dream: {
      name: 'Diario de sueños',
      text: '# El sueño\n\n# Cómo se sintió\n\n# Personas y lugares\n- \n\n# ¿Había algo de la vida real?\n',
    },
  },
  hi: {
    gratitude: {
      name: 'आभार',
      text: '# तीन चीज़ें जिनके लिए मैं शुक्रगुज़ार हूँ\n1. \n2. \n3. \n\n# आज की एक छोटी जीत\n',
    },
    'daily-review': {
      name: 'दिन की समीक्षा',
      text: '# आज का दिन कैसा रहा\n\n# क्या अच्छा रहा\n- \n\n# क्या मुश्किल रहा\n- \n\n# कल\n- [ ] \n- [ ] \n',
    },
    travel: {
      name: 'यात्रा डायरी',
      text: '# मैं कहाँ हूँ\n\n# मैंने क्या देखा\n- \n\n# मैंने क्या खाया\n- \n\n# वह पल जो मैं याद रखना चाहता/चाहती हूँ\n',
    },
    dream: {
      name: 'सपनों की डायरी',
      text: '# सपना\n\n# कैसा महसूस हुआ\n\n# लोग और जगहें\n- \n\n# क्या इसमें असल ज़िंदगी का कुछ था?\n',
    },
  },
};

// The templates with their names and headings in the given language.
export function templatesFor(language = 'en') {
  const words = TRANSLATED[language];
  if (!words) return TEMPLATES;
  return TEMPLATES.map((template) => ({ ...template, ...words[template.id] }));
}

// Puts a template into the entry: as-is when empty, otherwise after what's
// already written, so nothing is ever lost.
export function applyTemplate(content, template) {
  return content.trim() ? `${content.replace(/\s+$/, '')}\n\n${template.text}` : template.text;
}

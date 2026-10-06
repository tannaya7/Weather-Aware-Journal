import Anthropic from '@anthropic-ai/sdk';
import { authorize } from './vault.js';
import { error, json, readJson } from './http.js';

export const MODEL = 'claude-opus-5-5';
export const DAILY_LIMIT = 20;
const MAX_ENTRIES = 31;
const MAX_ENTRY_CHARS = 4000;

const SYSTEM_PROMPT = `You help someone reflect on their personal journal. They chose to share these entries with you.

Write a short, warm reflection in plain text (no headings, no lists unless they really help, no markdown symbols). Notice patterns in mood, weather, habits, and what they wrote about; reflect them back in their own terms. Be specific to the entries, not generic. Don't diagnose, give medical advice, or lecture. If something sounds like a crisis, gently suggest talking to someone they trust or a local helpline.

End with one or two open questions they might want to write about next. Keep it under 200 words.`;

function describe(entry) {
  const parts = [`Date: ${entry.date || 'unknown'}`];
  if (entry.mood) parts.push(`Mood: ${entry.mood}`);
  if (entry.weather) parts.push(`Weather: ${entry.weather}`);
  if (entry.habits) parts.push(`Habits: ${entry.habits}`);
  parts.push(`Entry:\n${String(entry.text || '').slice(0, MAX_ENTRY_CHARS)}`);
  return parts.join('\n');
}

// Only the fields the app sends, as plain strings: nothing else from the
// request reaches the prompt.
function cleanEntries(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, MAX_ENTRIES).map((e) => ({
    date: typeof e?.date === 'string' ? e.date.slice(0, 40) : '',
    mood: typeof e?.mood === 'string' ? e.mood.slice(0, 40) : '',
    weather: typeof e?.weather === 'string' ? e.weather.slice(0, 80) : '',
    habits: typeof e?.habits === 'string' ? e.habits.slice(0, 200) : '',
    text: typeof e?.text === 'string' ? e.text : '',
  }));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// POST /v1/vaults/:id/reflect  { scope: 'week' | 'entry', entries: [...] }
// Needs a synced journal (that's the identity), and is capped per day so a
// leaked sync code can't run up the bill.
export async function reflect(request, env, vaultId, { client } = {}) {
  const auth = await authorize(request, env, vaultId);
  if (auth.response) return auth.response;
  if (!env.ANTHROPIC_API_KEY && !client) return error(503, 'AI reflections are not set up on this server');

  let body;
  try {
    body = await readJson(request, 200 * 1024);
  } catch (err) {
    return error(err.status || 400, err.message);
  }
  const entries = cleanEntries(body.entries);
  if (!entries?.length) return error(400, 'No entries to reflect on');

  const usageKey = `vault:${vaultId}:ai:${today()}`;
  const used = Number((await env.JOURNAL.get(usageKey)) || 0);
  if (used >= DAILY_LIMIT) return error(429, `You've reached today's limit of ${DAILY_LIMIT} reflections`);
  await env.JOURNAL.put(usageKey, String(used + 1), { expirationTtl: 2 * 86400 });

  const scope = body.scope === 'entry' ? 'this one entry' : 'these entries from the past week';
  const anthropic = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // Reflections are short; low effort keeps them quick and inexpensive.
      output_config: { effort: 'low' },
      // If a request is declined, retry on a model suited to it instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please reflect on ${scope}.\n\n${entries.map(describe).join('\n\n---\n\n')}`,
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return error(503, 'The AI service is busy. Try again in a minute.');
    if (err instanceof Anthropic.APIError) return error(502, 'The AI service had a problem. Try again later.');
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    return error(422, "The AI couldn't reflect on these entries.");
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  return json({ text, remainingToday: DAILY_LIMIT - used - 1 });
}

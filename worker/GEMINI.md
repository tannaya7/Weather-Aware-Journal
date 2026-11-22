# Gemini features

Four optional AI tasks use Google's Gemini through the Worker. Each is its own route and its own Gemini request, started only when the person presses its button. The journal works fully without them.

| Task (route name) | Where it appears | What it does |
|---|---|---|
| `entry_organization` | Entry page, "Organize this entry" | A short summary, up to 5 tag suggestions, and a mood suggestion (only one of the app's six moods). Each tag and the mood are applied only when the person presses its own button |
| `weather_day_plan` | Dashboard, inside the "Tomorrow's weather" card | 2–4 practical ideas for a chosen forecast day, optionally shaped by a preference (quiet, outdoors, creative), and an optional question to write about |
| `writing_prompt` | New-entry form, under the usual prompt | One specific prompt. It is kept out of the draft until the person chooses "Use this prompt" |
| `journal_period_review` | Insights, "Review a period" | Themes, notable moments, one hedged interpretation and a question, for a week (default), 30 or 90 days, or dates the person picks (at most 92 days) |

Every route is `POST /v1/vaults/:id/ai/<task>`. Rules the prompts and checks enforce: no diagnosis, therapy, or medical advice; the weather is background and never a cause of a mood; no predictions; journal text is treated as material to read, not as instructions. Every reply is asked for as JSON and then checked against that task's own shape (lengths, counts, allowed moods, tag rules, one-line prompt). Anything that doesn't fit is reported as a failure, never displayed.

## What leaves the device, per task

| Task | The app sends to your Worker | The Worker sends to Gemini |
|---|---|---|
| `entry_organization` | That entry's text (cut to 6,000 characters), date, mood, weather (type and temperature), and the tags already on it | The same, inside a prompt |
| `weather_day_plan` | The forecast numbers the app already loaded for one day (date, weather type, high, low, rain, UV) and the preference. **No journal text, no place name** | The same, as text |
| `writing_prompt` | Today's date and the weather type. **Only if the person ticks the box:** the opening lines (240 characters each) of their last 3 entries | The same, inside a prompt |
| `journal_period_review` | Counts worked out on the device (entries, days, moods, weather, mood by weather, average temperature by mood) and a short excerpt (300 characters) from at most 20 entries spread across the chosen period. The app shows how many entries and excerpts before sending | The same, inside a prompt |

Never sent: photos, voice memos, place names or coordinates, habits, the sync code, or entries outside the chosen scope. The Worker does not log or store entry text, prompts, or replies. Results are shown on the page only; they are not saved, synced, backed up, or exported, and closing one discards it.

The day plan uses the forecast the card already loaded when the person pressed "Check the forecast". It makes no extra weather request, shows which day and when the forecast was loaded, and refuses a forecast older than 3 hours.

## Status: what is verified

**Verified by automated tests (no network):** each route makes exactly one request with its own instructions and reply shape, input and output validation, limits, every failure path, that no text or key is logged, that the key never reaches the app or its build, and the whole path from a button press to the Worker to a fake Gemini.

**Verified live on 2026-11-22:** one real request per task, through the real Worker code with made-up sample text and a free-tier key. The default model `gemini-3.5-flash-lite` was accepted; `systemInstruction` and `generationConfig.responseMimeType: "application/json"` were accepted as sent; every task came back with finish reason STOP and usage reported, and each reply passed this app's validation. Four requests are not a study of quality or reliability.

**Not verified:**
- Quality, tone and reliability across many real replies. The four sample replies read well, but that is too few to judge (for example, the day-plan ideas did not mention the rain, and one had a small grammar slip).
- Other models: the request was only tried with the default model.
- Your project's free-tier request limits. Google's rate-limit page does not state numbers for these models; check them in AI Studio.
- How it looks and behaves in a real browser, in both themes and on a phone, and a deployed Worker.

## Set up the key (server side only)

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY      # paste the key when asked
npm run deploy
```

The key lives only as a Worker secret. It is never in the app, any `VITE_` variable, the browser, a URL, a log line, an error message, or Git. `wrangler.toml` lists the names of the optional variables but holds no key. A test fails if the key, the key header, or the Gemini address appears anywhere under `src/`.

Optional variables (set under `[vars]`): `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) and `GEMINI_GLOBAL_DAILY` (default 500).

If the key is missing, the app says "The Gemini helpers aren't set up on this server yet." and sends nothing. The tasks also need sync to be on (that is how the Worker knows whose request it is, the same as the older reflection feature), and a one-time "I understand" in the app that states all of the above.

## Free versus paid Gemini

On Google's pricing page (read 2026-11-21), the free tier is marked "used to improve our products" and the paid tier is not. For a journal, decide whether that suits you before using a free key with real entries. The consent text in the app says so.

Free tiers have usage limits, and Google can change them. The app never promises unlimited use: it shows "Requests left today" from this app's own daily cap, and a clear message if Google's limit or this app's is reached. Free-tier calls cost nothing; the app never shows or implies a charge.

## Limits

Per journal: 6 requests a minute and 30 a day, across all four tasks. Whole server: 500 a day (`GEMINI_GLOBAL_DAILY`). Request body at most 64 KB. One attempt per request and a 20-second timeout; nothing retries by itself, so "Try again" is a new request the person chose, and double-presses send once. Replies cut off by the length limit count as failures. The limits are KV counters, so they are approximate and use about 3 KV writes per request (the free KV tier allows 1,000 writes a day, so roughly 330 requests a day).

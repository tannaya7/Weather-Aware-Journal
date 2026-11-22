# Weather Journal: Full Project Audit

| | |
|---|---|
| **Project** | Weather Journal (repository `tannaya7/Weather-Aware-Journal`, package `weather-journal` v2.0.0) |
| **Audit date** | 2026-11-21 |
| **Commit audited** | `e0836b6` on branch `feat/complete-translations`, **plus 51 uncommitted file changes** (see section 12) |
| **Prepared by** | Claude (AI assistant), at the project owner's request |
| **Purpose** | A hand-over document: someone who has never seen this project should be able to read this and know what it is, what is built, what is not, what state it is in, and what to fix first |

**How to read evidence tags.** `[RAN]` means I executed a command and saw the result. `[READ]` means I read the code or config but did not run it. `[GH]` means the GitHub CLI reported it. `[INFER]` means I concluded it from indirect evidence. Anything I did not check is listed in section 16.

---

## 1. Executive summary

Weather Journal is a privacy-focused personal journal web app (React single-page app, installable as a PWA). It attaches the weather to each entry, tracks mood and habits, finds patterns between mood and weather, and can optionally sync across devices, write AI reflections and send daily reminders through a small Cloudflare Worker server.

**Overall state: feature-rich and carefully engineered, with a healthy test and CI setup. The `main` branch is deployed. The current working branch is mid-way through a translation task and is not shippable as it stands.**

What is good:
- A very wide feature set, all with code and tests (section 6).
- Real client-side encryption (AES-GCM, key wrapping, passkeys) and encrypted sync where the server never sees plaintext journal text.
- No dependency vulnerabilities (`npm audit`, production deps, app and server), no secrets in git, no HTML-injection sinks in the code.
- A strong CI pipeline: audit, lint, unit tests, build, bundle-size budgets, Playwright browser tests (including accessibility and a real WebAuthn passkey test), Lighthouse, and deploy gated on all of them.

What needs attention first (details in section 13):
1. **The working tree would fail CI.** Bundle budgets are exceeded (first-load JS 135.4 KB vs a 115 KB limit) and one unit test fails deterministically (the Hindi dashboard test). Both are tied to the unfinished translation work.
2. **All translation work is uncommitted**, and the branch holding 3 recent commits has never been pushed to GitHub. A disk problem would lose it.
3. **Passcode-lock strength is weak by design**: the minimum passcode is 4 characters, and the key-stretching setting (310,000 PBKDF2 iterations) is below current OWASP guidance (600,000). A short passcode can be brute-forced offline by anyone who copies the browser's data.
4. **The AI-reflection endpoint has no global spending cap**, so a determined abuser could run up the Anthropic bill if the server were deployed with an API key.
5. **No LICENSE, SECURITY.md or privacy notice** exists in the repository, even though the README says "open source" and a commit message mentions a "security policy".
6. **The optional server is not switched on in production.** No `SERVER_URL` repository variable is set, so the live site has no sync, AI or reminders unless a user types a server address into Settings.

---

## 2. What the project is

A **writing-first personal journal**. The only thing an entry requires is text. Everything else is optional context: mood, weather, place, tags, date, photos, voice memos, habits, per-entry font.

Design principles visible in the code and docs:
- **Local-first and private.** Entries live in the browser's IndexedDB. Nothing leaves the device unless the user turns on sync, AI reflections, error reports, or looks up weather and maps (which contact third-party services, see section 10.4).
- **No accounts.** Sync identity is a random 256-bit "sync code". The server derives nothing readable from it.
- **Accessibility as a requirement.** Targets WCAG 2.1 AA: skip link, keyboard navigation, ARIA live announcements, focus traps, reduced-motion support, automated axe checks in CI.
- **Works offline.** PWA with a service worker; weather responses are cached for an hour.
- **Optional server.** Everything works without it.

**Live site:** https://tannaya7.github.io/Weather-Aware-Journal/ (GitHub Pages status "built") `[GH]`. The site is served from the sub-path `/Weather-Aware-Journal/`, and the router uses `#/` hash URLs.

---

## 3. Technology stack

| Layer | Choice |
|---|---|
| UI | React 18.3, React Router 7 (HashRouter), CSS Modules, design tokens in `src/styles/tokens.css` |
| Build | Vite 5, `vite-plugin-pwa` (Workbox `generateSW`, update mode "prompt") |
| Maps | Leaflet 1.9 with OpenStreetMap tiles |
| On-device AI search | `@huggingface/transformers` 4.x, model `Xenova/all-MiniLM-L6-v2` (384-dimension embeddings, q8), loaded only when the user enables "search by meaning" |
| Storage | IndexedDB (database `weatherJournal` v1; stores `entries` and `meta`), a little `localStorage` |
| Crypto | Web Crypto API only (PBKDF2, HKDF, AES-GCM, key wrap/unwrap, SHA-256); WebAuthn PRF for passkeys |
| Weather data | Open-Meteo (geocoding, forecast, historical archive, air quality); BigDataCloud for reverse geocoding |
| Server (optional) | One Cloudflare Worker + one KV namespace; Anthropic SDK for reflections; Web Push (VAPID) for reminders |
| Tests | Vitest 2 + jsdom + Testing Library + fake-indexeddb (unit/component/worker); Playwright 1.63 + axe-core (browser, accessibility, visual) |
| Quality | ESLint 9 (react, hooks, jsx-a11y), Prettier, bundle budgets script, Lighthouse CI |
| Hosting / CI | GitHub Pages, GitHub Actions, Dependabot |

Size: 135 source files under `src/`, about 9,400 lines in `lib/`, `hooks/`, `context/`, `pages/` and the worker, 10 routes, about 60 component folders, 79 test files, 7 Playwright spec files.

---

## 4. How to run it

```bash
npm install
npm run dev            # Vite dev server, http://localhost:5173
npm run build          # production build into dist/ (about 45 s on the audit machine)
npm run preview        # serve dist/
npm test               # Vitest, all unit/component/worker tests (slow: see finding A-10)
npm run test:e2e       # Playwright (builds and serves the app itself; skips @visual tests)
npm run test:visual    # screenshot comparison (desktop)
npm run lint           # ESLint
npm run check:budgets  # bundle-size limits from perf-budgets.json
```

Server (optional): `cd worker && npm install`, then follow `worker/README.md` (Cloudflare login, create a KV namespace, generate VAPID keys, set secrets, `npm run deploy`). The Worker's tests are part of the root `npm test`.

Environment variable: `VITE_SERVER_URL` (build time) points the app at a deployed server. The deploy workflow fills it from the GitHub repository variable `SERVER_URL`. Users can also override it in Settings at run time.

---

## 5. Architecture

### 5.1 App structure

```
index.html, vite.config.js         shell, PWA manifest, Content-Security-Policy (injected as <meta> at build)
public/sw-push.js                  push-notification handler loaded into the service worker
src/main.jsx                       bootstrap; installs the global error reporter
src/App.jsx                        provider stack + routes (Map, Insights, Export, Settings are lazy-loaded)
src/context/                       Theme, Announcer (screen-reader live region), Entries (global state + undo), Semantic (meaning search)
src/hooks/                         useEntries (storage, lock, history, settings), useSync, useWeather, useDraftAutosave,
                                   useVoiceRecorder, useDictation, useFocusTrap, useReviewImage
src/lib/                           all domain logic, framework-free and unit-tested (section 5.3)
src/components/                    one folder per component with its CSS module
src/pages/                         Dashboard, EntryFormPage, EntryDetail, Calendar, Insights, MapPage, ExportPage, Settings, Contact
src/i18n/                          translate.js, messages.js, I18nContext.jsx, locales/{en,es,hi}.js
worker/                            the optional Cloudflare Worker (its own package.json and tests)
e2e/                               Playwright specs, fixtures that fake all external APIs, screenshot baselines
tests/                             Vitest suites mirroring src/
scripts/check-budgets.mjs          bundle-size gate
.github/                           ci.yml, deploy.yml, visual-baselines.yml, dependabot.yml
```

Provider order (outer to inner): I18n, Theme, Announcer, Entries, Semantic, HashRouter.

### 5.2 Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard | Timeline grouped by month, search, filter chips, sort, pagination, streaks, mood summary, goals, outlook, on-this-day, photo gallery, mood-vs-weather chart |
| `/new`, `/edit/:id` | EntryFormPage | Write or edit an entry (drafts autosave) |
| `/entry/:id` | EntryDetail | Full reading view, version history and diff, voice memos, photos |
| `/calendar` | Calendar | Year view with a mood per day |
| `/insights` | Insights | Mood and weather correlations, patterns, charts, period reviews |
| `/map` | MapPage | Pins for entries that have a place; popups link to entries |
| `/export` | ExportPage | JSON/Markdown export, encrypted backup and restore, import, print/PDF, year-in-review image |
| `/settings` | Settings | Passcode lock, passkey, sync, reminders, habits, weekly goals, search by meaning, diagnostics, language, storage, weather backfill |
| `/contact` | Contact | A simple contact page |

### 5.3 The `src/lib` modules, by job

| Job | Modules |
|---|---|
| Storage and encryption | `storage.js` (IndexedDB, lock record, drafts, settings), `crypto.js`, `passkey.js`, `backup.js`, `storageQuota.js` |
| Entries | `entryTitle.js` (title from first line), `entryHistory.js` (version history and diffs), `entryFilters.js`, `entryStyle.js`, `entryImages.js`, `groupByMonth.js`, `richText.js`, `templates.js`, `prompts.js` |
| Weather and sky | `weatherApi.js`, `weatherBackfill.js`, `sky.js` (sun, air quality, UV, moon), `forecast.js`, `mapPlaces.js` |
| Mood, habits, goals, analysis | `moods.js`, `moodStats.js`, `moodWeatherStats.js`, `moodOutlook.js`, `correlations.js`, `insights.js`, `habits.js`, `goals.js`, `streaks.js`, `calendarStats.js`, `periodReview.js`, `yearReview.js` |
| Search | `search.js` (text), `semantic.js` and `embedder.js` (on-device meaning search) |
| Import / export | `exportImport.js` (JSON), `importers.js` (Day One, Markdown), `photoShrink.js`, `imageUpload.js` |
| Sync | `syncClient.js`, `syncMerge.js`, `syncStatus.js` |
| Diagnostics | `errorReport.js` (privacy-scrubbed error log) |

### 5.4 Data model

An **entry** is a plain object: `id` (a number, `Date.now() + Math.random()`), `content` (text with a small Markdown subset), `mood` (one of Happy, Peaceful, Sad, Excited, Angry, Anxious), `date`, `tags[]`, `habits`, `font`, `images[]` (up to 4, shrunk to at most 2048 px JPEG), `audio[]` (voice memos), weather fields (`weatherIcon`, `temperature`, `weatherType`, `humidity`, `windSpeed`), place (`locationName`, `latitude`, `longitude`), sky fields (sun, air quality, UV, moon), `updatedAt`, `history[]` (earlier versions), `conflict` (set when two devices edited the same entry). Older entries may carry a legacy `title` or single `image`.

**Where data lives**

| Place | What |
|---|---|
| IndexedDB `entries` store | One record per entry. Plain when the lock is off; `{id, iv, data}` (AES-GCM) when on |
| IndexedDB `meta` store | The lock record, drafts (`draft:*`), settings (`setting:*`: sync state, habits, goals, tombstones, and so on). Drafts and settings are encrypted when the lock is on |
| `localStorage` | Language, theme, server URL override, reminder settings, error log and the "send error reports" flag, banner dismissal; legacy `weatherJournalEntries` (migrated once to IndexedDB); and plaintext "rescue" drafts (`weatherJournalDraft:*`), written only while the lock is off |
| Cache Storage | Service-worker precache, `weather-api-cache` (1 hour), `semantic-engine` (model runtime) |

### 5.5 Internationalisation

Three languages: English, Spanish, Hindi. 378 message keys per language, identical key sets `[RAN]`, enforced by a unit test (`tests/pages/I18nUi.test.jsx`). Missing keys fall back to English. Plurals use `_one` / `_other` keys. The chosen language is saved in `localStorage`. The server writes AI reflections in the app's language (Spanish, Hindi, or English by default).

---

## 6. Feature inventory and status

Legend: **Built** = code present and covered by tests. **Partial** = built but incomplete. **Not built** = absent. "Built" means I found the code and tests; I did not click through every feature in a browser.

### 6.1 Writing and reading
| Feature | Status |
|---|---|
| Writing-first entry form (only text required); title derived from the first line | Built |
| Mood (6 moods), tags, date/time, per-entry font | Built |
| Rich text: bold, italic, headings, bullets, numbered lists, checklists (tick boxes in the reading view); rendered as React elements, never as HTML | Built |
| Entry templates and daily writing prompts | Built |
| Voice memos (recording) and voice dictation | Built |
| Up to 4 photos per entry, auto-shrunk, with gallery | Built |
| Edit, delete, 5-second undo toast available from any page | Built |
| Version history per entry with side-by-side diff; conflict flag | Built |
| Draft autosave (IndexedDB) with a synchronous rescue copy for tab-close; drafts survive reloads | Built |
| Dedicated reading page with comfortable typography | Built |

### 6.2 Finding and browsing
| Feature | Status |
|---|---|
| Timeline grouped by month, pagination, sort, "today" filter | Built |
| Text search with match highlighting, mood/weather/tag filter chips | Built |
| Search by meaning (on-device language model; about 25 MB one-time download from Hugging Face; index encrypted with the lock) | Built (opt-in) |
| Year calendar with mood per day | Built |
| Map of entries (OpenStreetMap tiles) | Built |
| "On this day" memories | Built |

### 6.3 Weather and sky
| Feature | Status |
|---|---|
| City lookup and "use my location" (reverse-geocoded) | Built |
| Automatic weather, and historical weather for past-dated entries | Built |
| Weather backfill tool for older entries | Built |
| Sun, air quality, UV and moon data | Built |
| Weather cached for an hour for offline use | Built |

### 6.4 Insight and motivation
| Feature | Status |
|---|---|
| Mood summary panel and charts (trend, dot rows, mood vs temperature, yearly bars) | Built |
| Mood-vs-weather correlations and plain-language patterns | Built |
| Mood outlook and forecast prompt (uses the weather forecast) | Built |
| Habit tracking (configurable habits per entry) | Built |
| Weekly goals with progress | Built |
| Writing streaks (current and longest), evening reminder banner | Built |
| Period reviews (week, month, year) and a shareable year-in-review image | Built |

### 6.5 Privacy and security
| Feature | Status |
|---|---|
| Passcode lock: all entries, drafts, settings and the meaning-search index encrypted at rest | Built |
| Passkey (fingerprint/face/PIN) unlock via WebAuthn PRF, with a real-authenticator e2e test | Built (needs browser/device PRF support) |
| Encrypted backup files (`.wjbackup`, AES-GCM, password-derived key) and restore | Built |
| Opt-in, scrubbed error reports (kept locally; sent to the server only if enabled) | Built |
| Forgotten passcode recovery | **Not built, by design**: the only way back in is to erase the journal |

### 6.6 Import, export, print
| Feature | Status |
|---|---|
| JSON export/import | Built |
| Markdown export; import from Markdown and Day One | Built |
| Print / save as PDF view | Built |
| Year-in-review image | Built |

### 6.7 Optional server features (need the Worker)
| Feature | Status |
|---|---|
| End-to-end encrypted sync across devices (conflict-aware merge, offline queue, live polling, tombstones for deletes) | Built, **inactive in production** (no server URL configured) |
| AI reflections by Claude on chosen entries (opt-in, 20 a day per journal) | Built, inactive for the same reason |
| Daily push-notification reminders (payload-less Web Push, time-zone aware, 15-minute cron) | Built, inactive for the same reason |

### 6.8 Platform and polish
| Feature | Status |
|---|---|
| Installable PWA, offline app shell, update prompt (asks before switching versions) | Built |
| Light and dark themes ("paper" and "candlelit") | Built |
| Languages: English, Spanish, Hindi | **Partial**: see 6.9 |
| Accessibility (WCAG 2.1 AA targets, axe in CI) | Built |
| Storage-quota notice, persistent-storage request, error boundary with a crash screen | Built |
| iOS home-screen icon (PNG `apple-touch-icon`) | **Not built**: icons are SVG only, as the README admits |
| Native mobile apps, user accounts, a hosted backend run by the project | Not built (not goals) |
| Privacy policy, licence, security policy documents | **Not built** (finding A-07) |

### 6.9 Translation completeness (the branch's current task)
The branch `feat/complete-translations` is partway through moving every user-visible string into the locale files. `[READ]`
- **44 of the 71 component and page files** use the i18n hook (all 9 pages and 35 components).
- **27 component files import no i18n hook.** Some are purely structural (`Button`, `Highlight`, `RichText`), but others contain user-facing English text: `BackupSection`, `EmptyState`, `EntryVersions`, `MoodTrendChart`, `PeriodReview`, `ReminderSettings`, `StorageSettings`, `SyncSettings`, `SyncStatusBar`, `StreakCard`, `Pagination`, `UndoToast`, `Header`, `SkyDetails`, `YearlyMoodBarGraph`, `MoodWeatherChart`, among others. Example strings I found: "Add photos", "No entries yet.", "Compare the two versions", "View as table", "Choose a backup file first."
- Validation messages in `Settings.jsx` ("Use at least 4 characters."), error messages thrown from `storage.js` and `backup.js`, and the service-worker reminder text ("How was today?…") are English-only.
- So the app is **partly** localised. Treat the 378-key parity as "no key is missing between the three files", not "everything is translated".

---

## 7. The optional server (`worker/`)

A single Cloudflare Worker with one KV namespace. Zero accounts. Fits the free tier for personal use.

### 7.1 API
| Method and path | What it does |
|---|---|
| `GET /v1/health` | Liveness |
| `GET /v1/vaults/:id/journal` | Encrypted journal and version |
| `GET /v1/vaults/:id/version` | Just version and time (cheap polling) |
| `PUT /v1/vaults/:id/journal` | `{baseVersion, data}`; 409 if another device synced first; 429 if more than about once a second |
| `DELETE /v1/vaults/:id` | Remove all data for this journal |
| `POST /v1/vaults/:id/reflect` | AI reflection (needs a synced journal as identity) |
| `GET /v1/push/public-key` | VAPID public key |
| `PUT/DELETE /v1/vaults/:id/reminder` | Daily reminder subscription |
| `POST /v1/errors` | A scrubbed client error report (logged, not stored) |

### 7.2 Identity and trust model
- The app generates a random 256-bit **sync code**. From it, each device derives a **vault id** (SHA-256 of a labelled string), an **access token** (a different SHA-256), and the **encryption key** (HKDF). The server stores only a SHA-256 of the token, the ciphertext, and version numbers.
- The first `PUT` with a valid-looking token claims a vault. Token comparison is constant-time. The vault id must be 64 hex characters and the token at least 32.
- The server accepts only bodies shaped like the app's encrypted format, under 20 MB, JSON only.

### 7.3 Abuse protections (KV counters, approximate by design)
Failed sign-ins: 20 per 10 minutes per IP. New journals: 5 per hour per IP. Reflections: 5 per minute and 20 per day per journal. Error reports: 20 per hour per IP. Writes spaced at least 1 s. CORS limited to `ALLOWED_ORIGINS`. Every response carries `no-store`, `nosniff`, `Referrer-Policy: no-referrer`, and a `default-src 'none'; frame-ancestors 'none'` CSP.

### 7.4 AI reflections
Model `claude-opus-5-5`, low effort, up to 31 entries (4,000 characters each), reply under about 200 words, with a gentle system prompt (no diagnosis, suggests a trusted person or helpline if a crisis is sensed). Uses the `server-side-fallback-2026-07-01` beta flag. Refusals return 422. Plaintext entries are visible to the Worker and sent to Anthropic **only** when the user chooses to request a reflection.

### 7.5 Deployment status
- `wrangler.toml` still holds placeholders: `REPLACE_WITH_KV_NAMESPACE_ID`, `VAPID_SUBJECT = "mailto:you@example.com"`. `[READ]`
- `ALLOWED_ORIGINS` already names `https://tannaya7.github.io` plus localhost.
- No `SERVER_URL` repository variable is set `[GH]`, so the production build has no server address.
- **I cannot tell whether a Worker has ever been deployed** from the repository alone. The staging environment also uses placeholders.
- Dependabot has an open PR (#45) moving the Anthropic SDK from 0.131 to 1.8.0, a major version bump. CI on that PR passed `[GH]`.

---

## 8. Quality assurance: what exists

### 8.1 Automated tests
| Suite | Files | Count | Notes |
|---|---|---|---|
| Vitest (app, components, pages, hooks, libs) plus Worker tests | 79 | 695 tests | Run in one `npm test` |
| Playwright e2e | 7 specs | 23 tests, run on desktop Chrome and a Pixel 7 profile | Fake all external APIs; service worker blocked; covers journaling flow, lock, passkey (virtual authenticator), encrypted backup round trip, CSP violations, accessibility (axe, both themes), a 3,000-entry performance check, no sideways scrolling, visual screenshots |
| Visual baselines | Linux and Windows PNGs under `e2e/visual.spec.js-snapshots/` | 5 views | Regenerated by the manual `visual-baselines.yml` workflow |

### 8.2 CI/CD (GitHub Actions)
- **`ci.yml`** (every PR, and reused by deploy):
  - Job *checks*: `npm ci` for app and worker, `npm audit --omit=dev --audit-level=moderate` for both, lint, tests, build, bundle budgets.
  - Job *e2e*: Playwright on Chromium.
  - Job *lighthouse*: mobile profile, minimum scores performance 0.85, accessibility 0.95, best practices 0.9; LCP at most 3 s, CLS at most 0.1; TBT warns at 300 ms.
- **`deploy.yml`**: on push to `main`, run all checks, build with `VITE_SERVER_URL`, publish to GitHub Pages.
- **`dependabot.yml`**: weekly, for the app (minor/patch grouped), the worker, and GitHub Actions.
- Recent CI evidence `[GH]`: Dependabot PR #45 passed the Checks workflow on 2026-11-17. I did not confirm the result of the last deploy run.

### 8.3 Bundle budgets (`perf-budgets.json`)
First-load JS 115 KB, first-load CSS 12 KB, default chunk 25 KB (Map 55, search engine 190), offline precache 230 KB (all gzip).

---

## 9. What I ran, and the results

| Check | Result |
|---|---|
| `npm audit --omit=dev` (app) | 0 vulnerabilities `[RAN]` |
| `npm audit --omit=dev` (worker) | 0 vulnerabilities `[RAN]` |
| `npm run lint` | 0 errors, **7 warnings** (all `react-refresh/only-export-components` in `EntriesContext`, `SemanticContext`, `ThemeContext`, `I18nContext`) `[RAN]` |
| `npm run build` | Succeeds in about 44 s `[RAN]`. Main chunk 412.6 kB (138.9 kB gzip); transformers chunk 586.5 kB (170.8 kB gzip, lazy); Map page 154.5 kB (45.5 kB gzip); a 26.9 MB ONNX `.wasm` file ships in `dist/assets`. 19 files / 749 KiB precached |
| `npm run check:budgets` | **FAILS**: first-load JS **135.4 KB vs 115 KB**, offline precache **231.0 KB vs 230 KB**. Everything else within budget `[RAN]` |
| Full `npm test` | **690 passed, 5 failed (695), 79 files, 479 s** `[RAN]`, run while a build was also using the CPU |
| The 5 failures, re-run alone | 2 performance tests (`computes every Insights…`, `finds related entries…`): **pass alone** (817 ms). `LiveSync › retries after a failure` and `SyncUi › turns on sync, then a second device joins`: **pass alone**. `I18nUi › shows the dashboard in Hindi`: **fails every time** `[RAN]` |
| Playwright e2e, Lighthouse, visual tests | **Not run** (section 16) |

So the real, reproducible unit-test failure count is **1**; the other 4 were caused by machine load, which is itself a finding (A-10).

---

## 10. Security and privacy audit

### 10.1 Strengths
- **No HTML injection surface.** No `dangerouslySetInnerHTML`, `eval`, or `innerHTML` anywhere in `src/` `[READ]`. Rich text is parsed into data and rendered as React elements. The map popup is built with `createElement` and `textContent`.
- **Sound crypto construction.** AES-GCM with a fresh 12-byte random IV per record; one random data key wrapped by the passcode (PBKDF2-SHA256) and optionally by a passkey (WebAuthn PRF through HKDF), so changing the passcode re-wraps instead of re-encrypting. Keys are created non-extractable where possible and live only in memory. Wrong passcodes are detected by AES-GCM authentication failing. The lock turn-on/off/change rewrites everything in a single IndexedDB transaction, so no half-encrypted state can persist. Drafts and settings are encrypted too, and plaintext rescue drafts are deleted when a passcode is set.
- **Sync keeps the server blind.** The server sees ciphertext, a token hash and version numbers. The sync code is never sent. Sync refuses to silently resurrect a journal deleted elsewhere.
- **Hardened server.** Constant-time token compare, size and shape validation, per-IP and per-journal rate limits, strict CORS, restrictive response headers, no logging of tokens or codes.
- **Privacy-minded diagnostics.** Error reports strip quoted text, emails, URLs and long numbers, replace ids in routes, and are only sent if the user opts in.
- **Content-Security-Policy** ships in the built page and an e2e test asserts no violations.
- **Supply chain.** Zero known vulnerabilities in production dependencies, Dependabot weekly, lockfile committed, GitHub Actions pinned to major versions.
- **No secrets in git.** The only matches for "key" are `passkey.js`, its tests and the VAPID key *generator*.

### 10.2 Threat model summary
| Threat | Protected? |
|---|---|
| Someone reads the server's storage | Yes: ciphertext only (except during an AI reflection request, which is opt-in) |
| Someone steals the device or copies the browser profile, **lock off** | No: plaintext |
| Same, **lock on, long passcode or passkey** | Largely yes |
| Same, **lock on, short passcode (4 characters allowed)** | **Weak**: offline guessing is feasible (A-01) |
| Script injection (XSS) | No sinks found, CSP present, but see A-03; if script ran in the page it could use the in-memory data key |
| Malicious backup or import file | Mostly safe (parsed as data), one bounds gap (A-09) |
| Abuse of the optional server | Mostly protected, one cost-abuse gap (A-02) |
| Forgotten passcode | Unrecoverable by design |

### 10.3 Passkeys
Created with `userVerification: 'required'`; the PRF output (not a signature) wraps the data key, so no server is involved. The relying-party id defaults to the current hostname (`tannaya7.github.io`); moving the site to a new domain would stop existing passkeys working (the passcode would still unlock). Only devices and browsers with the PRF extension can use it.

### 10.4 Third-party data flows (what leaves the device, and when)
| Service | Receives | When |
|---|---|---|
| Open-Meteo (geocoding, forecast, archive, air quality) | City names, coordinates, dates | Weather lookups, backfill, forecasts. Works even with the lock on |
| BigDataCloud | Coordinates (reverse geocode) | "Use my location" |
| OpenStreetMap tile servers | The map area being viewed, and the user's IP | Map page |
| Hugging Face (and the browser's model cache) | Nothing about the journal; downloads the model | First use of search by meaning |
| jsDelivr | Nothing about the journal; serves script | Only if the page requests it (see A-03) |
| The project's own server (if configured) | Encrypted journal, token hash, reminder subscription URL, opt-in error reports | Sync, reminders, diagnostics |
| Anthropic (via the server) | Plaintext of chosen entries | Only when the user requests an AI reflection |

There is currently **no privacy notice** describing this in the repository (A-07).

---

## 11. Dependencies

Production audit is clean. Outdated (from `npm outdated`) `[RAN]`, with Dependabot PRs open `[GH]`:
- **Major versions behind:** React and react-dom 18.3 → 19.3, Vite 5 → 8, vitest 2 → 5, ESLint 9 → 10, jsdom 25 → 31, `@vitejs/plugin-react` 4 → 6, `eslint-plugin-react-hooks` 5 → 7, `globals` 15 → 17, `@testing-library/jest-dom` 6 → 8, Anthropic SDK (worker) 0.131 → 1.8.
- **Minor/patch behind:** transformers 4.3.1 → 4.3.2, Playwright 1.63 → 1.65, react-router-dom 7.18.4 → 7.18.6, prettier, testing-library, axe, fake-indexeddb.
- **7 open Dependabot PRs:** #45 (Anthropic SDK 1.8), #43 (9 grouped app updates), #42 (React 19), #41 (ESLint 10 core), #40 (react-hooks plugin 7), #39 (vitest 5), #36 (GitHub Actions group).
- The CI audit covers **production** dependencies only. Dev dependencies were not audited.

---

## 12. Repository and project state

- **History:** 145 commits by 3 contributors (`tannaya7` 123, `tannaya` 8, `Swetalin Rout` 14). First commit 2025-11-26 (a plain HTML/JS journal built by the team). The vanilla app was replaced by the React rewrite on 2026-08-10, then grew through October 2026 (storage and lock, sky and habits, passkeys, voice, rich text, server, insights, meaning search, sync hardening, importers, i18n, observability, repo hardening). Latest commit 2026-10-26.
- **Repository:** public, default branch `main`, GitHub reports **no licence**. Local `main` equals `origin/main` (0 ahead, 0 behind) `[RAN]`.
- **Current branch** `feat/complete-translations`: 3 commits ahead of `main` (`6ba8266` hardening, `f4e5ea3` entry previews, `e0836b6` Linux screenshot baselines). **This branch does not exist on GitHub**, so those 3 commits and everything below exist only on this computer.
- **Uncommitted work:** 51 changed paths at the start of the audit: 37 staged (locale files, components, `useVoiceRecorder`, `I18nContext`, `forecast` and its test, and others) and the rest unstaged, plus this `AUDIT.md` (untracked). Roughly 2,300 lines added and 630 removed against `main`. This is the translation work: three locale files totalling about 87 KB, and about 31 component files changed to call `t()`. The unstaged files include `worker/src/reflect.js`.
- **Branches:** 19 local and about 55 remote branches, mostly merged feature branches never deleted. About 12 local branches show as "ahead of `main`" by 1 to 6 commits, but `main` contains same-titled commits (for example "Add voice memos, rich text…"), suggesting they were rebased or cherry-picked onto `main`. I did not verify this commit by commit, so treat them as probably stale, not as unmerged work.
- **Open pull requests:** 7, all Dependabot.
- **Missing files at the root:** `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`. The commit message of `6ba8266` says "security policy", but no such file exists in the tree (`git ls-files` shows none).

---

## 13. Findings register

Severity: **High** = fix before relying on the feature; **Medium** = fix soon; **Low** = worth fixing; **Info** = for awareness.

| ID | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| A-01 | **Medium** | **Passcode lock is weak against offline guessing.** Minimum passcode is 4 characters (`MIN_PASSCODE_LENGTH = 4`, `Settings.jsx:20`). PBKDF2-SHA256 uses 310,000 iterations (`crypto.js:5`), commented as "OWASP's 2023 recommendation". That figure was the 2021 guidance; OWASP's current guidance for PBKDF2-HMAC-SHA256 is 600,000. A 4-digit passcode has only 10,000 possibilities, so anyone who copies the browser's IndexedDB can test them all, whatever the iteration count. | `[READ]` | Raise the minimum (at least 8, or encourage a passphrase), show a strength hint, steer users toward the passkey option, and raise iterations. The count is stored in each lock record, so it can be upgraded at next unlock. Correct the code comment. Consider Argon2 via WebAssembly. |
| A-02 | **Medium** | **No global spending cap on AI reflections.** The limits are per journal (20 a day) and per IP for creating journals (5 an hour). One IP can create about 120 journals a day, each allowed 20 reflections of up to 31 entries × 4,000 characters on a large model. Many IPs multiply this. The worker README says the daily cap stops a leaked code running up the bill, but vault farming is not covered. Only matters once the Worker is deployed with `ANTHROPIC_API_KEY`. | `[READ]` `vault.js`, `reflect.js`, `ratelimit.js` | Add a global daily budget counter (and alert), require a vault to have synced real data before reflecting, lower per-IP creation, consider a challenge (for example Cloudflare Turnstile), and set a spend limit in the Anthropic console. |
| A-03 | **Medium** | **CSP is broader than it needs to be.** `script-src` allows the whole `https://cdn.jsdelivr.net` origin, which can serve arbitrary user-published code (a known CSP bypass). `connect-src` allows any `https:` origin (needed because the sync server address is user-configurable), so exfiltration from an injected script would not be blocked. The policy is a `<meta>` tag (GitHub Pages cannot set headers), so `frame-ancestors` and clickjacking protection are unavailable. A 26.9 MB ONNX `.wasm` is already bundled into `dist/assets`, so the jsDelivr allowance may no longer be necessary. | `[READ]` `vite.config.js`; `[RAN]` build output | Check whether jsDelivr is still requested at runtime; if not, remove it. If it is, pin to a specific package version with Subresource Integrity or self-host the loader. Document the meta-CSP limits. |
| A-04 | **Medium** | **The working tree fails the bundle budgets, which CI enforces.** First-load JS 135.4 KB vs 115 KB; offline precache 231.0 KB vs 230 KB. Likely cause: `messages.js` imports all three locale files (about 87 KB source) eagerly into the main chunk. I did not build `main` to confirm the regression is new. | `[RAN]` `npm run check:budgets` | Load `es` and `hi` on demand (dynamic `import()` when the language changes), or raise the budget deliberately and record why. |
| A-05 | **Medium** | **One unit test fails every time**: `I18nUi › shows the dashboard in Hindi` ("Unable to find … heading 'आपकी डायरी'"). The key and the heading exist, so the test probably asserts before the journal finishes loading (it uses `getByRole`, not `findByRole`) or the new code changed timing. I did not find the cause. | `[RAN]` (fails alone, in 123 ms) | Make the test wait for the heading (`findByRole`), and confirm no real regression in the Hindi dashboard. |
| A-06 | **Medium** | **Unfinished and unprotected translation work.** Everything in section 6.9 is uncommitted, the branch is unpushed, and 27 components still lack an i18n hook. | `[RAN]` git state; `[READ]` | Finish the remaining strings (list in 6.9), commit as one commit, push the branch, open a PR. Add a lint or test that flags literal English in JSX. |
| A-07 | **Medium** | **No LICENSE, SECURITY.md or privacy notice.** The README says "open source, for personal and educational use", but GitHub reports no licence, which legally means all rights reserved. A commit claims a "security policy" that is not in the repo. The app sends data to several third parties (section 10.4) with no written disclosure. | `[GH]`, `[RAN]` `git ls-files` | Add a LICENSE, a SECURITY.md (how to report vulnerabilities), and a short privacy note (also inside the app's Settings or Contact page). |
| A-08 | Low | **Sync concurrency is best-effort.** The server's version check is a read-then-write on KV, which is eventually consistent and not atomic, so two devices writing at the same moment can both pass. Merging is client-side and uses each device's clock (`updatedAt = Date.now()`, newest wins), so a device with a wrong clock can win. The losing version is kept in the entry history, and clashes are flagged, so data is preserved, but a stale overwrite may need one more sync to heal. | `[READ]` `vault.js`, `syncMerge.js` | Document it. For strictness, move the vault to a Durable Object (atomic) and consider hybrid logical clocks. |
| A-09 | Low | **Backup restore trusts the file's key-derivation settings.** `readEncryptedBackup` passes `backup.kdf.iterations` and the salt straight to PBKDF2 with no bounds. A crafted backup could freeze the tab with an enormous count, or use a trivially small one. Malformed base64 raises an unfriendly error. Restoring is user-initiated, so impact is limited. | `[READ]` `backup.js:75` | Reject iteration counts outside a sane range (for example 100,000 to 5,000,000) and catch decoding errors with a clear message. |
| A-10 | Low | **Timing-based tests flake under load, and the suite is slow.** Two performance tests assert under 1.5 s and failed at 2.1 s and 2.8 s when the CPU was busy; two sync tests timed out. The full suite took 479 s here. | `[RAN]` | Use relative or generous thresholds (or run the performance tests separately), reduce PBKDF2 iterations in the test environment, and shrink photo fixtures. |
| A-11 | Low | **Dependencies are behind**, several by a major version, with 7 Dependabot PRs waiting (section 11). Dev dependencies are not audited in CI. | `[RAN]`, `[GH]` | Triage the PRs: merge the grouped minor/patch PR and the Actions group first; take React 19, Vite and vitest as separate, tested upgrades. Consider `npm audit` (including dev) as a non-blocking job. |
| A-12 | Low | **README is stale.** It says entries persist in `localStorage` (now IndexedDB), lists "photo attachments" and "cloud sync" as future work (both built), and its feature list and project structure omit the lock, passkeys, sync, AI, insights, map, voice, rich text, i18n and the worker. | `[READ]` | Rewrite the README from sections 2 to 6 of this document. |
| A-13 | Low | **7 lint warnings** (fast-refresh rule in four context files). | `[RAN]` | Move hooks and constants out of the component files, or relax the rule for context modules. |
| A-14 | Low | **Branch clutter.** About 74 branches across local and remote. | `[RAN]` | Delete merged branches (GitHub can do this automatically after a merge). |
| A-15 | Info | **Server features are off in production, and the Worker's deployment state is unknown.** No `SERVER_URL` variable; `wrangler.toml` placeholders. | `[GH]`, `[READ]` | Decide whether to deploy. If yes: set the KV id, VAPID subject, secrets, then the `SERVER_URL` variable. If not, say so in the README so users are not misled by the Settings screens. |
| A-16 | Low | **Weather and map lookups leak coarse location and IP to third parties**, even with the lock on, and the lookups run automatically in some flows. | `[READ]` | Disclose (A-07). Consider a "no network lookups" mode. |
| A-17 | Low | **AI reflections rely on a beta API flag** (`server-side-fallback-2026-07-01`) and a fixed model id. Plaintext is visible to the Worker and to Anthropic during a request (opt-in, but confirm the in-app consent text states this clearly). I did not verify the flag against current documentation. | `[READ]` `reflect.js` | Confirm the flag is still supported; keep consent wording explicit. |
| A-18 | Info | **The unwrapped data key is extractable** (needed for re-wrapping), so any script that did run in the page could export it. This is only reachable through an XSS, for which no sink was found. | `[READ]` `crypto.js:79` | Optional hardening: re-derive instead of keeping an extractable key. |
| A-19 | Low | **PWA icons are SVG only; no PNG `apple-touch-icon`.** iOS home-screen installs get a poor icon. Acknowledged in the README. | `[READ]` | Add 180×180 and 512×512 PNG icons. |
| A-20 | Info | **Passkeys are tied to the hostname.** Moving the site to a new domain breaks passkey unlock (passcode still works). | `[READ]` `passkey.js` | Note in docs before any domain change. |
| A-21 | Low | **Entry ids are floating-point numbers** (`Date.now() + Math.random()`), which appear in URLs. Collisions are very unlikely but not impossible across synced devices. | `[READ]` `storage.js:ensureIDs` | Use `crypto.randomUUID()` for new entries (keep old ids readable). |
| A-22 | Info | **Operational gaps:** no uptime or error monitoring beyond Worker logs (`wrangler tail`), no automated Worker deployment, no backup of the KV namespace. | `[READ]` | Only relevant if the Worker is deployed for real users. |

---

## 14. Corrections to my earlier quick summary

I gave a quick health check earlier in this session. Three statements in it were wrong, and one was incomplete:
1. I said the repo has a `SECURITY.md`. **It does not.**
2. I said the 310,000 PBKDF2 setting "matches the OWASP 2023 recommendation". **It matches the older 2021 figure; current guidance is 600,000** (A-01).
3. I said there is no check that the three languages have identical keys. **There is a test for it, and the keys do match** (378 each).
4. I said unit-test status was unconfirmed. It is now confirmed: 690 of 695 pass, and one failure is real (A-05).

---

## 15. Recommended order of work

1. **Protect the work:** commit the translation changes as a single commit and push the branch (A-06).
2. **Get CI green:** fix the Hindi test (A-05), and lazy-load `es`/`hi` or consciously raise the budget (A-04).
3. **Finish translation** of the 27 remaining components and the English-only messages (A-06).
4. **Add LICENSE, SECURITY.md and a privacy note** (A-07); rewrite the README (A-12).
5. **Strengthen the passcode** (A-01) and tighten the CSP (A-03).
6. **Decide on the server.** If deploying: add the spending cap first (A-02), set the real configuration (A-15), then enable `SERVER_URL`.
7. **Housekeeping:** triage Dependabot (A-11), delete stale branches (A-14), fix lint warnings (A-13), stabilise slow tests (A-10), add PNG icons (A-19).

---

## 16. Limits of this audit (what I did not do)

- I did **not** run the Playwright browser tests, the Lighthouse check, or the visual tests, and I did not open the app in a browser. UI behaviour, accessibility results and screenshots are taken from the test code and CI configuration, not from my own observation.
- I did **not** exercise the Worker against real Cloudflare, KV or Anthropic services. I read its code; its three test files ran as part of the unit suite.
- Feature statuses in section 6 mean "code and tests exist", not "I used it".
- I read the security-critical files in full (`crypto.js`, `storage.js`, `passkey.js`, `backup.js`, `syncClient.js`, `errorReport.js`, `embedder.js`, `richText.js`/`RichText.jsx`, the map popup, and all Worker source files). I did not read every line of the other roughly 120 source files, nor `importers.js`, the print view, or the service-worker caching behaviour in depth. Skim-level statements about those are marked as such.
- I did not verify the 378 strings per language for linguistic correctness (Spanish, Hindi).
- The 479-second full test run overlapped with a production build on the same machine, which caused four timing failures; their re-runs in isolation passed.
- This is a point-in-time review of one machine's working tree on 2026-11-21. The working tree will change as the translation task continues.

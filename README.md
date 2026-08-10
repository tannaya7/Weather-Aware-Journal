# 🌥️ Weather Journal

A personal journal that remembers the weather with you — built as a React + Vite single-page app, installable as a PWA, with full keyboard/screen-reader accessibility.

The app is designed writing-first: the only thing an entry ever requires is something you wrote. There's no separate title field — like Apple Notes or Day One, the entry's title is drawn from the first line of what you write (or, for entries imported/created before this existed, an explicit stored title is still honored). Mood, weather, tags, date, and appearance are all optional context around that.

## ✨ Features

### Core
- **Write** an entry — just content, nothing else required. Mood, weather, date, tags, and per-entry background/font are all optional.
- **Read** any entry on its own full page (`/entry/:id`) with comfortable reading typography, not just a clipped preview
- **Edit** and delete entries, with a 5-second undo toast that works from any page
- A **timeline** grouped by month, not a static grid — click an entry's opening line to read it in full
- Real-time weather lookup for any city via the free [Open-Meteo](https://open-meteo.com/) API — no API key needed
- Entries persist locally via `localStorage`
- Search, sort (newest/oldest), filter to today, and paginate
- Mood tracker with an accessible emoji + bar-chart summary
- Per-entry background theme and font customization
- App-wide light/dark ("paper" / "candlelit") theme toggle, independent of per-entry appearance
- **Export/Import**: back up all entries to a JSON file and restore them later

### Platform
- **Installable PWA** — add to home screen, works offline for the app shell; the last-fetched weather is cached too
- Fully responsive layout

### Accessibility (WCAG 2.1 AA)
- Skip link, full keyboard navigation, visible focus states
- ARIA live regions for form errors, weather status, and delete/undo/import feedback
- Focus-trapped mood summary dialog
- `/` focuses search, `Escape` closes the mood panel or undo toast
- Respects `prefers-reduced-motion`

## 🚀 Getting Started

```bash
npm install
npm run dev       # start the Vite dev server
```

Then open the printed `http://localhost:5173` URL. Because the app is now a bundled React app, opening `index.html` directly no longer works — always run it through Vite (`npm run dev`) or a built/served `dist/` (see below).

### Building for production

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

### Testing & linting

```bash
npm run test       # run the Vitest suite once
npm run test:watch # watch mode
npm run lint        # ESLint (includes jsx-a11y checks)
npm run format       # Prettier --write
```

## 📁 Project Structure

```
index.html                 # Vite entry shell, mounts React into #root
public/icons/               # PWA manifest icons (SVG)
src/
  main.jsx, App.jsx         # app bootstrap, providers, HashRouter routes
  styles/                   # tokens.css (design tokens) + global.css
  context/                  # AnnouncerContext, ThemeContext, EntriesContext (owns global delete/undo)
  hooks/                    # useEntries, useWeather, useFocusTrap
  lib/                      # storage, dateFormat, weatherApi, moodStats, exportImport,
                             # entryTitle (derives a title when none is stored), groupByMonth, moods
  components/               # one folder per component + its CSS module
  pages/                    # Dashboard.jsx (timeline), EntryFormPage.jsx (create + edit), EntryDetail.jsx (reading view)
tests/                      # Vitest unit + component tests
```

## 🌐 Weather API

Uses Open-Meteo's free Geocoding + Forecast APIs (no key required) to look up a city and show current temperature, condition, humidity, and wind speed. It's treated as optional context on an entry — nothing is faked if you never fetch it.

## 📱 PWA notes

The manifest icons are hand-authored SVGs (works for "Add to Home Screen" on Chrome/Edge/Android). iOS's home-screen icon requires a real PNG `apple-touch-icon`, which isn't included yet — a good follow-up if you want a designed icon.

## 🗄️ Data

All entries are stored in `localStorage` under the key `weatherJournalEntries` — unchanged since the very first version of this app, so upgrading never loses existing entries. Clearing browser data will delete them; use **Export** on the dashboard to back them up first.

## 📝 Possible future enhancements

- Real PNG/maskable app icons for iOS home-screen support
- Cloud sync with user accounts
- Photo attachments
- Weather forecast (not just current conditions) for future-dated entries

## 📄 License

Open source, for personal and educational use.

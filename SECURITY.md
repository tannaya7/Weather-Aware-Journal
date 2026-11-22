# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Use GitHub's
**Report a vulnerability** button on this repository's **Security** tab
(private vulnerability reporting). Include what you found, how to reproduce it,
and what you think the impact is.

This is a personal project, so there is no guaranteed response time, but
reports are read and taken seriously.

## What is in scope

- **The app** (the static site): how entries are stored, the passcode lock,
  passkey unlock, encrypted backups, imports and exports.
- **The optional server** (`worker/`): encrypted sync, reminders, error
  reports, and the Gemini helpers (`worker/GEMINI.md`).

## How the project handles data (so you know what to test)

- Journal entries live in the browser's IndexedDB. With a passcode lock on,
  entries, drafts and settings are encrypted (AES-GCM) and the key is held only
  in memory.
- Sync is end-to-end encrypted: the server stores ciphertext, a hash of an
  access token, and version numbers.
- The Gemini and Anthropic keys are server-side secrets only. They are never in
  the app, a `VITE_` variable, the browser, logs, or this repository.
- Weather and map lookups contact third-party services (Open-Meteo,
  BigDataCloud, OpenStreetMap); see `AUDIT.md` for the full list.

## Please don't

- Test against other people's journals or servers.
- Run load tests against a deployed server.

## Supported versions

Only the latest code on `main` is supported.

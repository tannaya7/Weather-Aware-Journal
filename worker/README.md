# Weather Journal server

Optional. The app works fully without it. Deploying it turns on three features:

- **Sync across devices.** End-to-end encrypted. The server stores only ciphertext, a hash of an access token, and version numbers. The key comes from the sync code, which never leaves your devices.
- **AI reflections.** Short reflections by Claude (`claude-opus-5-5`) on entries you choose to send. They're opt-in in the app and limited to 20 per journal per day.
- **Daily reminders.** Web Push at a time you pick, in your own time zone. Pushes carry no text.

It's a single [Cloudflare Worker](https://developers.cloudflare.com/workers/) with one KV namespace, and fits in the free tier for personal use.

## Deploy

You need a Cloudflare account (free) and, for reflections, an Anthropic API key.

```bash
cd worker
npm install

# 1. Storage
npx wrangler login
npx wrangler kv namespace create JOURNAL
#    → paste the printed id into wrangler.toml (kv_namespaces.id)

# 2. Push keys (for reminders)
npm run vapid-keys
npx wrangler secret put VAPID_PUBLIC_KEY      # paste the public key
npx wrangler secret put VAPID_PRIVATE_JWK     # paste the private JWK

# 3. AI reflections (optional)
npx wrangler secret put ANTHROPIC_API_KEY

# 4. Edit wrangler.toml: ALLOWED_ORIGINS (your site) and VAPID_SUBJECT (your email)

# 5. Go live
npm run deploy
#    → prints https://weather-journal-server.<you>.workers.dev
```

Then point the app at it, in one of two ways:

- **For everyone using your site:** in GitHub, go to *Settings → Secrets and variables → Actions → Variables* and add `SERVER_URL` with the Worker URL. The next deploy builds it in.
- **Just for you, right now:** in the app, open *Settings → Sync across devices* and enter the Worker URL.

## API

| Method | Path | |
|---|---|---|
| GET | `/v1/health` | |
| GET | `/v1/vaults/:id/journal` | Encrypted journal and its version |
| GET | `/v1/vaults/:id/version` | Just `{ version, updatedAt }`. Cheap, so devices can check for changes often |
| PUT | `/v1/vaults/:id/journal` | `{ baseVersion, data }`. Returns 409 if another device synced first, 429 (with `Retry-After`) if it writes more than about once a second |
| DELETE | `/v1/vaults/:id` | Deletes this journal's data and reminder |
| POST | `/v1/vaults/:id/reflect` | `{ scope, entries }` → `{ text }` |
| GET | `/v1/push/public-key` | VAPID public key |
| PUT/DELETE | `/v1/vaults/:id/reminder` | `{ subscription, time, timeZone }` |

Every `/vaults` route needs `Authorization: Bearer <token>`. The token and the vault id are both derived from the sync code.

## Abuse protection

There are no accounts, so the server defends itself:

- **Failed sign-ins** (wrong or missing token) are counted per IP address. After 20 in 10 minutes that address gets 429 for the rest of the window.
- **New journals** are limited to 5 per address per hour, so the server cannot be filled with empty ones. Updating an existing journal is not limited.
- **Reflections** are limited to 5 a minute per journal, on top of the 20 a day.
- **Writes** to one journal are spaced at least a second apart (Workers KV allows about one write per second to a key). The app waits and retries by itself.
- **Uploads** must be the app's own encrypted format and under 20 MB; request bodies must be JSON.
- Every response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, a `Content-Security-Policy` that allows nothing, and `Referrer-Policy: no-referrer`.

The counters live in the same KV namespace and expire by themselves. KV is eventually consistent, so these limits deter abuse rather than meter it exactly. They are only written for the events above, never for ordinary syncing, to stay inside KV's free tier (1,000 writes a day).

The token is checked as a hash, with a constant-time comparison, and neither it nor the sync code is ever logged or stored.

## Staging

To try a change without touching your real journal, make a second copy with its own storage:

```bash
npx wrangler kv namespace create JOURNAL --env staging
#    → paste the id into wrangler.toml (env.staging.kv_namespaces.id)
npm run deploy:staging      # or: npm run dev:staging
```

Staging has no daily reminders (no cron) and allows only localhost origins. Point a local copy of the app at it from *Settings → Sync across devices*.

## Tests

Run from the repository root: `npx vitest run worker`.

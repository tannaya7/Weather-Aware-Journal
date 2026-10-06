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
| PUT | `/v1/vaults/:id/journal` | `{ baseVersion, data }`. Returns 409 if another device synced first |
| DELETE | `/v1/vaults/:id` | Deletes this journal's data and reminder |
| POST | `/v1/vaults/:id/reflect` | `{ scope, entries }` → `{ text }` |
| GET | `/v1/push/public-key` | VAPID public key |
| PUT/DELETE | `/v1/vaults/:id/reminder` | `{ subscription, time, timeZone }` |

Every `/vaults` route needs `Authorization: Bearer <token>`. The token and the vault id are both derived from the sync code.

## Tests

Run from the repository root: `npx vitest run worker`.

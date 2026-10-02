# AGENTS.md

Gatehouse is an offline-first event check-in app. The cloud roster lives in Netlify Database. Gate devices copy it into IndexedDB and verify tickets, team tags and faces with no network, then sync scans back.

## Architecture

- `db/schema.ts`: Drizzle schema, which is the source of truth. Tables: `tickets`, `teams`, `users` (exported as `people`, with `face_vector` as a jsonb number[128] and an optional `photo` thumbnail data URL), `performances`, `scan_events` (an audit trail, deduplicated by `client_id`), `event_photos` (metadata; image bytes live in the `event-photos` Netlify Blobs store via `src/lib/photoStore.ts`) and `photo_reactions` (one like/star rating per photo per anonymous `visitor_id`).
- `db/index.ts`: Drizzle client (`drizzle-orm/netlify-db`).
- `netlify/database/migrations/`: generated migrations. `*_seed_demo_roster` is a custom SQL seed migration. Never edit applied migrations: change the schema, then run `npx drizzle-kit generate --name <verb_noun>`.
- `src/routes/api/*.ts`: TanStack Start server routes (`sync-down`, `sync-up`, `register-user`, `roster` (POST to add, DELETE `{ kind, id }` to remove any record), `photos` (list/upload, `photos/$photoId` serves the image), `react` (guest like/stars), `schedule` (public lineup without face data)).
- `src/lib/types.ts`: types shared by the server and the device.
- `src/lib/localdb.ts`: a small IndexedDB wrapper. Stores mirror the cloud tables plus `events` and `meta` (deviceId and sync timestamps). Tickets scanned locally get `pendingSync: true`. Events get `synced: false` until they are uploaded.
- `src/lib/gate.ts`: all gate logic (`scanTicket`, `verifyTeamTag`, `identifyFace`, `syncDown`, `syncUp`). It must stay offline-only except for the two sync functions. `syncDown` uploads pending scans *before* replacing the local roster so nothing is lost.
- `src/lib/face.ts`: embedding and Euclidean matching. `MATCH_THRESHOLD = 0.5` on unit vectors. `embedImage` is a placeholder for a real face model; keep its signature (an image source in, a number[128] out) when replacing it.
- `src/routes/index.tsx`: Gate console. `src/routes/admin.tsx`: Control room. `src/routes/guest.tsx`: public guest page (schedule + photo wall). Guests never sign in; each browser keeps a random visitor ID in localStorage.
- `src/components/`: `AppHeader`, `CameraPanel` (getUserMedia, plus BarcodeDetector QR mode), `VerdictOverlay` (full-screen green/amber/red result).
- `public/sw.js`: service worker. Pages are network-first with a cache fallback, assets are cache-first, and `/api/*` is never cached.

## Conventions

- Tailwind 4 theme tokens live in `src/styles.css` (`ink`, `panel`, `raised`, `line`, `mute`, `chalk`, `go`, `hold`, `stop`, `volt`), along with the `.card`, `.field`, `.label`, `.btn-primary` and `.btn-ghost` classes.
- Database column names are snake_case. TS fields are camelCase, and API payloads use the camelCase TS shapes.
- Code that uses IndexedDB, the camera or `navigator` runs only in effects or event handlers, never during SSR.
- Use the `@/` alias for `src/`. Server routes import `db/` by relative path with a `.js` extension.

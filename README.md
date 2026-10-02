# Gatehouse — Offline Event Check-in

Gatehouse lets event staff verify **tickets**, **team tags** and **faces** at the gate with no network at all. Before doors open, each gate device downloads the full roster from the cloud. During the event every check runs against the on-device database. Afterwards, devices upload their scan history and the cloud marks tickets as used.

## Screens

- **Gate console** (`/`): the device staff use at the gate.
  - **Ticket**: scan a QR or barcode with the camera (using the browser's built-in `BarcodeDetector`) or type the code. Each check returns *Access granted*, *Duplicate ticket* (with the original scan time) or *Fraud detected*.
  - **Team tag**: type the team name read off a jersey or lanyard. Partial, case-insensitive matches count.
  - **Face ID**: take a camera frame or photo, turn it into a 128-dimension embedding, and find the nearest registered person by Euclidean distance (threshold 0.5). For artists it also shows their performance schedule. *Rehearsal mode* simulates a registered person or a stranger so staff can practise.
  - Sync panel with on-device counts, a queue of scans waiting to upload, **Sync down** and **Sync up**.
- **Control room** (`/admin`): register people with a photo (stored as a face embedding plus a thumbnail), issue tickets, add teams, schedule artist sets, and browse the cloud roster and the scans uploaded from gates.

## Tech

- TanStack Start (React 19) with Tailwind CSS 4, deployed on Netlify
- **Netlify Database** (managed Postgres) with Drizzle ORM holds the cloud roster
- **IndexedDB** is the embedded on-device database, the browser equivalent of sqflite
- A service worker (`public/sw.js`) caches the app so it loads with no connection

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/sync-down` | Full roster package: tickets, teams, users (with face vectors), performances |
| `POST /api/sync-up` | `{ scannedTickets: [{ticketHash, scannedAt}], events: [...] }`. The first device to sync a ticket wins, and later ones are reported as `ticketConflicts` |
| `POST /api/register-user` | `{ userId, fullName, role, teamId, faceVector[128], photo? }`. Creates the user, or updates an existing one |
| `POST /api/roster` | `{ kind: 'ticket' \| 'team' \| 'performance', ... }` |
| `GET /api/roster` | The 50 most recent scan events uploaded from gates |

## Running locally

```bash
pnpm install
netlify dev
```

Database migrations live in `netlify/database/migrations/`, and Netlify applies them on deploy. The second migration loads a demo roster: tickets `TICKET_ABC_123`, `TICKET_DEF_456` and `TICKET_GHI_789`, plus `TICKET_JKL_012`, which is already used. It also adds the teams Red Tigers, Blue Falcons and Golden Owls, three players, the artists DJ Neon and Lumen Choir with their sets, and one staff member.

## About face matching

`src/lib/face.ts` produces a 128-d vector from an image: a centre crop shrunk to an 8×16 grayscale grid, then mean-centred and L2-normalised. It reliably recognises the same registration photo, but it is **not** a biometric model. For production, replace `embedImage()` with a real face model running on the device, such as face-api.js or MediaPipe/InsightFace exported to ONNX/TF.js. The storage, sync and matching code needs no changes.

## Possible next steps

- Swap in a real on-device face-embedding model (see above)
- Read team tags with on-device OCR (for example Tesseract.js) instead of typed text
- Print QR codes for issued tickets
- Put the Control room and the sync endpoints behind staff authentication (Netlify Identity)

# VaultReel

A private video library: upload, watch, download and delete high-quality video, with a hard quota of **42 GB total** and **15 GB per file**. No editing features — storage and playback only.

---

## How it handles large files

A 15 GB file never passes through the Node process. The browser talks straight to object storage using presigned S3 multipart URLs; the server only issues authorisation, tracks quota and stores metadata.

```
                    ┌──────────────────────────────┐
                    │  React + Vite (browser)      │
                    └───────┬──────────────┬───────┘
      small JSON control    │              │   64 MB chunks (PUT), 4 in parallel
      (initiate/sign/complete)             │
                            ▼              ▼
                ┌───────────────────┐   ┌──────────────────────┐
                │ Express API       │   │ Object storage (S3   │
                │ auth, quota,      │──▶│ API): R2, S3, MinIO, │
                │ metadata, presign │   │ B2, Wasabi           │
                └────────┬──────────┘   └──────────────────────┘
                         │                        ▲
                         ▼                        │ 302 → presigned GET
                  ┌────────────┐                  │ (HTTP range = seeking)
                  │  MongoDB   │                  │
                  │ metadata   │◀─────────────────┘
                  └────────────┘
```

**There is deliberately no app-wide `express.json()`.** Body parsing is attached per route with limits of 16 KB–4 MB, so video bytes cannot reach a body parser even by mistake.

### Upload sequence

| Step | Endpoint | What happens |
|---|---|---|
| 1 | `POST /api/videos/upload/initiate` | Validates type and size, **atomically reserves** the bytes against the quota, opens a multipart upload, creates one `Video` record (`status: uploading`) |
| 2 | `POST /api/videos/:id/upload/parts` | Returns presigned `UploadPart` URLs, 10 at a time |
| 3 | *(browser → storage)* | 64 MB slices sent by `XMLHttpRequest`, 4 concurrent, 4 attempts each with exponential backoff |
| 4 | `POST /api/videos/:id/upload/complete` | Completes the multipart upload, reads the true size with `HeadObject`, converts the reservation into used space, saves duration/resolution/thumbnail |
| 5 | `POST /api/videos/:id/upload/abort` | Cancels: aborts the multipart upload, deletes the record, releases the reservation |

Because the record is created once at step 1 and keyed by `uploadId`, **retries never create duplicate rows** — a retry calls `/upload/resume`, gets the list of parts storage already holds, and sends only what's missing.

### Quota enforcement

`StorageAccount` holds `usedBytes` and `reservedBytes` per user. Reserving is a single conditional update, so MongoDB's single-document atomicity settles any race:

```js
findOneAndUpdate(
  { user, $expr: { $lte: [{ $add: ['$usedBytes', '$reservedBytes', size] }, TOTAL_STORAGE_BYTES] } },
  { $inc: { reservedBytes: size } },
)
```

Two simultaneous 25 GB uploads cannot both succeed: the second update matches no document and is rejected with `413`. In-flight uploads count against the quota until they finish or abort, and an hourly sweeper reclaims sessions abandoned for more than 24 hours.

The final size always comes from `HeadObject`, never from the client, so a spoofed size in the initiate call cannot smuggle in a larger file.

---

## Requirements

- Node.js 18+
- MongoDB 6+
- An S3-compatible bucket (Cloudflare R2 recommended; AWS S3, MinIO, Backblaze B2 and Wasabi also work)

---

## Local development

### 1. Start MongoDB and MinIO

If you have Docker, the included compose file gives you both:

```bash
docker compose up -d
```

MinIO console: <http://localhost:9001> (`minioadmin` / `minioadmin`). Create a bucket named `vaultreel`.

### 2. Backend

```bash
cd server
cp .env.example .env     # then fill in the values
npm install
npm run seed             # creates the login account from SEED_EMAIL / SEED_PASSWORD
npm run dev              # http://localhost:4000
```

For the MinIO stack above, use:

```env
STORAGE_PROVIDER=minio
STORAGE_BUCKET=vaultreel
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_FORCE_PATH_STYLE=true
```

### 3. Frontend

```bash
cd client
npm install
npm run dev              # http://localhost:5173
```

Vite proxies `/api` to port 4000, so in development both run on one origin and the session cookie is first-party.

---

## Bucket CORS — required

The browser uploads chunks directly, so the bucket must allow it **and expose the `ETag` header**. Without `ExposeHeaders: ["ETag"]` every chunk will fail, because the client needs each part's ETag to complete the multipart upload.

### Cloudflare R2 (dashboard → bucket → Settings → CORS policy)

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://your-frontend.example.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### AWS S3

Same JSON via **Permissions → CORS**. Also confirm Block Public Access stays **on** — every read goes through a presigned URL, so the bucket should never be public.

### MinIO

```bash
mc alias set local http://localhost:9000 minioadmin minioadmin
mc admin config set local api cors_allow_origin="http://localhost:5173"
mc mb local/vaultreel
```

---

## Environment variables

Everything lives in `server/.env` (see `server/.env.example`). Nothing secret is ever sent to the browser — the frontend's only variable is `VITE_API_BASE_URL`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MongoDB connection string |
| `JWT_SECRET` | Signing key for session tokens — use 32+ random characters |
| `STORAGE_PROVIDER` | Label only (`r2`, `s3`, `minio`, `b2`, `wasabi`); behaviour comes from endpoint/region |
| `STORAGE_BUCKET`, `STORAGE_REGION` | Bucket and region (`auto` for R2) |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | Storage credentials — server-side only |
| `STORAGE_ENDPOINT` | Required for R2/MinIO/B2/Wasabi, empty for AWS S3 |
| `STORAGE_FORCE_PATH_STYLE` | `true` for MinIO |
| `FRONTEND_URL` | CORS allowlist; comma-separate multiple origins |
| `TOTAL_STORAGE_BYTES` | Quota. Default `45097156608` = 42 GB |
| `MAX_VIDEO_BYTES` | Per-file cap. Default `16106127360` = 15 GB |
| `UPLOAD_PART_SIZE_BYTES` | Chunk size. Default 64 MB |

---

## API

All video and storage routes require the session cookie.

```
POST   /api/auth/login                     { email, password }
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/videos?page=&limit=&search=&sort=
GET    /api/videos/recent
GET    /api/videos/:id
POST   /api/videos/upload/initiate         { filename, size, mimeType }
GET    /api/videos/:id/upload/resume
POST   /api/videos/:id/upload/parts        { partNumbers: [] }
POST   /api/videos/:id/upload/complete     { parts, durationSeconds, width, height, thumbnail }
POST   /api/videos/:id/upload/abort
GET    /api/videos/:id/stream              302 → presigned URL (or ?redirect=false for JSON)
GET    /api/videos/:id/download            302 → presigned URL, original filename preserved
GET    /api/videos/:id/thumbnail
DELETE /api/videos/:id

GET    /api/storage
```

Sort values: `newest`, `oldest`, `largest`, `smallest`, `name_asc`, `name_desc`.

Every response uses the same envelope:

```json
{ "success": true, "data": {}, "message": "Video uploaded." }
{ "success": false, "data": null, "message": "Video size exceeds the 15 GB limit", "errors": [] }
```

---

## Security

- JWT in an `httpOnly`, `SameSite`, `Secure` cookie — not readable from JavaScript
- bcrypt (cost 12) password hashes; no public registration, accounts come from `npm run seed`
- Ownership re-checked on **every** read, stream, download and delete — one user cannot touch another's videos
- Presigned URLs expire in 5 minutes (stream) and 2 minutes (download)
- Zod validation on every body, query and param
- Rate limits: 10 logins / 15 min, 30 upload starts / min, 600 API calls / min
- Helmet headers and a strict CORS origin allowlist
- Stack traces are logged server-side and never returned to the browser

---

## Production deployment

### Backend (Render, Railway, Fly.io, or any VPS)

```bash
cd server
npm ci
npm run build
npm run seed:prod     # once, to create the account
npm start
```

Set `NODE_ENV=production` and `FRONTEND_URL` to your real frontend origin. With the frontend on a different domain the cookie is cross-site, so it is sent as `SameSite=None; Secure` — **the API must be served over HTTPS**. Hosting both behind one domain (frontend at `/`, API at `/api` via reverse proxy) avoids this entirely and is the simpler setup.

Nginx, if you proxy: chunks go to storage, not here, so no `client_max_body_size` increase is needed.

### Frontend (Vercel, Netlify, Cloudflare Pages)

```bash
cd client
npm ci
VITE_API_BASE_URL=https://api.example.com npm run build   # outputs dist/
```

Serve `dist/` and rewrite all paths to `index.html` for client-side routing.

### Checklist

- [ ] `JWT_SECRET` is long and random, not the example value
- [ ] Bucket CORS lists the production origin and exposes `ETag`
- [ ] Bucket blocks public access — reads happen only through presigned URLs
- [ ] `FRONTEND_URL` matches the deployed frontend exactly
- [ ] A bucket lifecycle rule aborts incomplete multipart uploads after 7 days (belt and braces alongside the app's own sweeper)

---

## Known limitations, stated plainly

**Duration, resolution and thumbnails are read in the browser.** MKV and most AVI files cannot be decoded by a browser, so those fields stay empty and the card shows "Download to watch". Everything else works normally — the file uploads, stores and downloads intact. Adding server-side `ffprobe` would fill those fields in, but it means downloading each file to a worker, which is a meaningful piece of extra infrastructure rather than a small change.

**MKV and AVI will not play inline.** This is a browser codec limitation, not something the app can work around without transcoding. The player says so and offers the download instead of failing silently.

**Uploads need the tab to stay open.** Chunked upload runs in page JavaScript. Closing the tab pauses it; reopening and re-selecting the same file resumes from the parts already stored rather than starting over.

**Deletes remove metadata before the object.** If storage then errors, the orphaned object is logged with its key rather than leaving a visible record pointing at a file the user can no longer reach. The bucket lifecycle rule above is the backstop.

---

## Project structure

```
.
├── docker-compose.yml          MongoDB + MinIO for local development
├── server/
│   ├── .env.example
│   └── src/
│       ├── config/             env parsing, database connection
│       ├── models/             User, StorageAccount, Video
│       ├── middleware/         auth, validation, errors, rate limits
│       ├── services/
│       │   ├── storage.service.ts   S3 multipart + presigning
│       │   ├── quota.service.ts     atomic reserve/commit/refund
│       │   ├── videoTypes.ts        format rules
│       │   └── sweeper.ts           stale upload cleanup
│       ├── controllers/        auth, video
│       ├── routes/             auth, video, storage
│       ├── scripts/seedUser.ts
│       ├── app.ts
│       └── index.ts
└── client/
    └── src/
        ├── lib/                api client, uploader, metadata, formatters
        ├── context/            auth, theme, toast, storage quota
        ├── hooks/              useVideoActions
        ├── components/
        │   ├── ui/             Button, Card, Modal, ConfirmDialog, ProgressBar, Skeleton, EmptyState
        │   ├── layout/         AppLayout
        │   ├── CapacityMeter.tsx
        │   ├── VideoCard.tsx
        │   ├── VideoPlayer.tsx
        │   └── VideoDetailsModal.tsx
        └── pages/              Login, Dashboard, Videos, Upload, Storage, Settings
```

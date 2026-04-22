# neferkey-music2

Docker-based cloud-native music player with a React frontend and PostgreSQL-backed API.  
Inspired visually by the Koel music player — dark multi-panel layout with sidebar, library, album builder, and full-featured transport bar.

## Features

- **Koel-inspired dark UI** — sidebar navigation, library view, album grid, now-playing transport bar
- **Authentication** — register / login with JWT; protected routes for upload and album management
- **Track upload** — upload audio files (MP3, FLAC, OGG, WAV, AAC, M4A, Opus) with rich metadata (title, artist, genre, year, track number, lyrics, cover art)
- **Album builder** — create named albums, add/remove tracks, play all
- **Library** — browse all tracks; delete your own uploads
- **Lyrics panel** — view lyrics for the current track
- **Player** — play/pause, prev/next, seek bar, volume, playback speed, auto-advance
- **User preferences** — default playback speed, autoplay toggle
- Backwards-compatible API (`/api/records/:urlKey`, `/api/albums/:albumKey`)
- Linux-friendly Docker Compose setup
- Kubernetes manifests for cloud deployment (GKE, EKS, AKS)

## Quick start with Docker Compose

```bash
# Optionally override defaults:
export POSTGRES_USER=music
export POSTGRES_PASSWORD=change-me
export POSTGRES_DB=music
export JWT_SECRET=your-random-secret

docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

Uploaded audio and artwork are stored in a named Docker volume (`uploads`) and served at `/uploads/…`.

## API reference

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | `{ username, email, password }` → `{ token, user }` |
| POST | `/api/auth/login` | — | `{ email, password }` → `{ token, user }` |
| GET  | `/api/auth/me` | Bearer | Current user profile |
| PUT  | `/api/auth/me/preferences` | Bearer | `{ preferences: {} }` |

### Tracks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET  | `/api/tracks` | — | List all tracks |
| POST | `/api/tracks/upload` | Bearer | `multipart/form-data`: `audio` (file), `image` (file, optional), `title`, `artist`, `genre`, `year`, `track_number`, `lyrics` |
| DELETE | `/api/tracks/:urlKey` | Bearer | Delete own track |

### Albums

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET  | `/api/albums` | Bearer | List user's albums (includes tracks array) |
| GET  | `/api/albums/:albumKey` | — | Legacy: records by `album_key`; also supports UUID album id |
| POST | `/api/albums` | Bearer | `{ name, description?, cover_url? }` |
| PUT  | `/api/albums/:id` | Bearer | Update album metadata |
| DELETE | `/api/albums/:id` | Bearer | Delete album |
| POST | `/api/albums/:id/tracks` | Bearer | `{ track_key }` — add track |
| DELETE | `/api/albums/:id/tracks/:trackKey` | Bearer | Remove track from album |

### Legacy

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/records/:urlKey` | Get single track by url_key |
| GET | `/health` | Health check |

## Kubernetes deployment

1. Build and push images:
   - `neferkey/music-backend:latest`
   - `neferkey/music-frontend:latest`

2. Create the DB secret:

```bash
kubectl create secret generic music-db-secret \
  --from-literal=POSTGRES_USER=music \
  --from-literal=POSTGRES_PASSWORD='<strong-random-password>' \
  --from-literal=POSTGRES_DB=music \
  --from-literal=DATABASE_URL='postgres://music:<strong-random-password>@music-postgres:5432/music' \
  --from-literal=JWT_SECRET='<random-256-bit-secret>'
```

3. Apply manifests:

```bash
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
```

Add a `PersistentVolumeClaim` and volume mount for `/app/uploads` in `k8s/backend.yaml` to persist uploaded files.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://music:music@localhost:5432/music` | PostgreSQL connection string |
| `JWT_SECRET` | `change-me-in-production` | Secret for signing JWT tokens — **change in production** |
| `UPLOADS_DIR` | `<backend>/uploads` | Directory for uploaded audio and image files |
| `PORT` | `3000` | Backend listen port |

# neferkey-music2

Docker-based cloud-native music player with a React frontend and PostgreSQL-backed API.

## Features

- React frontend + Express backend + PostgreSQL
- JWT authentication (register/login)
- Track upload with metadata and artwork
- Albums and library management
- Swagger API docs at `/api/docs`
- Docker Compose for local development
- Cloud Run deployment workflow (frontend + backend services)

## Local development (Docker Compose)

1. Create local env file:

```bash
cp .env.example .env
```

2. Set strong values in `.env` (at minimum `POSTGRES_PASSWORD` and `JWT_SECRET`).

3. Run:

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

## Production env strategy

- Commit only templates: `.env.example`, `.env.production.example`
- Never commit real `.env.production` or real secrets
- In production, inject secrets from **Google Secret Manager**

### Required production secrets

- `DATABASE_URL`
- `JWT_SECRET`

### Recommended production env vars

- `NODE_ENV=production`
- `PORT=3000` (backend Cloud Run service)
- `CORS_ORIGIN=https://<frontend-service-url>`
- `GCS_UPLOAD_BUCKET=<bucket-name>`
- `GCS_UPLOAD_PREFIX=uploads`

## Upload storage mode

The backend now supports two upload modes:

1. **Local dev mode** (default): files are written to `/app/uploads` and served under `/uploads/...`
2. **Cloud mode** (`GCS_UPLOAD_BUCKET` set): files are uploaded to Google Cloud Storage and persisted outside Cloud Run ephemeral disk

For cloud mode, grant backend runtime service account write access to the bucket.

## Docker images and tags

Images are published to Docker Hub with two tags per build:

- `latest`
- `<commit-sha>`

Repositories:

- `neferkey/music-backend`
- `neferkey/music-frontend`

## GitHub Actions CI/CD

Workflow: `.github/workflows/cloud-run-deploy.yml`

On `main` push or version tag:

1. Runs backend and frontend tests/build
2. Builds and pushes backend image to Docker Hub (`latest` + SHA)
3. Deploys backend to Cloud Run
4. Builds frontend image with backend URL injected into `VITE_API_BASE_URL`
5. Pushes frontend image to Docker Hub (`latest` + SHA)
6. Deploys frontend to Cloud Run

### Required GitHub Secrets

Docker Hub:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Google Cloud:

- `GCP_PROJECT_ID`
- Authentication (choose one):
  - Workload Identity: `GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_SERVICE_ACCOUNT`
  - Service Account JSON key: `GCP_SA_KEY`
- `GCP_DATABASE_URL_SECRET_NAME`
- `GCP_JWT_SECRET_NAME`
- `GCP_CLOUD_SQL_CONNECTION_NAME` (optional if not using Cloud SQL socket)
- `GCP_GCS_UPLOAD_BUCKET` (optional, recommended)

## Google Cloud setup (project: `Neferkey-Music-App`)

Enable APIs:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com
```

Create secrets (example):

```bash
printf '%s' '<database-url>' | gcloud secrets create neferkey-database-url --data-file=-
printf '%s' '<jwt-secret>' | gcloud secrets create neferkey-jwt-secret --data-file=-
```

Grant Cloud Run runtime service account permissions:

- `roles/secretmanager.secretAccessor`
- `roles/cloudsql.client` (when using Cloud SQL)
- `roles/storage.objectAdmin` (or stricter bucket-scoped role for uploads)

## Cloud Run architecture

- `neferkey-music-backend` (Express API)
- `neferkey-music-frontend` (static React build served by nginx)
- Cloud SQL (PostgreSQL) used via `DATABASE_URL`
- Secret Manager for secrets
- Cloud Storage for uploaded media persistence

## Smoke test checklist (post-deploy)

- `GET /health` on backend returns `{"status":"ok"}`
- Register + login works
- Track list loads
- Upload track + image works
- Album create/add/remove works
- CORS works between frontend and backend service URLs
- Restart/redeploy backend and verify DB data still exists
- Verify uploaded media remains available from Cloud Storage URLs

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `PORT` | Backend listen port (default 3000) |
| `UPLOADS_DIR` | Local upload path for dev mode |
| `CORS_ORIGIN` | Comma-separated allowed browser origins |
| `GCS_UPLOAD_BUCKET` | Enables Cloud Storage upload mode |
| `GCS_UPLOAD_PREFIX` | Object prefix for uploaded files |
| `VITE_API_BASE_URL` | Frontend build-time backend API base URL |

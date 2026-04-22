# neferkey-music2

Docker-based cloud-native music player with a React frontend and PostgreSQL-backed API.

## Features

- Retrieve a single record via immutable URL key (`/api/records/:urlKey`)
- Retrieve album tracks (`/api/albums/:albumKey`)
- Responsive player UI with:
  - cover image
  - play, pause, stop
  - rewind, forward
  - playback speed settings
  - replay
  - next/previous track
  - lyrics section
- Linux-friendly containers using Docker Compose
- Kubernetes manifests for cloud deployment (Google GKE, AWS EKS, Azure AKS)

## Local run with Docker

Use environment variables for DB credentials (defaults are provided for local development):

```bash
export POSTGRES_USER=music
export POSTGRES_PASSWORD=change-me
export POSTGRES_DB=music
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

## API examples

```bash
curl http://localhost:3000/api/records/demo-track-1
curl http://localhost:3000/api/albums/demo-album
```

## Kubernetes deployment

1. Build and push images:
   - `neferkey/music-backend:latest`
   - `neferkey/music-frontend:latest`
2. Create the DB secret (or use your cloud secret integration):

```bash
kubectl create secret generic music-db-secret \
  --from-literal=POSTGRES_USER=music \
  --from-literal=POSTGRES_PASSWORD='<strong-random-password>' \
  --from-literal=POSTGRES_DB=music \
  --from-literal=DATABASE_URL='postgres://music:<strong-random-password>@music-postgres:5432/music'
```

3. Apply manifests:

```bash
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
```

The frontend service is `LoadBalancer` type for cloud-native access.

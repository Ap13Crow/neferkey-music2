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

```bash
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
2. Apply manifests:

```bash
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
```

The frontend service is `LoadBalancer` type for cloud-native access.

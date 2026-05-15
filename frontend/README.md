# Gaussi Frontend

Vite/React app for Vercel. It uses Mantine for the application UI and `gsplat` for interactive Gaussian splat rendering with orbit controls. It can open `.ply` files immediately in-browser, upload `.ply` scenes to the backend library, upload videos for conversion, and poll conversion jobs.

## Local run

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in `.env` for local, preview, and production Vercel environments.

## Deploy

Use `frontend/` as the Vercel project root. The included `vercel.json` builds with `npm run build` and serves `dist/`.

# RestaurantOS

Next.js 14 (frontend :3000) + Express + Prisma + Socket.io (backend :4000) + Postgres

## Quick start (Docker - zero setup)
```bash
docker compose up --build
# frontend http://localhost:3000  backend http://localhost:4000/api/health
```

## Local without Docker
```bash
# 1. Postgres
docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=restaurantos postgres:16-alpine

# 2. Backend
cd backend
cp .env.example .env   # DATABASE_URL already points to localhost:5432
npm ci
npx prisma db push
npm run dev

# 3. Frontend
cd frontend
npm ci
npm run dev   # NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Builds (both verified):
```bash
cd backend && npm run build   # prisma generate + tsc -> dist/
cd frontend && npm run build  # next build -> .next
```

## Hosting (one repo, two perfect stacks - no compromise)

**Backend needs persistent process** for Socket.io kitchen/live orders. Vercel serverless breaks websockets, so:

| Want | Frontend | Backend | DB | Realtime |
|------|----------|---------|----|----------|
| Easiest (1 platform, perfect sockets) | Railway | Railway | Railway Postgres | yes |
| Vercel speed + perfect sockets | Vercel | Render | Neon/Supabase | yes |
| Vercel only (REST ok, sockets degraded) | Vercel | Vercel (api/index.ts) | Neon/Supabase | polling fallback |

### A. Railway (recommended: one click, Socket.io perfect)
1. Railway -> New Project -> Deploy from GitHub -> `1progect`
2. Add Postgres plugin -> copy DATABASE_URL
3. Add service rootDir `backend`: Build `npm run build` Start `npm start` Health `/api/health` Env: `DATABASE_URL`, `JWT_SECRET` (openssl rand -hex 32), `FRONTEND_URL` (=frontend URL), `NODE_ENV=production`
4. Add service rootDir `frontend`: Env `NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app/api` `NEXT_PUBLIC_WS_URL=https://<backend>.up.railway.app`

### B. Vercel (frontend) + Render (backend) - best Next.js + sockets
1. Postgres: neon.tech or supabase.com -> copy `DATABASE_URL=?sslmode=require`
2. Render: `render.yaml` already in repo -> Render dashboard -> New -> Blueprint -> connect repo -> adds `restaurantos-api` (backend) + `restaurantos-web` (frontend). Fill `DATABASE_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL/WS_URL`.
3. Or Vercel for frontend alone: Vercel -> Import -> `1progect` -> Root Directory `frontend` -> Framework Next.js -> Env `NEXT_PUBLIC_API_URL=https://<render-backend>.onrender.com/api` `NEXT_PUBLIC_WS_URL=https://<render-backend>.onrender.com` -> Deploy
4. After backend deploy: `npx prisma db push` in Render shell (creates tables)

### C. Vercel only (fallback, sockets via polling disabled)
Frontend as above + Backend: Vercel -> Import -> same repo -> Root Directory `backend` -> `api/index.ts` is serverless handler. Set `NEXT_PUBLIC_WS_URL=disabled` to avoid socket errors.

## Env vars
Backend: `DATABASE_URL` `JWT_SECRET` `JWT_EXPIRES_IN` `PORT` `FRONTEND_URL` `PAYMENT_WEBHOOK_SECRET` `NODE_ENV`
Frontend: `NEXT_PUBLIC_API_URL` `NEXT_PUBLIC_WS_URL`

Dead files removed: `backend/prisma/dev.db` (384KB sqlite, now ignored), `*/.env.production.example`, `frontend/vercel.json`, `*.tsbuildinfo`, `src/config/`, root `.env.example` (use per-app `.env.example`).

ng build is not this project (no Angular). Build is `npm run build` per app.

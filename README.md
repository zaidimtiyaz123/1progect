# RestaurantOS - Hotel Project

Stack: Next.js 14 (frontend :3000) + Express + Prisma + Socket.io (backend :4000) + Postgres

## Local dev (without Docker)

1. Start Postgres (Docker or local install):
   docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=restaurantos postgres:16-alpine

2. Backend:
   cd backend
   cp .env.example .env   # then set DATABASE_URL to your postgres
   npm ci
   npx prisma generate
   npx prisma db push     # first time, creates tables
   npm run dev            # http://localhost:4000  health: /api/health

3. Frontend:
   cd frontend
   npm ci
   npm run dev            # http://localhost:3000  env: NEXT_PUBLIC_API_URL=http://localhost:4000/api

## Local dev (with Docker - recommended)
docker compose up --build
# frontend http://localhost:3000  backend http://localhost:4000

## Hosting - pick ONE

### Option A: Railway.app (recommended for this stack, 1 platform)
1. Create project on railway.app -> New Postgres plugin -> copy DATABASE_URL
2. Add Service from GitHub -> point to `theproject1/backend` (or root with docker-compose)
   Build command: npm run build   Start: npm start   Health: /api/health
   Env: DATABASE_URL, JWT_SECRET (32+ random), FRONTEND_URL, NODE_ENV=production, PORT=4000
3. Add Service for frontend -> `theproject1/frontend`
   Build: npm run build   Start: npm run start -p 3000
   Env: NEXT_PUBLIC_API_URL=https://<backend>.up.railway.app/api  NEXT_PUBLIC_WS_URL=https://<backend>.up.railway.app
   Backend will run `prisma db push` on start to create tables.

### Option B: Vercel (frontend) + Render (backend) + Neon/Supabase (postgres)
- Postgres: create db on neon.tech or supabase.com, copy DATABASE_URL with ?sslmode=require
- Backend on Render: Web Service, Root = backend, Build = npm run build, Start = npm start, add env above, health /api/health
- Frontend on Vercel: Import theproject1/frontend, Framework = Next.js, env NEXT_PUBLIC_API_URL + NEXT_PUBLIC_WS_URL
- Set backend FRONTEND_URL to the Vercel URL so CORS allows it.

### Option C: VPS (Hostinger/DigitalOcean $6/mo - cheapest long term)
- Ubuntu VPS, install node 20, postgres, pm2, nginx
- nginx proxies / -> frontend:3000 and /api + socket -> backend:4000
- pm2 start backend: pm2 start dist/index.js --name api
- pm2 start frontend: pm2 start npm --name web -- run start

## Build
backend:  npm run build   # prisma generate + tsc -> dist/
frontend: npm run build   # next build -> .next (standalone if output:'standalone')

## Previous fix
- frontend/tsconfig.json ignoreDeprecations "6.0" -> "5.0" (was breaking next build on TS 5.7)
- backend schema provider sqlite -> postgresql (required for any hosted DB)

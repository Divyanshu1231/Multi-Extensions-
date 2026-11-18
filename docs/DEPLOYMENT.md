# Deployment
## Backend (Render)
1. Create a Neon PostgreSQL database and copy its pooled or direct connection string.
2. Create a Render Web Service from this repository with Root Directory `backend`.
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Set `DATABASE_URL`, `JWT_SECRET` (32+ random bytes), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CORS_ORIGINS`, `ENVIRONMENT=production`.
6. Deploy and verify `/health`.

## Admin panel (Netlify)
1. Set base directory `admin-panel`, build command `npm run build`, publish directory `dist`.
2. Set `VITE_API_BASE_URL` to the Render API origin.
3. Deploy. Add the Netlify origin to backend CORS allowlist.

## Database migrations
An initial Alembic revision is included. Apply it with:
`cd backend && alembic upgrade head`
For future schema changes:
`cd backend && alembic revision --autogenerate -m "describe schema change" && alembic upgrade head`

Do not rely on ephemeral Render filesystem for the database. Keep PostgreSQL on Neon. Free hosting may sleep and cause cold starts; database/provider free-tier policies can change.

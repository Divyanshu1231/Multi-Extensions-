# Central Extension Platform
Central Super Admin control plane for five existing Manifest V3 Chrome extensions.

## Repository contents
- `backend/` FastAPI + SQLAlchemy + PostgreSQL authentication/admin API
- `admin-panel/` React/Vite Super Admin dashboard
- `extensions/` five integrated source folders plus exact original ZIP backups
- `docs/` API, database, integration and deployment notes

## Local backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env before running; use a strong JWT_SECRET and ADMIN_PASSWORD
uvicorn app.main:app --reload
```

## Local admin panel
```bash
cd admin-panel
npm install
# create .env with VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

## First use
The backend bootstraps the configured Super Admin and five extension registry records at startup. Create per-extension users from the protected API or dashboard (user management UI is the next completion item). Never use the example credentials in production.

## Important implementation status
The backend implements core admin and extension authentication endpoints, password hashing, JWT access tokens, rotating hashed refresh tokens, session revocation, extension/user status enforcement, and audit events. The dashboard currently implements admin login, summary metrics, extension listing and enable/disable. The extension integration adds a popup login gate while preserving original extension files. See `docs/INTEGRATION.md` for the remaining service-worker enforcement requirement and production configuration.

This repository is an implementation baseline, not a claim of fully completed production certification. Run tests and complete the manual extension regression checklist before operational rollout.

## Current delivery boundary
The dashboard includes extension overview/toggles, extension-scoped user creation, status changes, password reset, session revocation, and recent activity display. The five popup entrypoints display an independent login gate and logout control. This is not yet production-certified: background/content-script privileged operations are not all guarded by session checks, live Neon/Render/Netlify deployment was not exercised, and DoubleTick provider calls were not live-tested. Complete the checks in `docs/INTEGRATION.md` before production rollout.


## Render Blueprint deployment

The repository-root `render.yaml` provisions the FastAPI API, React/Vite static admin dashboard, and Render PostgreSQL database together. In Render choose **New → Blueprint**, connect this repository, and review all three resources before applying. Render will prompt for `ADMIN_PASSWORD`; set a strong unique value. The Blueprint generates `JWT_SECRET` automatically.

**Database warning:** Render Free Postgres expires 30 days after creation and has a 14-day upgrade grace period before deletion. Use a paid Render Postgres plan for durable data on Render, or use Neon if a free persistent database is required. Free web services can spin down after inactivity.

## Add future extensions from the dashboard

The Super Admin Overview now includes an **Add New Extension** ZIP upload panel. Upload a Manifest V3 ZIP with `manifest.json`, `popup.html`, and the platform login `auth.js` at the ZIP root. The popup HTML must load `auth.js`. The backend validates the archive, assigns the next `extension-NN` key, injects the assigned key and Render API origin into `auth.js`, adds the API host permission to `manifest.json`, registers the extension, and stores the integrated ZIP in Neon PostgreSQL. Download the integrated ZIP from its extension card, extract it, and load the directory containing `manifest.json` through `chrome://extensions` → Developer mode → Load unpacked. Then create extension-specific credentials in User Management.

Upload constraints: 15 MB compressed, 40 MB uncompressed, maximum 300 files. See `docs/ADD-EXTENSION-WITH-ZIP.md` for the required ZIP structure and limitations.

# Cloud Nest

Business website and admin CMS built with HTML, CSS, JavaScript, Node.js, Express and PostgreSQL.

- `dist/`: public website and admin interface
- `backend/`: API, database schema and setup scripts

## Local development

From `backend/`, install dependencies with `npm ci`, configure a private `.env` using `.env.example`, run `npm run migrate`, and start with `npm start`.

## Render deployment

Use a Node Web Service with repository root left blank. Build: `cd backend && npm ci --omit=dev`. Start: `cd backend && npm run migrate && npm start`. Health check: `/api/health`.

Use PostgreSQL in the same region and configure `DATABASE_URL`, `NODE_ENV=production`, `PUBLIC_ORIGIN`, `WEBSITE_ORIGIN`, `SESSION_SECRET`, and `UPLOAD_DIR=/var/data/cloud-nest/uploads`. Both origins should match the actual HTTPS service URL when serving the whole website from this backend. Attach a persistent disk at `/var/data` for uploaded photos.

Existing local database content and uploaded photos must be migrated separately. They are not part of this repository. Never commit passwords or `.env` files. See `backend/README.md` for setup details.

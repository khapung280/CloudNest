# Cloud Nest

Business website and admin CMS built with HTML, CSS, JavaScript, Node.js, Express and PostgreSQL.

- `dist/`: public website and admin interface
- `backend/`: API, database schema and setup scripts
- `api/`: Vercel serverless entry point for the Express app

## Local development

From `backend/`, install dependencies with `npm ci`, configure a private `.env` using `.env.example`, run `npm run migrate`, and start with `npm start`.

## Vercel deployment

Connect this repository to Vercel from the repository root. `vercel.json` installs backend dependencies, runs the database migration, and rewrites all website, admin, and API routes to the Express function at `api/index.mjs`.

Recommended services:

- PostgreSQL: Neon or Supabase Postgres.
- Media uploads: Vercel Blob, connected to the Vercel project.

Configure these Vercel environment variables before the first deploy:

- `DATABASE_URL`
- `NODE_ENV=production`
- `PUBLIC_ORIGIN=https://YOUR_VERCEL_DOMAIN`
- `WEBSITE_ORIGIN=https://YOUR_VERCEL_DOMAIN`
- `SESSION_SECRET` with at least 32 random characters
- `BLOB_READ_WRITE_TOKEN` from Vercel Blob
- optional: `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`

After deployment, create the first admin account from a trusted local/CLI environment with `ADMIN_PASSWORD` set and `cd backend && npm run create-admin`.

Existing local database content and uploaded photos must be migrated separately. They are not part of this repository. Never commit passwords or `.env` files. See `backend/README.md` for setup details.

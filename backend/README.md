# Cloud Nest CMS

This is the portable backend requested in **Backend for Cloud Nest.docx**. The existing ChatGPT-hosted website remains static until its API connection is configured. `/admin/` on that static site is explicitly a design preview: edits persist only in that browser tab, and Publish cannot modify the public website.

## Implementation

- Premium responsive admin: dashboard, homepage sections, services, projects, blog, founders, pricing, FAQ, images, enquiries, homepage SEO, brand settings and team access.
- PostgreSQL-backed draft and published content with optimistic revision checks. A consolidated JSONB content document preserves a consistent whole-site publish; users, sessions, messages, media, activity and rate limits have separate relational tables. This adapts the document's proposed table layout without losing the corresponding editors.
- Node/Express REST API. Same-origin opaque, HttpOnly session cookies (hashed in PostgreSQL), scrypt password hashing, CSRF protection, origin checks and database-backed rate limiting. Session duration: 8 hours, or 7 days when selected. Server-enforced Super Admin, Editor and Support roles.
- Admin uses accessible native HTML controls and vanilla JavaScript to preserve the current site's lightweight architecture. No framework migration is needed.
- Uploaded PNG/JPEG/WebP files require a persistent mounted disk. File signatures, size and references are checked. SVG uploads are intentionally unsupported.
- Contact enquiries are stored independently of email notification success. Optional Resend notifications are configured with hosting secrets; no key is included in source.
- Backend serves public article URLs, sitemap and server-rendered homepage SEO. The original static host receives client-rendered content updates after API configuration; for server-rendered crawler metadata, use the backend-served public website/custom domain.

## Deploy the backend

1. Use Node 22+ on a host with a persistent disk (for example an existing Render/Railway Node service). Connect this repository. Run commands from `backend/`.
2. Provision PostgreSQL and configure `DATABASE_URL` using the provider's required verified TLS settings. Do not disable certificate verification.
3. Copy the variable names from `.env.example` into the host's secret settings. Set `PUBLIC_ORIGIN` to the HTTPS backend origin, without a trailing slash; `WEBSITE_ORIGIN` to `https://cloud-nest-studio.hanglimbu6221.chatgpt.site`; and `UPLOAD_DIR` to a persistent mounted directory. Configure `TRUST_PROXY_HOPS` to the verified number of reverse proxies for that host (typically 1); leave 0 for direct access. Do not guess this setting.
4. Generate a random `SESSION_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and store it as a secret.
5. Build/install: `npm ci --omit=dev`. Release migration: `npm run migrate`. Start: `npm start`. `/api/health` is the health check. The migration does not overwrite existing content.
6. In the host's private console, temporarily set `ADMIN_PASSWORD` to a unique password with 12–128 characters. Run `npm run create-admin`, enter the owner's email and name, then remove `ADMIN_PASSWORD`. This can also securely reset the password of an existing account; existing sessions are invalidated. There is no default or publicly claimable admin account.
7. Open `https://YOUR_BACKEND_ORIGIN/admin/` and sign in. Keep login on this backend origin: third-party cross-site cookies are not required. Add Editor/Support accounts through Team & access.
8. Set `window.CLOUD_NEST_API_ORIGIN` in `dist/site-config.js` to the backend HTTPS origin and republish the existing static Site. The public homepage will fetch published content and submit enquiries; its `/admin/` preview includes a link to the secure live admin. Alternatively serve the whole website from the backend's custom domain.
9. Configure database backups and persistent-disk backups on the chosen host. No paid resources are provisioned by this code.

## Optional email

Configure a verified sending domain with Resend, then set `RESEND_API_KEY`, `MAIL_FROM` and `NOTIFY_EMAIL`. Enquiries are stored even if email is not configured or delivery fails. The inbox shows the notification status. No automatic replies are sent to customers. A reply link opens the administrator's own email app.

## Editing

Save draft → Preview → Publish. Published visibility is applied only when the whole draft is published. Reordering is saved to the draft. Conflicting edits return HTTP 409 instead of overwriting another editor's work; reload the page to load the latest draft. Support can access messages, Editor can edit/publish content and manage media, and only Super Admin can change global settings and account access. Uploaded files are public website media; do not upload private documents.

The business-card founder design and user-supplied phone numbers and emails are included in both the public static website and the CMS rendering. Future admin edits still require the backend connection and publication before they can update the public website.

## Scope and remaining setup

Not connected here: production PostgreSQL, backend hosting, persistent upload disk, first admin credential, optional email sender. Customer login/dashboard, bookings, payments and newsletters remain the previously reserved future features; they are not claimed as active CMS features. Password recovery is a host-console reset, not an unconfigured email reset form.

The homepage is one page with anchor sections. Its path remains `/`; the SEO path field is read-only. Blog slugs create `/journal/:slug` routes on the backend; drafts do not have public routes. Portfolio items use accessible detail dialogs.

## Verification

`npm ci` then `npm test` runs PostgreSQL-compatible integration checks using PGlite, plus DOM interaction tests. PGlite is a development-only embedded PostgreSQL build; it does not substitute for configuring or verifying your production PostgreSQL service. No production account or customer data is used in tests.

## Source files

`schema.sql`: initial database migration; `server.mjs`: Express application; `security.mjs`: validation and password primitives; `setup.mjs`: migration and private administrator provisioning. `../dist/admin/`: admin UI. `../dist/cms.js`: public website content integration. `../dist/content-seed.json`: existing authored website content, not an invented dataset.

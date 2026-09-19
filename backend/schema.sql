CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK (role IN ('super_admin','editor','support')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf_token text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS content (
 id integer PRIMARY KEY CHECK (id = 1), draft jsonb NOT NULL, published jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1, published_revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL, company text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '', subject text NOT NULL, message text NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','replied','closed')),
 email_status text NOT NULL DEFAULT 'not_configured', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS media (
 id uuid PRIMARY KEY, filename text NOT NULL, storage_name text NOT NULL UNIQUE,
 alt_text text NOT NULL DEFAULT '', mime_type text NOT NULL, size integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS messages_date ON messages(created_at DESC);

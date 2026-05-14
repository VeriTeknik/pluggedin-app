-- Runs once when the postgres container creates its data directory.
-- Idempotent so it can be re-run safely against a restored backup.
--
-- Note: the user/database/password are created by the postgres image entry
-- point from POSTGRES_USER / POSTGRES_DB / POSTGRES_PASSWORD before this
-- file is sourced. Anything we add here runs as superuser inside the
-- already-created database.

-- pgvector: required by the memory subsystem (lib/memory/*) and by some
-- legacy embedding code paths. zvec is a separate, file-based system; it
-- does not require this extension, but other features do.
CREATE EXTENSION IF NOT EXISTS vector;

-- uuid_generate_v4() — Drizzle migrations occasionally use it.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto for HMAC and gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_stat_statements for query-level observability. Cheap (a few MB of
-- shared memory) and enormously useful when something starts being slow.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Tighten the default privileges. Drizzle migrations create tables; nothing
-- else should be writing schema.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO CURRENT_USER;

# Database
SQLAlchemy models define: admins, extensions, extension_users, sessions, refresh_tokens, activity_logs, extension_settings.
Important constraints: unique extension key; unique (extension_id, username); unique refresh-token hashes; foreign keys with cascade where appropriate.
Production must use Neon PostgreSQL with SSL. Set `DATABASE_URL` to the SQLAlchemy psycopg URL.

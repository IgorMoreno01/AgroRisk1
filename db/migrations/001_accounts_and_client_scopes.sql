ALTER TABLE agrorisk.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS global_scope boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_operator_id text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agrorisk.users'::regclass
      AND conname = 'users_status_check'
  ) THEN
    ALTER TABLE agrorisk.users
      ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agrorisk.users'::regclass
      AND conname = 'users_linked_operator_fk'
  ) THEN
    ALTER TABLE agrorisk.users
      ADD CONSTRAINT users_linked_operator_fk
      FOREIGN KEY (linked_operator_id)
      REFERENCES agrorisk.users(id)
      ON DELETE RESTRICT;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON agrorisk.users (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS agrorisk.user_client_scopes (
  user_id text NOT NULL REFERENCES agrorisk.users(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS user_client_scopes_client_idx
  ON agrorisk.user_client_scopes(client_id);
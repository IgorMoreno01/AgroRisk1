CREATE TABLE IF NOT EXISTS agrorisk.operation_logs (
  id text PRIMARY KEY,
  operator_id text NOT NULL REFERENCES agrorisk.users(id) ON DELETE RESTRICT,
  operation_id text NOT NULL,
  machine_id text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  observation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (operation_id, machine_id)
    REFERENCES agrorisk.operations(id, machine_id)
    ON DELETE CASCADE,
  CHECK (
    (status = 'not_started' AND started_at IS NULL AND finished_at IS NULL)
    OR (status = 'in_progress' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (status = 'completed' AND started_at IS NOT NULL AND finished_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS operation_logs_one_active_per_operation_idx
  ON agrorisk.operation_logs(operator_id, operation_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS operation_logs_operator_operation_recent_idx
  ON agrorisk.operation_logs(operator_id, operation_id, created_at DESC);
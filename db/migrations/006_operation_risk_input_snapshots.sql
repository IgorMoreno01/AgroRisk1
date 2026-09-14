-- Prepared Risk Engine V2 inputs are immutable-at-runtime facts.  Scores and
-- classifications intentionally do not belong in this table.
CREATE TABLE IF NOT EXISTS agrorisk.operation_risk_input_snapshots (
  operation_id text PRIMARY KEY
    REFERENCES agrorisk.operations(id) ON DELETE CASCADE,
  reference_date date NOT NULL,
  ml_input jsonb NOT NULL,
  operational_rules_input jsonb NOT NULL,
  latitude double precision,
  longitude double precision,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version text NOT NULL
);

CREATE INDEX IF NOT EXISTS operation_risk_input_snapshots_reference_date_idx
  ON agrorisk.operation_risk_input_snapshots(reference_date);

CREATE INDEX IF NOT EXISTS operation_risk_input_snapshots_updated_at_idx
  ON agrorisk.operation_risk_input_snapshots(updated_at DESC);
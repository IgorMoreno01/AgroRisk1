CREATE SEQUENCE IF NOT EXISTS agrorisk.risk_weight_configuration_revision_seq;

CREATE TABLE IF NOT EXISTS agrorisk.risk_weight_configurations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id text REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  ml_weight integer NOT NULL CHECK (ml_weight BETWEEN 0 AND 100),
  operational_rules_weight integer NOT NULL
    CHECK (operational_rules_weight BETWEEN 0 AND 100),
  revision bigint NOT NULL
    DEFAULT nextval('agrorisk.risk_weight_configuration_revision_seq')
    CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES agrorisk.users(id) ON DELETE SET NULL,
  CHECK (ml_weight + operational_rules_weight = 100)
);

ALTER TABLE agrorisk.risk_weight_configurations
  ALTER COLUMN revision
  SET DEFAULT nextval('agrorisk.risk_weight_configuration_revision_seq');

SELECT setval(
  'agrorisk.risk_weight_configuration_revision_seq',
  GREATEST(
    (SELECT last_value FROM agrorisk.risk_weight_configuration_revision_seq),
    COALESCE((SELECT MAX(revision) FROM agrorisk.risk_weight_configurations), 1)
  ),
  (SELECT is_called FROM agrorisk.risk_weight_configuration_revision_seq)
    OR EXISTS (SELECT 1 FROM agrorisk.risk_weight_configurations)
);

CREATE UNIQUE INDEX IF NOT EXISTS risk_weight_configurations_global_unique_idx
  ON agrorisk.risk_weight_configurations ((true))
  WHERE client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS risk_weight_configurations_client_unique_idx
  ON agrorisk.risk_weight_configurations (client_id)
  WHERE client_id IS NOT NULL;
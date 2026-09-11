CREATE TABLE IF NOT EXISTS agrorisk.maintenance_records (
  id text PRIMARY KEY,
  machine_id text NOT NULL REFERENCES agrorisk.machines(id) ON DELETE CASCADE,
  maintenance_type text NOT NULL,
  performed_at timestamptz NOT NULL,
  next_due_at timestamptz NOT NULL,
  observation text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('ok', 'due_soon', 'overdue')),
  source text NOT NULL DEFAULT 'synthetic' CHECK (source IN ('real', 'demo', 'synthetic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (next_due_at > performed_at)
);

CREATE INDEX IF NOT EXISTS maintenance_records_machine_due_idx
  ON agrorisk.maintenance_records(machine_id, next_due_at DESC);

INSERT INTO agrorisk.maintenance_records (
  id,
  machine_id,
  maintenance_type,
  performed_at,
  next_due_at,
  observation,
  status,
  source
)
SELECT
  'MNT-' || m.id || '-SYNTHETIC',
  m.id,
  CASE
    WHEN m.id = 'MQ-071' THEN 'Revisão preventiva'
    WHEN m.id = 'MQ-080' THEN 'Troca de óleo e filtros'
    WHEN m.id = 'MQ-111' THEN 'Inspeção geral'
    WHEN substring(m.id FROM '[0-9]+')::integer % 3 = 0 THEN 'Revisão preventiva'
    WHEN substring(m.id FROM '[0-9]+')::integer % 3 = 1 THEN 'Troca de óleo e filtros'
    ELSE 'Inspeção geral'
  END,
  CASE
    WHEN m.id = 'MQ-071' THEN timestamptz '2026-09-02 09:00:00-03'
    WHEN m.id = 'MQ-080' THEN timestamptz '2026-09-02 10:00:00-03'
    WHEN m.id = 'MQ-111' THEN timestamptz '2026-08-20 08:30:00-03'
    ELSE timestamptz '2026-08-20 09:00:00-03'
      + make_interval(days => substring(m.id FROM '[0-9]+')::integer % 10)
  END,
  CASE
    WHEN m.id = 'MQ-071' THEN timestamptz '2026-10-15 09:00:00-03'
    WHEN m.id = 'MQ-080' THEN timestamptz '2026-09-18 10:00:00-03'
    WHEN m.id = 'MQ-111' THEN timestamptz '2026-09-05 08:30:00-03'
    WHEN substring(m.id FROM '[0-9]+')::integer % 3 = 0 THEN timestamptz '2026-10-10 09:00:00-03'
    WHEN substring(m.id FROM '[0-9]+')::integer % 3 = 1 THEN timestamptz '2026-09-17 09:00:00-03'
    ELSE timestamptz '2026-09-04 09:00:00-03'
  END,
  'Registro sintético determinístico para demonstração de manutenção preventiva.',
  CASE
    WHEN m.id = 'MQ-071' THEN 'ok'
    WHEN m.id = 'MQ-080' THEN 'due_soon'
    WHEN m.id = 'MQ-111' THEN 'overdue'
    WHEN substring(m.id FROM '[0-9]+')::integer % 3 = 0 THEN 'ok'
    WHEN substring(m.id FROM '[0-9]+')::integer % 3 = 1 THEN 'due_soon'
    ELSE 'overdue'
  END,
  'synthetic'
FROM agrorisk.machines m
ON CONFLICT (id) DO NOTHING;
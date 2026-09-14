CREATE TABLE IF NOT EXISTS agrorisk.actionable_alerts (
  id text PRIMARY KEY,
  recipient_user_id text NOT NULL REFERENCES agrorisk.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'acknowledged', 'resolved')),
  client_id text REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  operator_id text REFERENCES agrorisk.users(id) ON DELETE SET NULL,
  machine_id text REFERENCES agrorisk.machines(id) ON DELETE CASCADE,
  operation_id text REFERENCES agrorisk.operations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  source text NOT NULL,
  event_key text NOT NULL,
  condition_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'new' AND viewed_at IS NULL AND acknowledged_at IS NULL AND resolved_at IS NULL)
    OR (status = 'viewed' AND viewed_at IS NOT NULL AND acknowledged_at IS NULL AND resolved_at IS NULL)
    OR (status = 'acknowledged' AND viewed_at IS NOT NULL AND acknowledged_at IS NOT NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND viewed_at IS NOT NULL AND acknowledged_at IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK (acknowledged_at IS NULL OR viewed_at IS NOT NULL),
  CHECK (resolved_at IS NULL OR acknowledged_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS actionable_alerts_recipient_status_created_idx
  ON agrorisk.actionable_alerts(recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS actionable_alerts_client_idx ON agrorisk.actionable_alerts(client_id);
CREATE INDEX IF NOT EXISTS actionable_alerts_operator_idx ON agrorisk.actionable_alerts(operator_id);
CREATE INDEX IF NOT EXISTS actionable_alerts_machine_idx ON agrorisk.actionable_alerts(machine_id);
CREATE INDEX IF NOT EXISTS actionable_alerts_operation_idx ON agrorisk.actionable_alerts(operation_id);

-- Stable, idempotent fan-out of existing risk and maintenance events.
INSERT INTO agrorisk.actionable_alerts
  (id, recipient_user_id, type, severity, title, message, status, client_id, operator_id,
   machine_id, operation_id, created_at, source, event_key, condition_key)
SELECT md5(concat('risk:', a.id, ':', u.id)), u.id, 'risk',
  CASE WHEN a.criticality = 'alta' THEN 'critical' ELSE 'high' END,
  CASE WHEN a.criticality = 'alta' THEN 'Alerta crítico de risco legado' ELSE 'Alerta de risco' END,
  a.message, 'new', m.client_id, m.operator_id, a.machine_id, a.operation_id, a.created_at,
  concat('agrorisk.alerts:', a.id), concat('risk:', a.id), 'active'
FROM agrorisk.alerts a
JOIN agrorisk.machines m ON m.id = a.machine_id
JOIN agrorisk.operations o ON o.id = a.operation_id AND o.machine_id = a.machine_id
JOIN agrorisk.users u ON (
  (u.profile = 'operador' AND u.linked_operator_id = o.operator_id)
  OR (u.profile IN ('gestor', 'consultor') AND EXISTS (
    SELECT 1 FROM agrorisk.user_client_scopes s WHERE s.user_id = u.id AND s.client_id = m.client_id))
  OR (u.profile = 'admin' AND u.global_scope)
)
WHERE a.status <> 'resolvido'
ON CONFLICT (id) DO NOTHING;

-- Persist the existing homologated demo event AL-01 without changing telemetry or risk.
WITH demo_critical_scope AS (
  SELECT o.*
  FROM agrorisk.operations o
  WHERE o.operator_id = 'OPR-001'
  ORDER BY (o.status = 'Em andamento') DESC, o.scheduled_at DESC, o.id
  LIMIT 1
)
INSERT INTO agrorisk.actionable_alerts
  (id, recipient_user_id, type, severity, title, message, status, client_id, operator_id,
   machine_id, operation_id, created_at, source, event_key, condition_key)
SELECT
  md5(concat('demo-alert:AL-01:', u.id)),
  u.id,
  'inclination',
  'critical',
  'Inclinação acima do limite seguro',
  'Evento demonstrativo AL-01: inclinação crítica identificada durante a operação. Selecione uma condição segura antes de prosseguir.',
  'new',
  o.client_id,
  o.operator_id,
  o.machine_id,
  o.id,
  timestamptz '2026-09-11 09:20:00-03',
  'demo_alert:AL-01', 'demo_alert:AL-01', 'critical'
FROM demo_critical_scope o
JOIN agrorisk.users u ON (
  (u.profile = 'operador' AND u.linked_operator_id = o.operator_id)
  OR (u.profile IN ('gestor', 'consultor') AND EXISTS (
    SELECT 1 FROM agrorisk.user_client_scopes s
    WHERE s.user_id = u.id AND s.client_id = o.client_id
  ))
  OR (u.profile = 'admin' AND u.global_scope)
)
ON CONFLICT (id) DO NOTHING;

-- Materialize the existing deterministic critical-inclination telemetry signal.
WITH operation_inclination AS (
  SELECT
    o.*,
    2 + (
      (
        SELECT sum(ascii(character))
        FROM regexp_split_to_table(o.id, '') AS character
      ) % 150
    ) / 10.0 AS inclination_degrees
  FROM agrorisk.operations o
)
INSERT INTO agrorisk.actionable_alerts
  (id, recipient_user_id, type, severity, title, message, status, client_id, operator_id,
   machine_id, operation_id, created_at, source, event_key, condition_key)
SELECT
  md5(concat('synthetic-inclination:', o.id, ':', u.id)),
  u.id,
  'inclination',
  'critical',
  'Inclinação crítica',
  concat(
    'Inclinação de ',
    to_char(o.inclination_degrees, 'FM990.0'),
    '° classificada como crítica. Interrompa o avanço e retome somente em condição segura.'
  ),
  'new',
  o.client_id,
  o.operator_id,
  o.machine_id,
  o.id,
  o.created_at,
  concat('synthetic_inclination:', o.id), concat('synthetic_inclination:', o.id), 'critical'
FROM operation_inclination o
JOIN agrorisk.users u ON (
  (u.profile = 'operador' AND u.linked_operator_id = o.operator_id)
  OR (u.profile IN ('gestor', 'consultor') AND EXISTS (
    SELECT 1 FROM agrorisk.user_client_scopes s
    WHERE s.user_id = u.id AND s.client_id = o.client_id
  ))
  OR (u.profile = 'admin' AND u.global_scope)
)
WHERE o.inclination_degrees >= 15
ON CONFLICT (id) DO NOTHING;

INSERT INTO agrorisk.actionable_alerts
  (id, recipient_user_id, type, severity, title, message, status, client_id, operator_id,
   machine_id, operation_id, created_at, source, event_key, condition_key)
SELECT md5(concat('maintenance:', r.id, ':', u.id)), u.id, 'maintenance',
  CASE WHEN r.status = 'overdue' THEN 'high' ELSE 'medium' END,
  CASE WHEN r.status = 'overdue' THEN 'Manutenção atrasada' ELSE 'Manutenção próxima' END,
  concat(r.maintenance_type, ' para a máquina ', r.machine_id),
  'new', m.client_id, m.operator_id, r.machine_id, current_operation.id, r.created_at,
  concat('maintenance_records:', r.id), concat('maintenance_records:', r.id),
  r.status
FROM agrorisk.maintenance_records r
JOIN agrorisk.machines m ON m.id = r.machine_id
JOIN LATERAL (
  SELECT o.id
  FROM agrorisk.operations o
  WHERE o.machine_id = m.id
    AND o.operator_id = m.operator_id
    AND o.client_id = m.client_id
  ORDER BY (o.status = 'Em andamento') DESC, o.scheduled_at DESC, o.id
  LIMIT 1
) current_operation ON true
JOIN agrorisk.users u ON (
  (u.profile = 'operador' AND u.linked_operator_id = m.operator_id)
  OR (u.profile IN ('gestor', 'consultor') AND EXISTS (
    SELECT 1 FROM agrorisk.user_client_scopes s WHERE s.user_id = u.id AND s.client_id = m.client_id))
  OR (u.profile = 'admin' AND u.global_scope)
)
WHERE r.status IN ('due_soon', 'overdue')
ON CONFLICT (id) DO UPDATE SET
  severity = EXCLUDED.severity, title = EXCLUDED.title, message = EXCLUDED.message,
  status = CASE
    WHEN actionable_alerts.condition_key IS DISTINCT FROM EXCLUDED.condition_key THEN 'new'
    ELSE actionable_alerts.status
  END,
  viewed_at = CASE
    WHEN actionable_alerts.condition_key IS DISTINCT FROM EXCLUDED.condition_key THEN NULL
    ELSE actionable_alerts.viewed_at
  END,
  acknowledged_at = CASE
    WHEN actionable_alerts.condition_key IS DISTINCT FROM EXCLUDED.condition_key THEN NULL
    ELSE actionable_alerts.acknowledged_at
  END,
  resolved_at = CASE
    WHEN actionable_alerts.condition_key IS DISTINCT FROM EXCLUDED.condition_key THEN NULL
    ELSE actionable_alerts.resolved_at
  END,
  condition_key = EXCLUDED.condition_key, updated_at = now();
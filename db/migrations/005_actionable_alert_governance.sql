-- Governance for actionable alerts.  This migration is deliberately safe to
-- run after the original 004 migration has already been applied.
ALTER TABLE agrorisk.actionable_alerts
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS condition_key text;

UPDATE agrorisk.actionable_alerts
SET event_key = CASE
  WHEN source LIKE 'maintenance_records:%' THEN source
  ELSE source
END
WHERE event_key IS NULL;

UPDATE agrorisk.actionable_alerts
SET condition_key = CASE
  WHEN type = 'maintenance' AND source LIKE 'maintenance_records:%'
    THEN CASE WHEN severity = 'high' THEN 'overdue' ELSE 'due_soon' END
  ELSE 'active'
END
WHERE condition_key IS NULL;

-- Keep the newest, highest-severity coherent row and resolve all extras.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY recipient_user_id, event_key
    ORDER BY CASE severity
      WHEN 'critical' THEN 4 WHEN 'high' THEN 3
      WHEN 'medium' THEN 2 ELSE 1 END DESC, created_at DESC, id
  ) AS rn
  FROM agrorisk.actionable_alerts
  WHERE status <> 'resolved'
)
UPDATE agrorisk.actionable_alerts a
SET status = 'resolved', viewed_at = COALESCE(viewed_at, now()),
    acknowledged_at = COALESCE(acknowledged_at, now()),
    resolved_at = COALESCE(resolved_at, now()), updated_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

-- A maintenance condition change is incoherent when both states remain open.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY recipient_user_id, machine_id, type
    ORDER BY CASE WHEN condition_key = 'overdue' THEN 2 ELSE 1 END DESC,
             CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3
               WHEN 'medium' THEN 2 ELSE 1 END DESC, created_at DESC, id
  ) AS rn
  FROM agrorisk.actionable_alerts
  WHERE status <> 'resolved' AND type = 'maintenance'
)
UPDATE agrorisk.actionable_alerts a
SET status = 'resolved', viewed_at = COALESCE(viewed_at, now()),
    acknowledged_at = COALESCE(acknowledged_at, now()),
    resolved_at = COALESCE(resolved_at, now()), updated_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

ALTER TABLE agrorisk.actionable_alerts
  ALTER COLUMN event_key SET NOT NULL,
  ALTER COLUMN condition_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS actionable_alerts_active_event_idx
  ON agrorisk.actionable_alerts(recipient_user_id, event_key)
  WHERE status <> 'resolved';
CREATE UNIQUE INDEX IF NOT EXISTS actionable_alerts_active_maintenance_condition_idx
  ON agrorisk.actionable_alerts(recipient_user_id, machine_id, type, condition_key)
  WHERE status <> 'resolved' AND type = 'maintenance';
CREATE UNIQUE INDEX IF NOT EXISTS actionable_alerts_active_maintenance_machine_idx
  ON agrorisk.actionable_alerts(recipient_user_id, machine_id, type)
  WHERE status <> 'resolved' AND type = 'maintenance';

CREATE OR REPLACE FUNCTION agrorisk.resolve_previous_maintenance_condition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'maintenance' AND NEW.status <> 'resolved'
     AND NEW.machine_id IS NOT NULL THEN
    UPDATE agrorisk.actionable_alerts
    SET status = 'resolved',
        viewed_at = COALESCE(viewed_at, now()),
        acknowledged_at = COALESCE(acknowledged_at, now()),
        resolved_at = COALESCE(resolved_at, now()),
        updated_at = now()
    WHERE recipient_user_id = NEW.recipient_user_id
      AND machine_id = NEW.machine_id
      AND type = NEW.type
      AND status <> 'resolved'
      AND condition_key <> NEW.condition_key
      AND id <> COALESCE(NEW.id, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS actionable_alerts_maintenance_condition_trigger
  ON agrorisk.actionable_alerts;
CREATE TRIGGER actionable_alerts_maintenance_condition_trigger
BEFORE INSERT OR UPDATE OF condition_key, status ON agrorisk.actionable_alerts
FOR EACH ROW EXECUTE FUNCTION agrorisk.resolve_previous_maintenance_condition();
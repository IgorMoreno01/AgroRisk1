CREATE SCHEMA IF NOT EXISTS agrorisk;

CREATE TABLE IF NOT EXISTS agrorisk.clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  municipality text NOT NULL,
  state char(2) NOT NULL,
  main_operation text NOT NULL DEFAULT '',
  avg_score integer NOT NULL DEFAULT 0 CHECK (avg_score BETWEEN 0 AND 100),
  risk_level text NOT NULL DEFAULT 'baixo' CHECK (risk_level IN ('baixo', 'medio', 'alto')),
  agricultural_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_history jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agrorisk.farms (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  municipality text NOT NULL,
  state char(2) NOT NULL,
  latitude double precision,
  longitude double precision,
  region text,
  agricultural_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, client_id)
);

CREATE TABLE IF NOT EXISTS agrorisk.areas (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  farm_id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('Campo aberto', 'Área próxima de água', 'Transporte interno', 'Talhão com solo crítico', 'Área de acesso restrito')),
  condition text NOT NULL DEFAULT '',
  near_water text NOT NULL DEFAULT 'baixa' CHECK (near_water IN ('baixa', 'média', 'alta')),
  environmental_risk text NOT NULL DEFAULT 'baixo' CHECK (environmental_risk IN ('baixo', 'medio', 'alto')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  crop text NOT NULL,
  hectares numeric(12,2) NOT NULL CHECK (hectares >= 0),
  center_latitude double precision,
  center_longitude double precision,
  boundary_geojson jsonb,
  climate_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  terrain_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  hydrography_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_history jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (farm_id, client_id) REFERENCES agrorisk.farms(id, client_id),
  UNIQUE (id, client_id)
);

CREATE TABLE IF NOT EXISTS agrorisk.users (
  id text PRIMARY KEY,
  client_id text REFERENCES agrorisk.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  profile text NOT NULL CHECK (profile IN ('gestor', 'operador', 'consultor', 'admin')),
  permissions text[] NOT NULL DEFAULT '{}',
  email text,
  password_hash text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  global_scope boolean NOT NULL DEFAULT false,
  linked_operator_id text REFERENCES agrorisk.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, client_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON agrorisk.users (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS agrorisk.user_client_scopes (
  user_id text NOT NULL REFERENCES agrorisk.users(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

CREATE TABLE IF NOT EXISTS agrorisk.machines (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  model text NOT NULL,
  type text NOT NULL CHECK (type IN ('Trator', 'Colheitadeira', 'Pulverizador', 'Caminhão de apoio', 'Plantadeira')),
  client_id text NOT NULL REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  area_id text NOT NULL,
  operator_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('ativa', 'parada', 'em alerta', 'crítica')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  risk_level text NOT NULL DEFAULT 'baixo' CHECK (risk_level IN ('baixo', 'medio', 'alto')),
  last_alert text NOT NULL DEFAULT '',
  last_update text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (area_id, client_id) REFERENCES agrorisk.areas(id, client_id),
  FOREIGN KEY (operator_id, client_id) REFERENCES agrorisk.users(id, client_id),
  UNIQUE (id, client_id),
  UNIQUE (id, area_id, client_id)
);

CREATE TABLE IF NOT EXISTS agrorisk.risk_factors (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Clima', 'Proximidade de água', 'Tipo de operação', 'Histórico operacional', 'Inclinação', 'Condição do terreno')),
  weight integer NOT NULL DEFAULT 0 CHECK (weight BETWEEN 0 AND 100),
  description text NOT NULL DEFAULT '',
  impact text NOT NULL CHECK (impact IN ('baixo', 'medio', 'alto'))
);

CREATE TABLE IF NOT EXISTS agrorisk.recommendations (
  id text PRIMARY KEY,
  risk_type text NOT NULL,
  text text NOT NULL,
  rationale text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('gestor', 'operador', 'consultor', 'admin'))
);

CREATE TABLE IF NOT EXISTS agrorisk.operations (
  id text PRIMARY KEY,
  machine_id text NOT NULL,
  operator_id text NOT NULL,
  client_id text NOT NULL REFERENCES agrorisk.clients(id) ON DELETE CASCADE,
  area_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('Trabalho no campo', 'Transporte', 'Operação próxima de água', 'Deslocamento interno', 'Pulverização', 'Colheita')),
  scheduled_at timestamptz NOT NULL,
  start_label text NOT NULL DEFAULT '',
  duration_label text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('Em andamento', 'Concluída', 'Interrompida', 'Agendada')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  recommendation_id text REFERENCES agrorisk.recommendations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (machine_id, area_id, client_id) REFERENCES agrorisk.machines(id, area_id, client_id),
  FOREIGN KEY (area_id, client_id) REFERENCES agrorisk.areas(id, client_id),
  FOREIGN KEY (operator_id, client_id) REFERENCES agrorisk.users(id, client_id),
  UNIQUE (id, machine_id)
);

CREATE TABLE IF NOT EXISTS agrorisk.operation_risk_factors (
  operation_id text NOT NULL REFERENCES agrorisk.operations(id) ON DELETE CASCADE,
  risk_factor_id text NOT NULL REFERENCES agrorisk.risk_factors(id),
  PRIMARY KEY (operation_id, risk_factor_id)
);

CREATE TABLE IF NOT EXISTS agrorisk.alerts (
  id text PRIMARY KEY,
  machine_id text NOT NULL REFERENCES agrorisk.machines(id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  type text NOT NULL,
  criticality text NOT NULL CHECK (criticality IN ('baixa', 'média', 'alta')),
  risk_level text NOT NULL CHECK (risk_level IN ('baixo', 'medio', 'alto')),
  message text NOT NULL,
  main_factor_id text REFERENCES agrorisk.risk_factors(id),
  status text NOT NULL CHECK (status IN ('aberto', 'em análise', 'resolvido')),
  occurred_at timestamptz NOT NULL,
  time_label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (operation_id, machine_id) REFERENCES agrorisk.operations(id, machine_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agrorisk.operation_history (
  id text PRIMARY KEY,
  machine_id text NOT NULL REFERENCES agrorisk.machines(id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  occurred_on date NOT NULL,
  summary text NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  FOREIGN KEY (operation_id, machine_id) REFERENCES agrorisk.operations(id, machine_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS farms_client_idx ON agrorisk.farms(client_id);
CREATE INDEX IF NOT EXISTS areas_client_farm_idx ON agrorisk.areas(client_id, farm_id);
CREATE INDEX IF NOT EXISTS machines_client_area_idx ON agrorisk.machines(client_id, area_id);
CREATE INDEX IF NOT EXISTS operations_client_area_machine_idx ON agrorisk.operations(client_id, area_id, machine_id);
CREATE INDEX IF NOT EXISTS alerts_operation_machine_idx ON agrorisk.alerts(operation_id, machine_id);
CREATE INDEX IF NOT EXISTS history_operation_machine_idx ON agrorisk.operation_history(operation_id, machine_id);
CREATE INDEX IF NOT EXISTS user_client_scopes_client_idx ON agrorisk.user_client_scopes(client_id);
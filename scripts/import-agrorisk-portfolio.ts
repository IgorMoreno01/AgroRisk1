import { resolve } from "node:path";
import postgres from "postgres";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

export const DEFAULT_PORTFOLIO_PATH =
  "attached_assets/AgroRisk_Carteira_500_Cenarios_1789051546393.xlsx";

const OPERATION_TYPE_MAP = {
  "Deslocamento interno": "Deslocamento interno",
  "Transporte interno": "Deslocamento interno",
  Plantio: "Trabalho no campo",
  "Preparo de solo": "Trabalho no campo",
  "Inspeção preventiva": "Trabalho no campo",
  "Apoio operacional": "Trabalho no campo",
  Pulverização: "Pulverização",
  Colheita: "Colheita",
} as const;

const MACHINE_TYPE_MAP = {
  Trator: "Trator",
  Colheitadeira: "Colheitadeira",
  Pulverizador: "Pulverizador",
  Plantadeira: "Plantadeira",
  "Máquina de apoio": "Caminhão de apoio",
} as const;

const MACHINE_STATUS_MAP = {
  Ativa: "ativa",
  Parada: "parada",
  "Em alerta": "em alerta",
  Crítica: "crítica",
} as const;

const EXPECTED_COUNTS = {
  Clientes: 25,
  Fazendas: 35,
  Areas: 90,
  Operadores: 55,
  Maquinas: 120,
  Cenarios_500: 500,
} as const;

const requiredText = (row: Row, column: string, context: string): string => {
  const value = row[column];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`${context}: coluna obrigatória "${column}" vazia.`);
  }
  return String(value).trim();
};

const requiredNumber = (row: Row, column: string, context: string): number => {
  const value = Number(row[column]);
  if (!Number.isFinite(value)) {
    throw new Error(`${context}: coluna "${column}" não é numérica.`);
  }
  return value;
};

const excelDate = (value: unknown, context: string): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(
        Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)),
      );
    }
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return excelDate(numeric, context);
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  throw new Error(`${context}: início da operação inválido.`);
};

const rowsFromSheet = (workbook: XLSX.WorkBook, name: string): Row[] => {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Aba obrigatória "${name}" não encontrada.`);
  return XLSX.utils.sheet_to_json<Row>(sheet, {
    raw: true,
    defval: null,
  });
};

const uniqueById = (rows: Row[], column: string, sheet: string): void => {
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const id = requiredText(row, column, `${sheet} linha ${index + 2}`);
    if (seen.has(id)) throw new Error(`${sheet}: ID duplicado "${id}".`);
    seen.add(id);
  }
};

export interface PortfolioSeed {
  clients: Record<string, unknown>[];
  farms: Record<string, unknown>[];
  areas: Record<string, unknown>[];
  users: Record<string, unknown>[];
  machines: Record<string, unknown>[];
  operations: Record<string, unknown>[];
}

export function loadPortfolioSeed(filePath = DEFAULT_PORTFOLIO_PATH): PortfolioSeed {
  const workbook = XLSX.readFile(resolve(filePath), { cellDates: false });
  const source = Object.fromEntries(
    Object.keys(EXPECTED_COUNTS).map((sheet) => [sheet, rowsFromSheet(workbook, sheet)]),
  ) as Record<keyof typeof EXPECTED_COUNTS, Row[]>;

  for (const [sheet, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (source[sheet as keyof typeof source].length !== expected) {
      throw new Error(
        `${sheet}: esperado ${expected} registros, encontrado ${source[sheet as keyof typeof source].length}.`,
      );
    }
  }

  uniqueById(source.Clientes, "cliente_id", "Clientes");
  uniqueById(source.Fazendas, "fazenda_id", "Fazendas");
  uniqueById(source.Areas, "area_id", "Areas");
  uniqueById(source.Operadores, "operador_id", "Operadores");
  uniqueById(source.Maquinas, "maquina_id", "Maquinas");
  uniqueById(source.Cenarios_500, "operacao_id", "Cenarios_500");

  const clientIds = new Set(source.Clientes.map((row) => requiredText(row, "cliente_id", "Clientes")));
  const farmsById = new Map(
    source.Fazendas.map((row) => [requiredText(row, "fazenda_id", "Fazendas"), row]),
  );
  const areasById = new Map(
    source.Areas.map((row) => [requiredText(row, "area_id", "Areas"), row]),
  );
  const operatorsById = new Map(
    source.Operadores.map((row) => [requiredText(row, "operador_id", "Operadores"), row]),
  );
  const machinesById = new Map(
    source.Maquinas.map((row) => [requiredText(row, "maquina_id", "Maquinas"), row]),
  );
  const firstFarmByClient = new Map<string, Row>();

  for (const row of [...source.Fazendas].sort((a, b) =>
    requiredText(a, "fazenda_id", "Fazendas").localeCompare(
      requiredText(b, "fazenda_id", "Fazendas"),
    ),
  )) {
    const clientId = requiredText(row, "cliente_id", "Fazendas");
    if (!clientIds.has(clientId)) throw new Error(`Fazenda referencia cliente inexistente: ${clientId}.`);
    if (!firstFarmByClient.has(clientId)) firstFarmByClient.set(clientId, row);
  }

  const clients = source.Clientes.map((row) => {
    const id = requiredText(row, "cliente_id", "Clientes");
    const canonicalFarm = firstFarmByClient.get(id);
    if (!canonicalFarm) throw new Error(`Cliente ${id} não possui fazenda para localização canônica.`);
    return {
      id,
      name: requiredText(row, "cliente_nome", `Cliente ${id}`),
      municipality: requiredText(canonicalFarm, "municipio", `Cliente ${id}`),
      state: requiredText(canonicalFarm, "UF", `Cliente ${id}`),
      main_operation: requiredText(canonicalFarm, "cultura_principal", `Cliente ${id}`),
      avg_score: 0,
      risk_level: "baixo",
      agricultural_context: {
        dataNature: {
          client: "synthetic",
          geographicAgriculturalContext: "public_real",
        },
        canonicalLocationFarmId: requiredText(canonicalFarm, "fazenda_id", `Cliente ${id}`),
      },
      risk_history: {},
    };
  });

  const farms = source.Fazendas.map((row) => {
    const id = requiredText(row, "fazenda_id", "Fazendas");
    return {
      id,
      client_id: requiredText(row, "cliente_id", `Fazenda ${id}`),
      name: requiredText(row, "fazenda_nome", `Fazenda ${id}`),
      municipality: requiredText(row, "municipio", `Fazenda ${id}`),
      state: requiredText(row, "UF", `Fazenda ${id}`),
      latitude: null,
      longitude: null,
      region: null,
      agricultural_context: {
        geocode: requiredText(row, "geocodigo", `Fazenda ${id}`),
        mainCrop: requiredText(row, "cultura_principal", `Fazenda ${id}`),
        zarcContext: requiredText(row, "contexto_zarc", `Fazenda ${id}`),
        municipalPlantedAreaHa: requiredNumber(row, "area_plantada_municipio_ha", `Fazenda ${id}`),
        municipalProductionValueThousandBrl: requiredNumber(
          row,
          "valor_producao_municipio_mil_reais",
          `Fazenda ${id}`,
        ),
        sources: {
          pam: requiredText(row, "fonte_contexto", `Fazenda ${id}`),
          zarc: requiredText(row, "fonte_risco", `Fazenda ${id}`),
        },
        dataNature: {
          farm: "synthetic",
          geographicAgriculturalContext: "public_real",
        },
      },
    };
  });

  const areas = source.Areas.map((row) => {
    const id = requiredText(row, "area_id", "Areas");
    const clientId = requiredText(row, "cliente_id", `Área ${id}`);
    const farmId = requiredText(row, "fazenda_id", `Área ${id}`);
    const farm = farmsById.get(farmId);
    if (!farm || requiredText(farm, "cliente_id", `Fazenda ${farmId}`) !== clientId) {
      throw new Error(`Área ${id}: fazenda e cliente incompatíveis.`);
    }
    return {
      id,
      client_id: clientId,
      farm_id: farmId,
      name: requiredText(row, "area_nome", `Área ${id}`),
      type: "Campo aberto",
      condition: "",
      near_water: "baixa",
      environmental_risk: "baixo",
      score: 0,
      crop: requiredText(row, "cultura", `Área ${id}`),
      hectares: requiredNumber(row, "hectares", `Área ${id}`),
      center_latitude: null,
      center_longitude: null,
      boundary_geojson: null,
      climate_context: {
        zarcContext: requiredText(farm, "contexto_zarc", `Fazenda ${farmId}`),
        source: requiredText(farm, "fonte_risco", `Fazenda ${farmId}`),
      },
      terrain_context: {
        classification: "not_provided",
        dataNature: "synthetic_operational_area",
      },
      hydrography_context: {
        classification: "not_provided",
      },
      risk_history: {},
    };
  });

  const users = source.Operadores.map((row) => {
    const id = requiredText(row, "operador_id", "Operadores");
    const clientId = requiredText(row, "cliente_id", `Operador ${id}`);
    if (!clientIds.has(clientId)) throw new Error(`Operador ${id}: cliente inexistente.`);
    return {
      id,
      client_id: clientId,
      name: requiredText(row, "operador_nome", `Operador ${id}`),
      profile: "operador",
      permissions: [],
    };
  });

  const machines = source.Maquinas.map((row) => {
    const id = requiredText(row, "maquina_id", "Maquinas");
    const clientId = requiredText(row, "cliente_id", `Máquina ${id}`);
    const areaId = requiredText(row, "area_id", `Máquina ${id}`);
    const operatorId = requiredText(row, "operador_id_preferencial", `Máquina ${id}`);
    const area = areasById.get(areaId);
    const operator = operatorsById.get(operatorId);
    if (!area || requiredText(area, "cliente_id", `Área ${areaId}`) !== clientId) {
      throw new Error(`Máquina ${id}: área e cliente incompatíveis.`);
    }
    if (!operator || requiredText(operator, "cliente_id", `Operador ${operatorId}`) !== clientId) {
      throw new Error(`Máquina ${id}: operador e cliente incompatíveis.`);
    }
    const sourceType = requiredText(row, "maquina_tipo", `Máquina ${id}`);
    const type = MACHINE_TYPE_MAP[sourceType as keyof typeof MACHINE_TYPE_MAP];
    const sourceStatus = requiredText(row, "status_maquina", `Máquina ${id}`);
    const status = MACHINE_STATUS_MAP[sourceStatus as keyof typeof MACHINE_STATUS_MAP];
    if (!type) throw new Error(`Máquina ${id}: tipo não mapeado "${sourceType}".`);
    if (!status) throw new Error(`Máquina ${id}: status não mapeado "${sourceStatus}".`);
    return {
      id,
      code: id,
      name: `${type} ${id}`,
      model: requiredText(row, "maquina_modelo", `Máquina ${id}`),
      type,
      client_id: clientId,
      area_id: areaId,
      operator_id: operatorId,
      status,
      score: 0,
      risk_level: "baixo",
      last_alert: "",
      last_update: "",
    };
  });

  const operations = source.Cenarios_500.map((row) => {
    const id = requiredText(row, "operacao_id", "Cenarios_500");
    const clientId = requiredText(row, "cliente_id", `Operação ${id}`);
    const areaId = requiredText(row, "area_id", `Operação ${id}`);
    const machineId = requiredText(row, "maquina_id", `Operação ${id}`);
    const operatorId = requiredText(row, "operador_id", `Operação ${id}`);
    const machine = machinesById.get(machineId);
    const operator = operatorsById.get(operatorId);
    if (
      !machine ||
      requiredText(machine, "cliente_id", `Máquina ${machineId}`) !== clientId ||
      requiredText(machine, "area_id", `Máquina ${machineId}`) !== areaId
    ) {
      throw new Error(`Operação ${id}: máquina, área e cliente incompatíveis.`);
    }
    if (!operator || requiredText(operator, "cliente_id", `Operador ${operatorId}`) !== clientId) {
      throw new Error(`Operação ${id}: operador e cliente incompatíveis.`);
    }
    if (row.score_final !== null && row.score_final !== undefined && row.score_final !== "") {
      throw new Error(`Operação ${id}: score_final deve permanecer vazio.`);
    }
    const sourceType = requiredText(row, "tipo_operacao", `Operação ${id}`);
    const type = OPERATION_TYPE_MAP[sourceType as keyof typeof OPERATION_TYPE_MAP];
    if (!type) throw new Error(`Operação ${id}: tipo não mapeado "${sourceType}".`);
    const scheduledAt = excelDate(row.inicio_operacao, `Operação ${id}`);
    const durationHours = requiredNumber(row, "duracao_horas", `Operação ${id}`);
    return {
      id,
      machine_id: machineId,
      operator_id: operatorId,
      client_id: clientId,
      area_id: areaId,
      type,
      scheduled_at: scheduledAt,
      start_label: scheduledAt.toISOString().slice(11, 16),
      duration_label: `${durationHours}h`,
      status: requiredText(row, "status_operacao", `Operação ${id}`),
      score: 0,
      recommendation_id: null,
    };
  });

  return { clients, farms, areas, users, machines, operations };
}

async function seedPortfolio(seed: PortfolioSeed, dryRun: boolean): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está configurada.");
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  class DryRunRollback extends Error {}

  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO agrorisk.clients ${tx(seed.clients)}
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, municipality = excluded.municipality, state = excluded.state,
          main_operation = excluded.main_operation, agricultural_context = excluded.agricultural_context,
          risk_history = excluded.risk_history, updated_at = now()
      `;
      await tx`
        INSERT INTO agrorisk.farms ${tx(seed.farms)}
        ON CONFLICT (id) DO UPDATE SET
          client_id = excluded.client_id, name = excluded.name, municipality = excluded.municipality,
          state = excluded.state, latitude = excluded.latitude, longitude = excluded.longitude,
          region = excluded.region, agricultural_context = excluded.agricultural_context,
          updated_at = now()
      `;
      await tx`
        INSERT INTO agrorisk.areas ${tx(seed.areas)}
        ON CONFLICT (id) DO UPDATE SET
          client_id = excluded.client_id, farm_id = excluded.farm_id, name = excluded.name,
          type = excluded.type, condition = excluded.condition, near_water = excluded.near_water,
          environmental_risk = excluded.environmental_risk, crop = excluded.crop,
          hectares = excluded.hectares, center_latitude = excluded.center_latitude,
          center_longitude = excluded.center_longitude, boundary_geojson = excluded.boundary_geojson,
          climate_context = excluded.climate_context, terrain_context = excluded.terrain_context,
          hydrography_context = excluded.hydrography_context, risk_history = excluded.risk_history,
          updated_at = now()
      `;
      await tx`
        INSERT INTO agrorisk.users ${tx(seed.users)}
        ON CONFLICT (id) DO UPDATE SET
          client_id = excluded.client_id, name = excluded.name
      `;
      await tx`
        INSERT INTO agrorisk.machines ${tx(seed.machines)}
        ON CONFLICT (id) DO UPDATE SET
          code = excluded.code, name = excluded.name, model = excluded.model, type = excluded.type,
          client_id = excluded.client_id, area_id = excluded.area_id,
          operator_id = excluded.operator_id, status = excluded.status, updated_at = now()
      `;
      await tx`
        INSERT INTO agrorisk.operations ${tx(seed.operations)}
        ON CONFLICT (id) DO UPDATE SET
          machine_id = excluded.machine_id, operator_id = excluded.operator_id,
          client_id = excluded.client_id, area_id = excluded.area_id, type = excluded.type,
          scheduled_at = excluded.scheduled_at, start_label = excluded.start_label,
          duration_label = excluded.duration_label, status = excluded.status, updated_at = now()
      `;

      const [integrity] = await tx`
        SELECT
          (SELECT count(*)::int FROM agrorisk.clients) AS clients,
          (SELECT count(*)::int FROM agrorisk.farms) AS farms,
          (SELECT count(*)::int FROM agrorisk.areas) AS areas,
          (SELECT count(*)::int FROM agrorisk.users WHERE profile = 'operador') AS operators,
          (SELECT count(*)::int FROM agrorisk.machines) AS machines,
          (SELECT count(*)::int FROM agrorisk.operations) AS operations,
          (SELECT count(*)::int FROM agrorisk.machines m
            LEFT JOIN agrorisk.clients c ON c.id = m.client_id
            LEFT JOIN agrorisk.areas a ON a.id = m.area_id AND a.client_id = m.client_id
            LEFT JOIN agrorisk.users u ON u.id = m.operator_id AND u.client_id = m.client_id
            WHERE c.id IS NULL OR a.id IS NULL OR u.id IS NULL) AS broken_machine_relations,
          (SELECT count(*)::int FROM agrorisk.operations o
            LEFT JOIN agrorisk.machines m ON m.id = o.machine_id
              AND m.area_id = o.area_id AND m.client_id = o.client_id
            LEFT JOIN agrorisk.areas a ON a.id = o.area_id AND a.client_id = o.client_id
            LEFT JOIN agrorisk.users u ON u.id = o.operator_id AND u.client_id = o.client_id
            WHERE m.id IS NULL OR a.id IS NULL OR u.id IS NULL) AS broken_operation_relations,
          (SELECT count(*)::int FROM agrorisk.clients
            WHERE agricultural_context->'dataNature'->>'client' = 'synthetic')
            AS clients_with_provenance,
          (SELECT count(*)::int FROM agrorisk.farms
            WHERE agricultural_context->'sources'->>'pam' LIKE 'IBGE PAM%'
              AND agricultural_context->'sources'->>'zarc' LIKE 'MAPA ZARC%')
            AS farms_with_public_sources
      `;
      console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "commit", integrity }, null, 2));
      if (
        integrity.clients !== 25 ||
        integrity.farms !== 35 ||
        integrity.areas !== 90 ||
        integrity.operators !== 55 ||
        integrity.machines !== 120 ||
        integrity.operations !== 500 ||
        integrity.broken_machine_relations !== 0 ||
        integrity.broken_operation_relations !== 0 ||
        integrity.clients_with_provenance !== 25 ||
        integrity.farms_with_public_sources !== 35
      ) {
        throw new Error("Verificação de integridade falhou; transação revertida.");
      }
      if (dryRun) throw new DryRunRollback("Dry-run validado; transação revertida.");
    });
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log(error.message);
      return;
    }
    throw error;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.find((arg) => !arg.startsWith("--"));
  const seed = loadPortfolioSeed(positional ?? DEFAULT_PORTFOLIO_PATH);
  console.log(
    JSON.stringify(
      {
        source: positional ?? DEFAULT_PORTFOLIO_PATH,
        validated: {
          clients: seed.clients.length,
          farms: seed.farms.length,
          areas: seed.areas.length,
          operators: seed.users.length,
          machines: seed.machines.length,
          operations: seed.operations.length,
        },
      },
      null,
      2,
    ),
  );
  await seedPortfolio(seed, dryRun);
}

if (import.meta.main) {
  await main();
}
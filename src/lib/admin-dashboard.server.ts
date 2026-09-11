import type { Alert, Area, Client, Machine, Operation, RiskLevel } from "./mock-data";
import type { AgroRiskRepository } from "./data/repository";
import { mockRepository } from "./data/mock-repository.server";
import { listAdminOperationalOverview, listClientRelationalScope, postgresRepository } from "./data/postgres-repository.server";
import { cacheOrFetch } from "./cache.server";
import { getRiskEngineV2Configuration } from "./risk-config.server";
import {
  buildFallbackOperationRiskContext,
  evaluateOperationRiskV2,
  type OperationRiskRelationalContext,
} from "./risk-engine-v2/operation-input.server";
import type { RiskEngineV2Result, RiskEngineV2Weights } from "./risk-engine-v2/types";
import type {
  AdminAreaRow,
  AdminClientRow,
  AdminDashboardSnapshot,
  AdminEntityRisk,
  AdminMachineRow,
  AdminOperationRow,
  AdminOperationTypeRow,
  AdminOperationalOverview,
  AdminRiskDistribution,
} from "./admin-dashboard-types";

interface RelationalSnapshot {
  clients: Client[];
  areas: Area[];
  machines: Machine[];
  operations: Operation[];
  alerts: Alert[];
  riskContexts?: OperationRiskRelationalContext[];
}

const toEntityRisk = (result: RiskEngineV2Result): AdminEntityRisk => ({
  score: result.finalScore,
  level: result.level,
  mainFactor: result.drivers[0]?.label ?? "Sem fator dominante",
});

const averageRisk = (
  risks: readonly AdminEntityRisk[],
  fallback: AdminEntityRisk,
): AdminEntityRisk => {
  if (risks.length === 0) return fallback;
  const score = Math.round(risks.reduce((total, risk) => total + risk.score, 0) / risks.length);
  const mainFactor =
    Object.entries(
      risks.reduce<Record<string, number>>((counts, risk) => {
        counts[risk.mainFactor] = (counts[risk.mainFactor] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? fallback.mainFactor;
  return {
    score,
    level: score >= 71 ? "alto" : score >= 41 ? "medio" : "baixo",
    mainFactor,
  };
};

const distribution = (rows: readonly AdminEntityRisk[]): AdminRiskDistribution => ({
  alto: rows.filter((row) => row.level === "alto").length,
  medio: rows.filter((row) => row.level === "medio").length,
  baixo: rows.filter((row) => row.level === "baixo").length,
  total: rows.length,
});

const newestOperation = (operations: readonly Operation[]): Operation | undefined =>
  [...operations].sort((left, right) => {
    const leftActive = left.status === "Em andamento" ? 1 : 0;
    const rightActive = right.status === "Em andamento" ? 1 : 0;
    return (
      rightActive - leftActive ||
      Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt) ||
      left.id.localeCompare(right.id)
    );
  })[0];

export function buildAdminDashboardSnapshot(
  relational: RelationalSnapshot,
  source: "postgres" | "mock",
  degraded: boolean,
  weights: RiskEngineV2Weights,
  operationalOverview: AdminOperationalOverview = {
    maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
    activity: [],
  },
): AdminDashboardSnapshot {
  const clientById = new Map(relational.clients.map((client) => [client.id, client]));
  const areaById = new Map(relational.areas.map((area) => [area.id, area]));
  const machineById = new Map(relational.machines.map((machine) => [machine.id, machine]));
  const contextByOperationId = new Map(
    (relational.riskContexts ?? []).map((context) => [context.operation.id, context]),
  );
  const operationsByMachine = new Map<string, Operation[]>();
  const operationsByArea = new Map<string, Operation[]>();

  for (const operation of relational.operations) {
    operationsByMachine.set(operation.machineId, [
      ...(operationsByMachine.get(operation.machineId) ?? []),
      operation,
    ]);
    operationsByArea.set(operation.areaId, [
      ...(operationsByArea.get(operation.areaId) ?? []),
      operation,
    ]);
  }

  const operationRows: AdminOperationRow[] = relational.operations.map((operation) => {
    const context = contextByOperationId.get(operation.id) ?? buildFallbackOperationRiskContext(
      operation,
      machineById.get(operation.machineId)!,
      areaById.get(operation.areaId)!,
      clientById.get(operation.clientId)!,
    );
    const evaluation = evaluateOperationRiskV2(context, weights);
    return { operation, evaluation, ...toEntityRisk(evaluation.result) };
  });
  const operationRiskById = new Map(operationRows.map((row) => [row.operation.id, row]));

  const machineRows: AdminMachineRow[] = relational.machines
    .flatMap((machine): AdminMachineRow[] => {
      const operation = newestOperation(operationsByMachine.get(machine.id) ?? []);
      if (!operation) return [];
      const risk = operationRiskById.get(operation.id)!;
      return [{
        machine,
        operation,
        score: risk.score,
        level: risk.level,
        mainFactor: risk.mainFactor,
        evaluation: risk.evaluation,
        alertsCount: relational.alerts.filter((alert) => alert.machineId === machine.id).length,
      }];
    })
    .sort((left, right) => right.score - left.score || left.machine.id.localeCompare(right.machine.id));
  const machineRiskById = new Map(machineRows.map((row) => [row.machine.id, row]));

  const areaRows: AdminAreaRow[] = relational.areas
    .flatMap((area): AdminAreaRow[] => {
      const areaMachines = relational.machines.filter((machine) => machine.areaId === area.id);
      const risks = areaMachines
        .map((machine) => machineRiskById.get(machine.id))
        .filter((risk): risk is AdminMachineRow => risk !== undefined);
      if (risks.length === 0) return [];
      const risk = averageRisk(risks, risks[0]);
      return [{
        area,
        ...risk,
        activeOperations: (operationsByArea.get(area.id) ?? []).filter(
          (operation) => operation.status === "Em andamento",
        ).length,
        machineCount: areaMachines.length,
      }];
    })
    .sort((left, right) => right.score - left.score || left.area.id.localeCompare(right.area.id));
  const clientRows: AdminClientRow[] = relational.clients
    .flatMap((client): AdminClientRow[] => {
      const clientMachines = machineRows.filter((row) => row.machine.clientId === client.id);
      const clientAreas = areaRows.filter((row) => row.area.clientId === client.id);
      if (clientMachines.length === 0) return [];
      const risk = averageRisk(clientMachines, clientMachines[0]);
      const topArea = [...clientAreas].sort(
        (left, right) => right.score - left.score || left.area.id.localeCompare(right.area.id),
      )[0];
      return [{
        client,
        ...risk,
        machinesHigh: clientMachines.filter((row) => row.level === "alto").length,
        topAreaName: topArea?.area.name ?? "—",
      }];
    })
    .sort((left, right) => right.score - left.score || left.client.id.localeCompare(right.client.id));

  const operationTypes = [...new Set(relational.operations.map((operation) => operation.type))];
  const operationTypeRows: AdminOperationTypeRow[] = operationTypes
    .map((type) => {
      const matching = operationRows.filter((row) => row.operation.type === type);
      return {
        type,
        count: matching.length,
        ...averageRisk(matching, {
          score: 0,
          level: "baixo" as RiskLevel,
          mainFactor: "Sem fator dominante",
        }),
      };
    })
    .sort((left, right) => right.score - left.score || left.type.localeCompare(right.type));

  return {
    source,
    degraded,
    loadedAt: new Date().toISOString(),
    weights,
    clients: relational.clients,
    areas: relational.areas,
    machines: relational.machines,
    operations: relational.operations,
    machineRows,
    areaRows,
    clientRows,
    operationRows,
    operationTypeRows,
    machineDistribution: distribution(machineRows),
    areaDistribution: distribution(areaRows),
    operationalOverview,
  };
}

const readRepository = async (repository: AgroRiskRepository): Promise<RelationalSnapshot> => {
  if (repository === postgresRepository) {
    const [relational, alerts] = await Promise.all([
      listClientRelationalScope(null),
      repository.listAlerts(),
    ]);
    return { ...relational, alerts };
  }
  const [clients, areas, machines, operations, alerts] = await Promise.all([
    repository.listClients(),
    repository.listAreas(),
    repository.listMachines(),
    repository.listOperations(),
    repository.listAlerts(),
  ]);
  return { clients, areas, machines, operations, alerts };
};

export async function loadAdminDashboardSnapshot(
  primary: AgroRiskRepository = postgresRepository,
  fallback: AgroRiskRepository = mockRepository,
): Promise<AdminDashboardSnapshot> {
  const configuration = getRiskEngineV2Configuration();
  const weights = {
    ml: configuration.mlWeight,
    operationalRules: configuration.operationalRulesWeight,
  };

  const load = async () => {
    try {
      const [relational, operationalOverview] = await Promise.all([
        readRepository(primary),
        primary === postgresRepository
          ? listAdminOperationalOverview()
          : Promise.resolve({ maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] }, activity: [] }),
      ]);
      return buildAdminDashboardSnapshot(relational, "postgres", false, weights, operationalOverview);
    } catch (error) {
      console.error("[admin-dashboard] PostgreSQL indisponível; usando fallback mock.", {
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      return buildAdminDashboardSnapshot(await readRepository(fallback), "mock", true, weights);
    }
  };
  if (primary !== postgresRepository || fallback !== mockRepository) return load();
  return cacheOrFetch(
    `admin-dashboard:v2:${configuration.mlWeight}:${configuration.operationalRulesWeight}`,
    15,
    load,
  );
}

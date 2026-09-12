import type { Alert, Area, Client, Machine, Operation, RiskLevel } from "./mock-data";
import type { AgroRiskRepository } from "./data/repository";
import { mockRepository } from "./data/mock-repository.server";
import {
  listAdminOperationalOverview,
  listClientRelationalScope,
  listOperationRiskContexts,
  postgresRepository,
} from "./data/postgres-repository.server";
import { cacheOrFetch } from "./cache.server";
import { resolveRiskEngineV2Weights } from "./risk-config.server";
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

export interface AdminRiskBatchEvaluation {
  operationRows: AdminOperationRow[];
  riskErrorsByOperationId: Record<string, string>;
}

const adminRiskBatchInFlight = new Map<string, Promise<AdminRiskBatchEvaluation>>();
const adminSnapshotInFlight = new Map<string, Promise<AdminDashboardSnapshot>>();
export const ADMIN_RISK_BATCH_LIMIT = 20;

export function assertOperationClientCoherence(
  operation: Operation,
  context: OperationRiskRelationalContext,
): void {
  const clientId = operation.clientId;
  if (
    context.operation.clientId !== clientId ||
    context.machine.clientId !== clientId ||
    context.area.clientId !== clientId ||
    context.client.id !== clientId
  ) {
    throw new Error(`Contexto relacional incoerente para a operação ${operation.id}.`);
  }
}

async function resolveWeightsByClientId(
  clientIds: readonly string[],
  repository: AgroRiskRepository,
) {
  return new Map(await Promise.all(
    [...new Set(clientIds)].map(async (clientId) => [
      clientId,
      await resolveRiskEngineV2Weights(clientId, repository),
    ] as const),
  ));
}

export function selectPrioritizedAdminOperations(
  operations: readonly Operation[],
  operationIds: readonly string[] = [],
  limit = 12,
): Operation[] {
  const ids = new Set(operationIds);
  return [...operations]
    .filter((operation) => ids.size === 0 || ids.has(operation.id))
    .sort((left, right) =>
      (right.status === "Em andamento" ? 1 : 0) -
        (left.status === "Em andamento" ? 1 : 0) ||
      Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt) ||
      left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(1, Math.min(limit, ADMIN_RISK_BATCH_LIMIT)));
}

export async function evaluateAdminDashboardRiskBatchDetails(
  operationIds: readonly string[] = [],
  limit = 12,
  repository: AgroRiskRepository = postgresRepository,
): Promise<AdminRiskBatchEvaluation> {
  const ids = [...new Set(operationIds)].slice(0, ADMIN_RISK_BATCH_LIMIT);
  const batchSize = Math.max(1, Math.min(limit, ADMIN_RISK_BATCH_LIMIT));
  const relational = await readRepository(repository, false);
  const selected = selectPrioritizedAdminOperations(relational.operations, ids, batchSize);
  const effectiveByClientId = await resolveWeightsByClientId(
    selected.map((operation) => operation.clientId),
    repository,
  );
  const configurationSignature = [...effectiveByClientId.values()]
    .map((resolved) => resolved.cacheSignature)
    .sort()
    .join("|");
  const run = async () => {
    const clientById = new Map(relational.clients.map((client) => [client.id, client]));
    const areaById = new Map(relational.areas.map((area) => [area.id, area]));
    const machineById = new Map(relational.machines.map((machine) => [machine.id, machine]));
    const contextByOperationId = new Map((
      repository === postgresRepository
        ? await listOperationRiskContexts({
            operationIds: selected.map((operation) => operation.id),
          })
        : []
    ).map((context) => [context.operation.id, context]));
    const settled = await Promise.allSettled(selected.map(async (operation) => {
      const context = contextByOperationId.get(operation.id) ??
        buildFallbackOperationRiskContext(
          operation,
          machineById.get(operation.machineId)!,
          areaById.get(operation.areaId)!,
          clientById.get(operation.clientId)!,
        );
      assertOperationClientCoherence(operation, context);
      const weights = effectiveByClientId.get(operation.clientId)?.weights;
      if (!weights) throw new Error(`Pesos não resolvidos para o cliente ${operation.clientId}.`);
      const evaluation = await evaluateOperationRiskV2(
        context,
        weights,
      );
      return { operation, evaluation, ...toEntityRisk(evaluation.result) };
    }));
    return {
      operationRows: settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
      riskErrorsByOperationId: Object.fromEntries(settled.flatMap((result, index) =>
        result.status === "rejected"
          ? [[selected[index].id, result.reason instanceof Error ? result.reason.message : "Não foi possível calcular o risco."]]
          : [],
      )),
    };
  };
  const key = `${ids.slice().sort().join(",")}:${batchSize}:${configurationSignature}`;
  const existing = adminRiskBatchInFlight.get(key);
  if (existing) return existing;
  const promise = run();
  adminRiskBatchInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    adminRiskBatchInFlight.delete(key);
  }
}

/** Compatibility wrapper for callers that only need successful rows. */
export async function evaluateAdminDashboardRiskBatch(
  operationIds: readonly string[] = [],
  limit = 12,
  repository: AgroRiskRepository = postgresRepository,
): Promise<AdminOperationRow[]> {
  return (
    await evaluateAdminDashboardRiskBatchDetails(operationIds, limit, repository)
  ).operationRows;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function buildAdminDashboardSnapshot(
  relational: RelationalSnapshot,
  source: "postgres" | "mock",
  degraded: boolean,
  weights: RiskEngineV2Weights,
  operationalOverview: AdminOperationalOverview = {
    maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
    activity: [],
  },
  effectiveWeightsByClientId: ReadonlyMap<string, RiskEngineV2Weights> | unknown = new Map(),
): Promise<AdminDashboardSnapshot> {
  const clientWeightMap =
    effectiveWeightsByClientId instanceof Map
      ? effectiveWeightsByClientId as ReadonlyMap<string, RiskEngineV2Weights>
      : new Map<string, RiskEngineV2Weights>();
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

  const operationRows: AdminOperationRow[] = await mapWithConcurrency(
    relational.operations,
    6,
    async (operation) => {
      const context = contextByOperationId.get(operation.id) ?? buildFallbackOperationRiskContext(
        operation,
        machineById.get(operation.machineId)!,
        areaById.get(operation.areaId)!,
        clientById.get(operation.clientId)!,
      );
      assertOperationClientCoherence(operation, context);
      const operationWeights = clientWeightMap.get(operation.clientId) ?? weights;
      const evaluation = await evaluateOperationRiskV2(context, operationWeights);
      return { operation, evaluation, ...toEntityRisk(evaluation.result) };
    },
  );
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

/**
 * Phase A deliberately stops at the relational boundary.  Risk Engine V2 is
 * requested by the Admin endpoint in small batches, so opening the dashboard
 * never fans out to climate/geocoding providers for the whole portfolio.
 */
export async function buildAdminDashboardRelationalSnapshot(
  relational: RelationalSnapshot,
  source: "postgres" | "mock",
  degraded: boolean,
  weights: RiskEngineV2Weights,
  operationalOverview: AdminOperationalOverview = {
    maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] },
    activity: [],
  },
): Promise<AdminDashboardSnapshot> {
  const alertCountsByMachine = relational.alerts.reduce<Record<string, number>>((counts, alert) => {
    counts[alert.machineId] = (counts[alert.machineId] ?? 0) + 1;
    return counts;
  }, {});
  return {
    source,
    degraded,
    loadedAt: new Date().toISOString(),
    weights,
    clients: relational.clients,
    areas: relational.areas,
    machines: relational.machines,
    operations: relational.operations,
    machineRows: [],
    areaRows: [],
    clientRows: [],
    operationRows: [],
    operationTypeRows: [],
    machineDistribution: { alto: 0, medio: 0, baixo: 0, total: 0 },
    areaDistribution: { alto: 0, medio: 0, baixo: 0, total: 0 },
    operationalOverview,
    alertCountsByMachine,
    riskCoverageComplete: false,
  };
}

const readRepository = async (
  repository: AgroRiskRepository,
  includeRiskContexts = true,
): Promise<RelationalSnapshot> => {
  if (repository === postgresRepository) {
    const [relational, alerts] = await Promise.all([
      listClientRelationalScope(null, includeRiskContexts),
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
  const load = async () => {
    try {
      const globalConfiguration = await resolveRiskEngineV2Weights(undefined, primary);
      const weights = globalConfiguration.weights;
      const useProgressiveAdminLoad =
        primary === postgresRepository && fallback === mockRepository;
      const [relational, operationalOverview] = await Promise.all([
        readRepository(primary, !useProgressiveAdminLoad),
        primary === postgresRepository
          ? listAdminOperationalOverview()
          : Promise.resolve({ maintenance: { overdueCount: 0, dueSoonCount: 0, top: [] }, activity: [] }),
      ]);
      // Explicit service injection is retained for integrations/tests that
      // need the complete legacy snapshot. Production Admin loads relational
      // data first and evaluates only through the authenticated batch API.
      const effectiveByClientId = useProgressiveAdminLoad
        ? new Map()
        : new Map(
            [...(await resolveWeightsByClientId(
              relational.operations.map((operation) => operation.clientId),
              primary,
            )).entries()].map(([clientId, resolved]) => [clientId, resolved.weights]),
          );
      return useProgressiveAdminLoad
        ? await buildAdminDashboardRelationalSnapshot(
            relational, "postgres", false, weights, operationalOverview,
          )
        : await buildAdminDashboardSnapshot(
            relational, "postgres", false, weights, operationalOverview, effectiveByClientId,
          );
    } catch (error) {
      if (error instanceof RangeError) throw error;
      console.error("[admin-dashboard] PostgreSQL indisponível; usando fallback mock.", {
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
      // Custom repositories/services retain the legacy contract. Only the
      // production postgres+mock path uses the relational Phase A fallback.
      if (primary !== postgresRepository || fallback !== mockRepository) {
        const relational = await readRepository(fallback);
        const fallbackGlobal = await resolveRiskEngineV2Weights(undefined, fallback);
        const effectiveByClientId = new Map(
          [...(await resolveWeightsByClientId(
            relational.operations.map((operation) => operation.clientId),
            fallback,
          )).entries()].map(([clientId, resolved]) => [clientId, resolved.weights]),
        );
        return await buildAdminDashboardSnapshot(
          relational, "mock", true, fallbackGlobal.weights, undefined, effectiveByClientId,
        );
      }
      const fallbackGlobal = await resolveRiskEngineV2Weights(undefined, fallback);
      return await buildAdminDashboardRelationalSnapshot(
        await readRepository(fallback), "mock", true, fallbackGlobal.weights,
      );
    }
  };
  if (primary !== postgresRepository || fallback !== mockRepository) return load();

  let globalConfiguration;
  try {
    globalConfiguration = await resolveRiskEngineV2Weights(undefined, primary);
  } catch (error) {
    if (error instanceof RangeError) throw error;
    return load();
  }
  const cacheKey = `admin-dashboard:v3:${globalConfiguration.cacheSignature}:postgres:relational`;
  const existing = adminSnapshotInFlight.get(cacheKey);
  if (existing) return existing;
  const promise = cacheOrFetch(cacheKey, 15, load);
  adminSnapshotInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    adminSnapshotInFlight.delete(cacheKey);
  }
}

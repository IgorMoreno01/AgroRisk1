import type { Area, Client, Machine, Operation, RiskLevel } from "./mock-data";
import type {
  AdminAreaRow,
  AdminClientRow,
  AdminDashboardSnapshot,
  AdminEntityRisk,
  AdminMachineRow,
  AdminOperationRow,
  AdminOperationTypeRow,
} from "./admin-dashboard-types";

const newest = (operations: readonly Operation[]) => [...operations].sort((left, right) =>
  (right.status === "Em andamento" ? 1 : 0) - (left.status === "Em andamento" ? 1 : 0) ||
  Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt) ||
  left.id.localeCompare(right.id),
)[0];

const averageRisk = (risks: readonly AdminEntityRisk[], fallback: AdminEntityRisk): AdminEntityRisk => {
  if (risks.length === 0) return fallback;
  const score = Math.round(risks.reduce((total, risk) => total + risk.score, 0) / risks.length);
  const mainFactor = Object.entries(risks.reduce<Record<string, number>>((counts, risk) => {
    counts[risk.mainFactor] = (counts[risk.mainFactor] ?? 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? fallback.mainFactor;
  return { score, level: score >= 71 ? "alto" : score >= 41 ? "medio" : "baixo", mainFactor };
};

export function mergeAdminOperationRows(
  snapshot: AdminDashboardSnapshot,
  incoming: readonly AdminOperationRow[],
): AdminDashboardSnapshot {
  const operationRows = [...new Map([...snapshot.operationRows, ...incoming].map((row) => [row.operation.id, row])).values()];
  const operationById = new Map(operationRows.map((row) => [row.operation.id, row]));
  const operationsByMachine = new Map<string, Operation[]>();
  for (const operation of snapshot.operations) {
    operationsByMachine.set(operation.machineId, [...(operationsByMachine.get(operation.machineId) ?? []), operation]);
  }
  const machineRows: AdminMachineRow[] = snapshot.machines.flatMap((machine) => {
    const operation = newest(operationsByMachine.get(machine.id) ?? []);
    const risk = operation ? operationById.get(operation.id) : undefined;
    if (!operation || !risk) return [];
    return [{ machine, operation, score: risk.score, level: risk.level, mainFactor: risk.mainFactor,
      evaluation: risk.evaluation, alertsCount: snapshot.alertCountsByMachine?.[machine.id] ?? 0 }];
  });
  const machineById = new Map(machineRows.map((row) => [row.machine.id, row]));
  const areasById = new Map<string, Machine[]>();
  snapshot.machines.forEach((machine) => areasById.set(machine.areaId, [...(areasById.get(machine.areaId) ?? []), machine]));
  const areaRows: AdminAreaRow[] = snapshot.areas.flatMap((area) => {
    const relevant = (areasById.get(area.id) ?? []).filter((machine) =>
      (operationsByMachine.get(machine.id) ?? []).length > 0);
    const risks = relevant.map((machine) => machineById.get(machine.id)).filter((row): row is AdminMachineRow => !!row);
    if (relevant.length === 0 || risks.length !== relevant.length) return [];
    return [{ area, ...averageRisk(risks, risks[0]), activeOperations: snapshot.operations
      .filter((operation) => operation.areaId === area.id && operation.status === "Em andamento").length,
      machineCount: relevant.length }];
  });
  const clientRows: AdminClientRow[] = snapshot.clients.flatMap((client) => {
    const relevant = snapshot.machines.filter((machine) => machine.clientId === client.id &&
      (operationsByMachine.get(machine.id) ?? []).length > 0);
    const risks = relevant.map((machine) => machineById.get(machine.id)).filter((row): row is AdminMachineRow => !!row);
    if (relevant.length === 0 || risks.length !== relevant.length) return [];
    const areas = areaRows.filter((row) => row.area.clientId === client.id);
    const topArea = [...areas].sort((left, right) => right.score - left.score || left.area.id.localeCompare(right.area.id))[0];
    return [{ client, ...averageRisk(risks, risks[0]), machinesHigh: risks.filter((row) => row.level === "alto").length,
      topAreaName: topArea?.area.name ?? "—" }];
  });
  const types = [...new Set(snapshot.operations.map((operation) => operation.type))];
  const operationTypeRows: AdminOperationTypeRow[] = types.flatMap((type) => {
    const matching = snapshot.operations.filter((operation) => operation.type === type);
    const risks = matching.map((operation) => operationById.get(operation.id)).filter((row): row is AdminOperationRow => !!row);
    if (risks.length !== matching.length) return [];
    return [{ type, count: matching.length, ...averageRisk(risks, { score: 0, level: "baixo" as RiskLevel, mainFactor: "Sem fator dominante" }) }];
  });
  const complete = operationRows.length === snapshot.operations.length &&
    machineRows.length === snapshot.machines.filter((machine) => (operationsByMachine.get(machine.id) ?? []).length > 0).length;
  return { ...snapshot, operationRows, machineRows, areaRows, clientRows, operationTypeRows,
    machineDistribution: complete ? distribution(machineRows) : { alto: 0, medio: 0, baixo: 0, total: 0 },
    areaDistribution: complete && areaRows.length === snapshot.areas.length ? distribution(areaRows) : { alto: 0, medio: 0, baixo: 0, total: 0 },
    riskCoverageComplete: complete };
}

function distribution(rows: readonly AdminEntityRisk[]) {
  return { alto: rows.filter((row) => row.level === "alto").length, medio: rows.filter((row) => row.level === "medio").length,
    baixo: rows.filter((row) => row.level === "baixo").length, total: rows.length };
}
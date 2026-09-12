import type { Area, Machine, Operation } from "./mock-data";

export function selectConsultorPriorityOperationIds(input: {
  operations: readonly Operation[];
  machines: readonly Machine[];
  areas: readonly Area[];
  evaluatedOperationIds?: readonly string[];
  limit?: number;
}): string[] {
  const prioritized = [...input.operations].sort((left, right) =>
    Number(right.status === "Em andamento") - Number(left.status === "Em andamento") ||
    Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt) ||
    left.id.localeCompare(right.id));
  const operationByMachine = new Map<string, Operation>();
  prioritized.forEach((operation) => {
    if (!operationByMachine.has(operation.machineId)) {
      operationByMachine.set(operation.machineId, operation);
    }
  });
  const visibleAreaIds = new Set(input.areas.slice(0, 3).map((area) => area.id));
  const orderedMachineIds = [
    prioritized[0]?.machineId,
    ...input.machines.slice(0, 3).map((machine) => machine.id),
    ...input.machines
      .filter((machine) => visibleAreaIds.has(machine.areaId))
      .map((machine) => machine.id),
    ...input.machines.map((machine) => machine.id),
  ].filter((id): id is string => Boolean(id));
  const evaluated = new Set(input.evaluatedOperationIds ?? []);
  const ids = orderedMachineIds
    .map((machineId) => operationByMachine.get(machineId))
    .filter((operation): operation is Operation =>
      operation !== undefined && !evaluated.has(operation.id))
    .map((operation) => operation.id);
  return [...new Set(ids)].slice(0, Math.max(1, Math.min(input.limit ?? 12, 12)));
}
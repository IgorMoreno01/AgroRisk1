// ============================================================
// Sompo AgroRisk · Lógica de ranking (Parte 4)
// Construído sobre risk-score.ts (Parte 3) + mock-data.ts (Parte 2).
// ============================================================

import {
  machines, areas, operations, alerts, clients,
  type Machine, type Area, type Operation, type OperationType, type RiskLevel,
} from "./mock-data";
import {
  scoreMachine, scoreArea, scoreOperation, scoreByOperationType,
  currentOperationFor, type ScoreBreakdown,
} from "./risk-score";

// ---------- Filtros ----------
export interface RankingFilters {
  clientId?: string;        // "all" | id
  level?: RiskLevel | "all";
  operationType?: OperationType | "all";
  areaId?: string;          // "all" | id
}

const passLevel = (lvl: RiskLevel, f: RankingFilters) =>
  !f.level || f.level === "all" || f.level === lvl;

const passClient = (clientId: string, f: RankingFilters) =>
  !f.clientId || f.clientId === "all" || f.clientId === clientId;

const passArea = (areaId: string, f: RankingFilters) =>
  !f.areaId || f.areaId === "all" || f.areaId === areaId;

const passOpType = (opType: OperationType | undefined, f: RankingFilters) =>
  !f.operationType || f.operationType === "all" || f.operationType === opType;

// ---------- Contagens de alertas ----------
export const alertsByMachineCount = (machineId: string) =>
  alerts.filter((a) => a.machineId === machineId).length;

export const criticalAlertsByMachineCount = (machineId: string) =>
  alerts.filter((a) => a.machineId === machineId && a.criticality === "alta").length;

export const alertsByAreaCount = (areaId: string) =>
  alerts.filter((a) => operations.some((o) => o.id === a.operationId && o.areaId === areaId)).length;

export const machinesInArea = (areaId: string) =>
  machines.filter((m) => m.areaId === areaId);

export const activeOperationsInArea = (areaId: string) =>
  operations.filter((o) => o.areaId === areaId && o.status === "Em andamento");

// ---------- Linhas enriquecidas ----------
export interface MachineRankRow {
  machine: Machine;
  operation?: Operation;
  score: number;
  level: RiskLevel;
  mainFactor: string;
  breakdown: ScoreBreakdown;
  alertsCount: number;
  criticalAlerts: number;
}

export interface AreaRankRow {
  area: Area;
  score: number;
  level: RiskLevel;
  mainFactor: string;
  activeOperations: number;
  machineCount: number;
  alertsCount: number;
  machinesHigh: number;
}

// ---------- Rankings ----------
export function rankMachines(filters: RankingFilters = {}): MachineRankRow[] {
  return machines
    .map<MachineRankRow>((m) => {
      const op = currentOperationFor(m.id);
      const b = scoreMachine(m.id);
      return {
        machine: m,
        operation: op,
        score: b.total,
        level: b.level,
        mainFactor: b.mainFactor,
        breakdown: b,
        alertsCount: alertsByMachineCount(m.id),
        criticalAlerts: criticalAlertsByMachineCount(m.id),
      };
    })
    .filter((r) =>
      passClient(r.machine.clientId, filters) &&
      passLevel(r.level, filters) &&
      passArea(r.machine.areaId, filters) &&
      passOpType(r.operation?.type, filters),
    )
    .sort((a, b) =>
      b.score - a.score || b.criticalAlerts - a.criticalAlerts,
    );
}

export function rankAreas(filters: RankingFilters = {}): AreaRankRow[] {
  return areas
    .map<AreaRankRow>((a) => {
      const s = scoreArea(a.id);
      const ms = machinesInArea(a.id);
      const machinesHigh = ms.filter((m) => scoreMachine(m.id).level === "alto").length;
      return {
        area: a,
        score: s.score,
        level: s.level,
        mainFactor: s.topFactor,
        activeOperations: activeOperationsInArea(a.id).length,
        machineCount: ms.length,
        alertsCount: alertsByAreaCount(a.id),
        machinesHigh,
      };
    })
    .filter((r) =>
      passClient(r.area.clientId, filters) &&
      passLevel(r.level, filters) &&
      passArea(r.area.id, filters) &&
      (filters.operationType === undefined || filters.operationType === "all" ||
        operations.some((o) => o.areaId === r.area.id && o.type === filters.operationType)),
    )
    .sort((a, b) =>
      b.score - a.score || b.machinesHigh - a.machinesHigh,
    );
}

export interface OpTypeRankRow {
  type: OperationType;
  count: number;
  score: number;
  level: RiskLevel;
  mainFactor: string;
}

export function rankOperationTypes(filters: RankingFilters = {}): OpTypeRankRow[] {
  return scoreByOperationType()
    .map<OpTypeRankRow>((s) => {
      const ops = operations.filter((o) => o.type === s.type &&
        passClient(o.clientId, filters) &&
        passArea(o.areaId, filters));
      const scores = ops.map((o) => scoreOperation(o));
      const total = scores.length
        ? Math.round(scores.reduce((a, b) => a + b.total, 0) / scores.length)
        : 0;
      const tally: Record<string, number> = {};
      scores.forEach((b) => { tally[b.mainFactor] = (tally[b.mainFactor] ?? 0) + 1; });
      const mainFactor = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return {
        type: s.type,
        count: ops.length,
        score: total,
        level: total >= 71 ? "alto" : total >= 41 ? "medio" : "baixo",
        mainFactor,
      };
    })
    .filter((r) =>
      (filters.operationType === undefined || filters.operationType === "all" || filters.operationType === r.type) &&
      passLevel(r.level, filters) &&
      r.count > 0,
    )
    .sort((a, b) => b.score - a.score);
}

// ---------- Top N e distribuição ----------
export const topMachines = (n = 3, f: RankingFilters = {}) => rankMachines(f).slice(0, n);
export const topAreas    = (n = 3, f: RankingFilters = {}) => rankAreas(f).slice(0, n);

export interface RiskDistribution {
  alto: number;
  medio: number;
  baixo: number;
  total: number;
}

export function machineDistribution(f: RankingFilters = {}): RiskDistribution {
  const rows = rankMachines({ ...f, level: "all" });
  return {
    alto:  rows.filter((r) => r.level === "alto").length,
    medio: rows.filter((r) => r.level === "medio").length,
    baixo: rows.filter((r) => r.level === "baixo").length,
    total: rows.length,
  };
}

export function areaDistribution(f: RankingFilters = {}): RiskDistribution {
  const rows = rankAreas({ ...f, level: "all" });
  return {
    alto:  rows.filter((r) => r.level === "alto").length,
    medio: rows.filter((r) => r.level === "medio").length,
    baixo: rows.filter((r) => r.level === "baixo").length,
    total: rows.length,
  };
}

// ---------- Resumo executivo de priorização ----------
export function priorityHeadline(f: RankingFilters = {}): string {
  const tops = topMachines(2, f);
  const topAreasList = topAreas(2, f);
  if (tops.length === 0) {
    return "Nenhum equipamento ou área atende aos filtros atuais.";
  }
  const mainFactors = Array.from(new Set([
    ...tops.map((t) => t.mainFactor),
    ...topAreasList.map((a) => a.mainFactor),
  ])).slice(0, 2);

  const equipNames = tops.map((t) => t.machine.code).join(" e ");
  const areaNames = topAreasList.map((a) => a.area.name).join(" e ");

  return (
    `Hoje, os maiores riscos estão concentrados em ${mainFactors.join(" e ").toLowerCase()}. ` +
    `Recomenda-se priorizar os equipamentos ${equipNames}` +
    (areaNames ? `, além de revisar as operações em ${areaNames}.` : ".")
  );
}

// ---------- Auxiliares de seleção (filtros UI) ----------
export const clientOptions = () => [{ id: "all", name: "Todos os clientes" }, ...clients.map((c) => ({ id: c.id, name: c.name }))];
export const areaOptions   = () => [{ id: "all", name: "Todas as áreas" },    ...areas.map((a)   => ({ id: a.id,  name: a.name }))];
export const opTypeOptions: { id: OperationType | "all"; name: string }[] = [
  { id: "all", name: "Todos os tipos" },
  { id: "Trabalho no campo", name: "Trabalho no campo" },
  { id: "Transporte", name: "Transporte" },
  { id: "Operação próxima de água", name: "Operação próxima de água" },
  { id: "Deslocamento interno", name: "Deslocamento interno" },
  { id: "Pulverização", name: "Pulverização" },
  { id: "Colheita", name: "Colheita" },
];
export const levelOptions: { id: RiskLevel | "all"; name: string }[] = [
  { id: "all", name: "Todos os níveis" },
  { id: "alto",  name: "Risco alto" },
  { id: "medio", name: "Risco médio" },
  { id: "baixo", name: "Risco baixo" },
];

// ============================================================
// Sompo AgroRisk · Motor de Recomendações (Parte 5)
// Regras determinísticas que transformam score + composição + mocks
// em recomendações acionáveis, com prioridade e justificativa curta.
// Sem IA real, sem APIs externas. Apenas regras claras.
// ============================================================

import {
  type Operation, type OperationType, type Machine, type Area, type Client,
  machines, operations, areas, alerts,
  getMachine, getArea, getClient,
} from "./mock-data";
import {
  scoreMachine, scoreArea, scoreClientWithWeights,
  currentOperationFor, inputsForOperationWithOverrides, riskResultForOperation,
  riskResultForMachine, scoreAreaWithWeights,
  dominantFactorLabel, inclinationLabel, riskFromScore,
  type ScoreBreakdown, type ScorePart, type RiskLevel, type RiskResult,
  type RiskWeights, type RiskInputs,
} from "./risk-score";

// ---------- Tipos ----------
export type RecCategory =
  | "Rota"
  | "Horário"
  | "Inclinação"
  | "Operação"
  | "Manutenção"
  | "Treinamento"
  | "Atenção ambiental"
  | "Prevenção de sinistro";

export type RecPriority = "baixa" | "média" | "alta";
export type RecAudience = "operador" | "gestor" | "consultor" | "admin";

export interface GeneratedRecommendation {
  id: string;
  title: string;
  description: string;
  rationale: string;
  category: RecCategory;
  priority: RecPriority;
  audience: RecAudience;
  factor: string; // categoria do fator (ex: "Proximidade de água")
}

export interface RiskEvaluationOptions {
  weights?: Partial<RiskWeights>;
  result?: RiskResult;
  overrides?: Partial<RiskInputs>;
}

// ---------- Helpers ----------
const partByCategory = (b: ScoreBreakdown, category: string): ScorePart | undefined =>
  b.parts.find((p) => p.category === category);

export const mainPart = (b: ScoreBreakdown): ScorePart | undefined =>
  [...b.parts].sort((a, b) => b.points / Math.max(1, b.max) - a.points / Math.max(1, a.max))[0];

const dominantInternalPart = (result: RiskResult): ScorePart | undefined => {
  const relevantParts = result.dominantFactor === "climate"
    ? result.breakdown.parts.filter((part) => part.category === "Clima")
    : result.dominantFactor === "operational"
    ? result.breakdown.parts.filter((part) => part.category !== "Clima")
    : result.breakdown.parts;
  return [...relevantParts].sort((a, b) => b.points - a.points)[0];
};

const categoryForFactor = (factor?: string): RecCategory => {
  if (factor === "Clima") return "Horário";
  if (factor === "Proximidade de água") return "Rota";
  if (factor === "Tipo de operação") return "Operação";
  if (factor === "Histórico operacional") return "Manutenção";
  if (factor === "Condição do terreno") return "Atenção ambiental";
  return "Prevenção de sinistro";
};

const priorityFromScore = (score: number): RecPriority =>
  score >= 71 ? "alta" : score >= 41 ? "média" : "baixa";

const titleForFactor = (factor?: string) => {
  if (factor === "Clima") return "Reavaliar a janela climática";
  if (factor === "Proximidade de água") return "Revisar a rota próxima à água";
  if (factor === "Tipo de operação") return "Revisar as condições da operação";
  if (factor === "Histórico operacional") return "Priorizar inspeção preventiva";
  if (factor === "Condição do terreno") return "Revisar a condição do terreno";
  return "Manter a operação sob monitoramento";
};

const descriptionForAudience = (audience: RecAudience, factor: string) => {
  if (audience === "operador") {
    return `Evite continuar sem verificar ${factor.toLowerCase()} e interrompa a operação se houver agravamento.`;
  }
  if (audience === "consultor") {
    return `O principal ponto de atenção está relacionado a ${factor.toLowerCase()}; orientar acompanhamento preventivo ao cliente.`;
  }
  if (audience === "admin") {
    return `Componente dominante identificado pelo motor, com ação preventiva sobre ${factor.toLowerCase()}.`;
  }
  return `Priorize esta operação para revisão e controle de ${factor.toLowerCase()}.`;
};

function recommendationForResult(
  result: RiskResult,
  audience: RecAudience,
  id: string,
): GeneratedRecommendation[] {
  const responsiblePart = dominantInternalPart(result);
  const factor = responsiblePart?.category ?? result.breakdown.mainFactor;
  return [{
    id,
    title: titleForFactor(factor),
    description: descriptionForAudience(audience, factor),
    rationale: responsiblePart
      ? `${dominantFactorLabel(result.dominantFactor)}; fator responsável: ${responsiblePart.label.toLowerCase()} (${responsiblePart.detail.toLowerCase()}).`
      : `Score atual ${result.finalScore}/100, sem fator interno significativo.`,
    category: categoryForFactor(factor),
    priority: priorityFromScore(result.finalScore),
    audience,
    factor,
  }];
}

function recsForOperation(
  op: Operation,
  audience: RecAudience,
  options?: RiskEvaluationOptions,
): GeneratedRecommendation[] {
  const result = options?.result ?? riskResultForOperation(op, options?.weights, options?.overrides);
  return recommendationForResult(result, audience, `${op.id}-engine`);
}

function aggregateRiskResults(
  results: RiskResult[],
  summary: { score: number; level: RiskLevel; topFactor: string },
): RiskResult | undefined {
  if (results.length === 0) return undefined;
  const average = (values: number[]) =>
    Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  const parts = results[0].breakdown.parts.map((part) => ({
    ...part,
    points: Math.round(average(results.map((result) =>
      result.breakdown.parts.find((candidate) => candidate.category === part.category)?.points ?? 0
    ))),
    detail: "Média consolidada",
  }));
  const dominantFactor = summary.topFactor === "Risco climático"
    ? "climate"
    : summary.topFactor === "Risco operacional"
    ? "operational"
    : "balanced";
  return {
    climateScore: Math.round(average(results.map((result) => result.climateScore))),
    operationalScore: Math.round(average(results.map((result) => result.operationalScore))),
    climateContribution: average(results.map((result) => result.climateContribution)),
    operationalContribution: average(results.map((result) => result.operationalContribution)),
    finalScore: summary.score,
    level: summary.level,
    dominantFactor,
    breakdown: {
      total: Math.round(average(results.map((result) => result.breakdown.total))),
      level: riskFromScore(summary.score),
      parts,
      mainFactor: [...parts].sort((a, b) => b.points - a.points)[0]?.category ?? "—",
    },
  };
}

export function telemetrySafetyRecommendationsForOperation(
  op: Operation,
  audience: RecAudience = "operador",
  overrides?: Partial<RiskInputs>,
): GeneratedRecommendation[] {
  const inputs = inputsForOperationWithOverrides(op, overrides);
  const absoluteInclination = Math.abs(inputs.inclinationDegrees);
  if (absoluteInclination < 5) return [];
  return [{
    id: `${op.id}-telemetry-inclination`,
    title: "Selecionar rota com menor inclinação",
    description: audience === "operador"
      ? "Interrompa o avanço e retome somente por um trecho com inclinação segura."
      : "Replanejar a rota para evitar trechos com inclinação acima do limite.",
    rationale: `Telemetria MPU6050: inclinação ${inclinationLabel(inputs.inclinationDegrees).toLowerCase()} aumenta o risco de tombamento.`,
    category: "Inclinação",
    priority: absoluteInclination >= 15 ? "alta" : "média",
    audience,
    factor: "Inclinação",
  }];
}

// ---------- API pública ----------
export const recommendationsForOperation = (
  op: Operation,
  audience: RecAudience = "operador",
  options?: RiskEvaluationOptions,
) => recsForOperation(op, audience, options);

export function recommendationsForMachine(
  machineId: string,
  audience: RecAudience = "gestor",
  options?: RiskEvaluationOptions,
): GeneratedRecommendation[] {
  const op = currentOperationFor(machineId);
  if (!op) {
    const m = getMachine(machineId)!;
    return [{
      id: `${machineId}-idle`,
      title: "Equipamento sem operação ativa",
      description: "Aproveitar janela para inspeção e manutenção preventiva.",
      rationale: `Status atual: ${m.status}.`,
      category: "Manutenção",
      priority: "baixa",
      audience,
      factor: "Histórico operacional",
    }];
  }
  return recsForOperation(op, audience, options);
}

export function recommendationsForArea(
  areaId: string,
  audience: RecAudience = "gestor",
  options?: RiskEvaluationOptions,
): GeneratedRecommendation[] {
  const ops = operations.filter((o) => o.areaId === areaId);
  if (ops.length === 0) return [];
  const summary = scoreAreaWithWeights(areaId, options?.weights);
  const result = aggregateRiskResults(
    ops.map((operation) => riskResultForOperation(operation, options?.weights)),
    summary,
  );
  return result ? recommendationForResult(result, audience, `${areaId}-engine`) : [];
}

export function recommendationsForClient(
  clientId: string,
  audience: RecAudience = "consultor",
  options?: RiskEvaluationOptions,
): GeneratedRecommendation[] {
  const summary = scoreClientWithWeights(clientId, options?.weights);
  const ms = machines.filter((m) => m.clientId === clientId);
  const result = aggregateRiskResults(
    ms.map((machine) => riskResultForMachine(machine.id, options?.weights)),
    summary,
  );
  return result ? recommendationForResult(result, audience, `${clientId}-engine`) : [];
}

// ---------- Próxima melhor ação ----------
export interface NextBestAction {
  title: string;
  description: string;
  factor: string;
  priority: RecPriority;
  category: RecCategory;
}

export function nextBestActionForOperation(
  op: Operation,
  options?: RiskEvaluationOptions,
): NextBestAction {
  const [first] = recsForOperation(op, "operador", options);
  return {
    title: first.title,
    description: first.description,
    factor: first.factor,
    priority: first.priority,
    category: first.category,
  };
}

export function nextBestActionForMachine(
  machineId: string,
  options?: RiskEvaluationOptions,
): NextBestAction {
  const op = currentOperationFor(machineId);
  if (!op) {
    return {
      title: "Programar inspeção preventiva",
      description: "Equipamento sem operação ativa — janela ideal para checagem.",
      factor: "Histórico operacional",
      priority: "baixa",
      category: "Manutenção",
    };
  }
  return nextBestActionForOperation(op, options);
}

// ---------- Explicação narrativa (consultor) ----------
export function clientExplanation(clientId: string, options?: RiskEvaluationOptions): string {
  const c = getClient(clientId)!;
  const cs = scoreClientWithWeights(clientId, options?.weights);
  const recs = recommendationsForClient(clientId, "consultor", options);
  const top = recs[0];
  const actions = recs.slice(0, 3).map((r) => r.title.toLowerCase()).join("; ");
  return (
    `O cliente ${c.name} apresenta score médio ${cs.score}/100 (risco ${cs.level}), ` +
    `puxado principalmente por ${cs.topFactor.toLowerCase()}` +
    (cs.topAreaName ? `, com destaque para a área ${cs.topAreaName}` : "") + `. ` +
    (top
      ? `Para reduzir a chance de sinistro recomenda-se: ${actions}.`
      : `Operações dentro dos padrões esperados.`)
  );
}

// ---------- Agregadores para Admin ----------
export interface AdminRecRow {
  clientName: string;
  target: string;     // equipamento ou área
  targetType: "equipamento" | "área";
  score: number;
  level: RiskLevel;
  rec: GeneratedRecommendation;
}

export function allRecommendationsConsolidated(weights?: Partial<RiskWeights>): AdminRecRow[] {
  const rows: AdminRecRow[] = [];
  machines.forEach((m) => {
    const result = riskResultForMachine(m.id, weights);
    recommendationsForMachine(m.id, "admin", { weights, result }).forEach((rec) =>
      rows.push({
        clientName: m.client,
        target: m.code,
        targetType: "equipamento",
        score: result.finalScore,
        level: result.level,
        rec,
      }),
    );
  });
  areas.forEach((a) => {
    const s = scoreAreaWithWeights(a.id, weights);
    recommendationsForArea(a.id, "admin", { weights }).forEach((rec) =>
      rows.push({
        clientName: a.client,
        target: a.name,
        targetType: "área",
        score: s.score,
        level: s.level,
        rec,
      }),
    );
  });
  const order: Record<RecPriority, number> = { alta: 0, "média": 1, baixa: 2 };
  rows.sort((a, b) => order[a.rec.priority] - order[b.rec.priority] || b.score - a.score);
  return rows;
}

export function countByCategory(rows: AdminRecRow[]): Record<RecCategory, number> {
  const base: Record<RecCategory, number> = {
    "Rota": 0, "Horário": 0, "Inclinação": 0, "Operação": 0,
    "Manutenção": 0, "Treinamento": 0, "Atenção ambiental": 0, "Prevenção de sinistro": 0,
  };
  rows.forEach((r) => { base[r.rec.category] += 1; });
  return base;
}

export function countByPriority(rows: AdminRecRow[]): Record<RecPriority, number> {
  const base: Record<RecPriority, number> = { alta: 0, "média": 0, baixa: 0 };
  rows.forEach((r) => { base[r.rec.priority] += 1; });
  return base;
}

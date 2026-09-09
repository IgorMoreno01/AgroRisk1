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
  inclinationLabel,
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
export type RecAudience = "operador" | "gestor" | "consultor";

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

const priorityFromScore = (score: number): RecPriority =>
  score >= 71 ? "alta" : score >= 41 ? "média" : "baixa";

const bumpPriority = (p: RecPriority): RecPriority =>
  p === "alta" ? "alta" : p === "média" ? "alta" : "média";

const historyAlertCount = (machineId: string) =>
  alerts.filter((a) => a.machineId === machineId).length;

// ---------- Construtor de recomendações por fator ----------
function recsForOperation(
  op: Operation,
  audience: RecAudience,
  options?: RiskEvaluationOptions,
): GeneratedRecommendation[] {
  const result = options?.result ?? riskResultForOperation(op, options?.weights, options?.overrides);
  const b = result.breakdown;
  const inputs = inputsForOperationWithOverrides(op, options?.overrides);
  const baseP = priorityFromScore(result.finalScore);
  const candidates: GeneratedRecommendation[] = [];

  const push = (r: Omit<GeneratedRecommendation, "id" | "audience"> & Partial<Pick<GeneratedRecommendation, "id">>) => {
    candidates.push({
      id: r.id ?? `${op.id}-${candidates.length + 1}`,
      audience,
      ...r,
    } as GeneratedRecommendation);
  };

  // ---- Proximidade de água ----
  const waterPart = partByCategory(b, "Proximidade de água");
  if (waterPart && waterPart.points >= 16) {
    const p: RecPriority = inputs.waterDistance === "abaixo_50" ? "alta" : bumpPriority(baseP);
    push({
      title: "Alterar rota para evitar área próxima de água",
      description: audience === "operador"
        ? "Evite o trajeto atual e mantenha distância segura do corpo d'água."
        : audience === "consultor"
        ? "Recomendar ao cliente alterar a rota para se afastar do corpo d'água."
        : "Priorizar replanejamento de rota nas operações próximas à água.",
      rationale: `Distância da água: ${waterPart.detail.toLowerCase()} — risco elevado de atolamento e contaminação.`,
      category: "Rota",
      priority: p,
      factor: "Proximidade de água",
    });
  }

  // ---- Clima ----
  const climaPart = partByCategory(b, "Clima");
  if (climaPart && climaPart.points >= 14) {
    push({
      title: "Reagendar operação para janela climática melhor",
      description: audience === "operador"
        ? "Aguarde melhora das condições antes de continuar."
        : "Avaliar adiamento da operação enquanto a chuva persistir.",
      rationale: `Condição climática: ${climaPart.detail.toLowerCase()} — eleva o risco em campo aberto.`,
      category: "Horário",
      priority: result.level === "alto" ? "alta" : "média",
      factor: "Clima",
    });
  } else if (climaPart && climaPart.points >= 8) {
    push({
      title: "Atenção reforçada ao clima",
      description: "Monitorar a previsão e pausar a operação se a chuva intensificar.",
      rationale: `Clima atual: ${climaPart.detail.toLowerCase()}.`,
      category: "Atenção ambiental",
      priority: "média",
      factor: "Clima",
    });
  }

  // ---- Segurança operacional: inclinação medida pelo ESP32 + MPU6050 ----
  // Esta regra gera orientação sem participar do score ou de sua composição.
  const absoluteInclination = Math.abs(inputs.inclinationDegrees);
  if (absoluteInclination >= 5) {
    push({
      title: "Selecionar rota com menor inclinação",
      description: audience === "operador"
        ? "Interrompa o avanço e retome somente por um trecho com inclinação segura."
        : "Replanejar a rota para evitar trechos com inclinação acima do limite.",
      rationale: `Inclinação ${inclinationLabel(inputs.inclinationDegrees).toLowerCase()} medida pelo MPU6050 aumenta o risco de tombamento.`,
      category: "Inclinação",
      priority: absoluteInclination >= 15 ? "alta" : "média",
      factor: "Inclinação",
    });
  }

  // ---- Condição do terreno ----
  const terrenoPart = partByCategory(b, "Condição do terreno");
  if (terrenoPart && terrenoPart.points >= 4) {
    push({
      title: "Cuidado com solo crítico ou baixa aderência",
      description: audience === "operador"
        ? "Evite manobras bruscas e selecione rota alternativa se possível."
        : "Indicar rota alternativa e revisão das condições antes do próximo turno.",
      rationale: `Condição do terreno: ${terrenoPart.detail.toLowerCase()}.`,
      category: terrenoPart.points >= 8 ? "Rota" : "Atenção ambiental",
      priority: terrenoPart.points >= 8 ? bumpPriority(baseP) : "média",
      factor: "Condição do terreno",
    });
  }

  // ---- Tipo de operação ----
  const opPart = partByCategory(b, "Tipo de operação");
  if (op.type === "Operação próxima de água") {
    push({
      title: "Operação supervisionada próxima a corpos d'água",
      description: audience === "operador"
        ? "Mantenha atenção redobrada e interrompa em caso de instabilidade."
        : "Designar supervisão direta e checagem de rota.",
      rationale: "Operação classificada como crítica por proximidade direta de água.",
      category: "Operação",
      priority: "alta",
      factor: "Tipo de operação",
    });
  } else if (op.type === "Transporte" && opPart && opPart.points >= 10) {
    push({
      title: "Revisar trajeto e adotar condução preventiva",
      description: "Evite trechos críticos no deslocamento.",
      rationale: "Transporte exige planejamento de rota e condução defensiva.",
      category: "Rota",
      priority: baseP,
      factor: "Tipo de operação",
    });
  }

  // ---- Histórico operacional ----
  const histPart = partByCategory(b, "Histórico operacional");
  const histTotal = historyAlertCount(op.machineId);
  if ((histPart && histPart.points >= 10) || histTotal >= 2) {
    push({
      title: "Priorizar inspeção preventiva do equipamento",
      description: audience === "operador"
        ? "Notifique o gestor antes do próximo turno."
        : audience === "consultor"
        ? "Recomendar ao cliente manutenção preventiva e revisão do histórico."
        : "Programar inspeção e reforço de treinamento da equipe.",
      rationale: `Equipamento acumula ${histTotal} alerta(s) recente(s).`,
      category: histTotal >= 3 ? "Manutenção" : "Prevenção de sinistro",
      priority: result.level === "alto" ? "alta" : "média",
      factor: "Histórico operacional",
    });
  }

  // Caso de risco baixo: apenas uma recomendação preventiva leve
  if (candidates.length === 0) {
    push({
      title: "Manter operação dentro dos padrões",
      description: "Sem fatores críticos detectados no momento.",
      rationale: `Score atual ${result.finalScore}/100 — risco baixo.`,
      category: "Prevenção de sinistro",
      priority: "baixa",
      factor: b.mainFactor,
    });
  }

  // O componente predominante dá precedência às regras já existentes,
  // preservando o comportamento determinístico e explicando o cenário atual.
  if (result.dominantFactor !== "balanced") {
    candidates.forEach((candidate) => {
      const isClimateRule = candidate.factor === "Clima";
      if (
        (result.dominantFactor === "climate" && isClimateRule) ||
        (result.dominantFactor === "operational" && !isClimateRule)
      ) {
        candidate.priority = bumpPriority(candidate.priority);
      }
    });
  }

  // Ordena por prioridade (alta > média > baixa), depois por score do fator
  const order: Record<RecPriority, number> = { alta: 0, "média": 1, baixa: 2 };
  candidates.sort((a, b) => order[a.priority] - order[b.priority]);

  return candidates.slice(0, 3);
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
  // pega a operação de maior score na área
  const top = [...ops].sort(
    (a, b) => riskResultForOperation(b, options?.weights).finalScore - riskResultForOperation(a, options?.weights).finalScore,
  )[0];
  return recsForOperation(top, audience, options);
}

export function recommendationsForClient(
  clientId: string,
  audience: RecAudience = "consultor",
  options?: RiskEvaluationOptions,
): GeneratedRecommendation[] {
  const cs = scoreClientWithWeights(clientId, options?.weights);
  // Agrega: top 3 entre todas as máquinas do cliente
  const ms = machines.filter((m) => m.clientId === clientId);
  const all: GeneratedRecommendation[] = [];
  ms.forEach((m) => all.push(...recommendationsForMachine(m.id, audience, options)));
  // dedup por (title + factor)
  const seen = new Set<string>();
  const unique = all.filter((r) => {
    const k = `${r.title}::${r.factor}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const order: Record<RecPriority, number> = { alta: 0, "média": 1, baixa: 2 };
  unique.sort((a, b) => order[a.priority] - order[b.priority]);
  return unique.slice(0, 4);
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
    recommendationsForMachine(m.id, "gestor", { weights, result }).forEach((rec) =>
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
    recommendationsForArea(a.id, "gestor", { weights }).forEach((rec) =>
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

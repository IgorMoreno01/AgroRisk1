// ============================================================
// Sompo AgroRisk · Mock data central (Parte 2)
// Estrutura simulada e consistente entre entidades.
// Nada aqui calcula score real — valores são apenas demonstrativos.
// ============================================================

export type RiskLevel = "baixo" | "medio" | "alto";

export const riskFromScore = (score: number): RiskLevel =>
  score >= 71 ? "alto" : score >= 41 ? "medio" : "baixo";

// ---------- Tipos ----------
export type ProfileId = "gestor" | "operador" | "consultor" | "admin";

export interface Client {
  id: string;
  name: string;
  city: string;
  state: string;
  location: string; // "cidade / UF" (compat)
  mainOperation: string;
  machineCount: number;
  machines: number; // alias (compat)
  avgScore: number;
  level: RiskLevel;
}

export interface User {
  id: string;
  name: string;
  profile: ProfileId;
  clientId?: string;
  permissions: string[];
}

export type MachineStatus = "ativa" | "parada" | "em alerta" | "crítica";
export type MachineType = "Trator" | "Colheitadeira" | "Pulverizador" | "Caminhão de apoio" | "Plantadeira";

export interface Machine {
  id: string;
  code: string;
  name: string;
  model: string;
  type: MachineType;
  clientId: string;
  client: string;
  areaId: string;
  area: string;
  operatorId: string;
  operator: string;
  status: MachineStatus;
  score: number;
  level: RiskLevel;
  lastAlert: string;
  lastUpdate: string;
}

export type AreaType =
  | "Campo aberto"
  | "Área próxima de água"
  | "Transporte interno"
  | "Talhão com solo crítico"
  | "Área de acesso restrito";

export interface Area {
  id: string;
  name: string;
  clientId: string;
  client: string;
  type: AreaType;
  condition: string;
  nearWater: "baixa" | "média" | "alta";
  envRisk: RiskLevel;
  score: number;
  // compat com Parte 1
  crop: string;
  hectares: number;
}

export type OperationType =
  | "Trabalho no campo"
  | "Transporte"
  | "Operação próxima de água"
  | "Deslocamento interno"
  | "Pulverização"
  | "Colheita";

export type OperationStatus = "Em andamento" | "Concluída" | "Interrompida" | "Agendada";

export interface Operation {
  id: string;
  machineId: string;
  machine: string; // id (compat)
  operatorId: string;
  clientId: string;
  areaId: string;
  area: string; // nome (compat)
  type: OperationType;
  scheduledAt: string;
  start: string; // compat
  duration: string;
  status: OperationStatus;
  score: number;
  factors: string[]; // ids de RiskFactor
  recommendationId: string;
}

export type AlertCriticality = "baixa" | "média" | "alta";
export type AlertStatus = "aberto" | "em análise" | "resolvido";

export interface Alert {
  id: string;
  machineId: string;
  machine: string; // id (compat)
  operationId: string;
  type: string;
  criticality: AlertCriticality;
  level: RiskLevel; // compat com Parte 1
  message: string;
  mainFactor: string; // id de RiskFactor
  status: AlertStatus;
  datetime: string;
  time: string; // compat
}

export interface RiskFactor {
  id: string;
  name: string;
  category:
    | "Clima"
    | "Proximidade de água"
    | "Tipo de operação"
    | "Histórico operacional"
    | "Velocidade/rota"
    | "Condição do terreno";
  weight: number; // 0..100 (simulado)
  description: string;
  impact: RiskLevel;
}

export interface Recommendation {
  id: string;
  riskType: string;
  text: string;
  rationale: string;
  audience: ProfileId; // operador | gestor | consultor
}

export interface HistoryEntry {
  id: string;
  date: string;
  machineId: string;
  operationId: string;
  summary: string;
  score: number;
}

// ---------- Clientes / Fazendas ----------
export const clients: Client[] = [
  {
    id: "CL-01",
    name: "Fazenda Santa Clara",
    city: "Sorriso",
    state: "MT",
    location: "Sorriso / MT",
    mainOperation: "Soja e milho",
    machineCount: 3,
    machines: 3,
    avgScore: 72,
    level: "alto",
  },
  {
    id: "CL-02",
    name: "Agro Vale Norte",
    city: "Cascavel",
    state: "PR",
    location: "Cascavel / PR",
    mainOperation: "Soja",
    machineCount: 3,
    machines: 3,
    avgScore: 52,
    level: "medio",
  },
  {
    id: "CL-03",
    name: "Grupo Terra Forte",
    city: "Rio Verde",
    state: "GO",
    location: "Rio Verde / GO",
    mainOperation: "Algodão",
    machineCount: 2,
    machines: 2,
    avgScore: 34,
    level: "baixo",
  },
];

// ---------- Usuários ----------
export const users: User[] = [
  { id: "USR-G-1",  name: "Ana Carolina",   profile: "gestor",    clientId: "CL-01", permissions: ["dashboard.read", "fleet.read", "alerts.read"] },
  { id: "USR-G-2",  name: "Roberto Tavares", profile: "gestor",   clientId: "CL-02", permissions: ["dashboard.read", "fleet.read", "alerts.read"] },
  { id: "USR-OP-1", name: "Carlos Mendes",   profile: "operador", clientId: "CL-01", permissions: ["operation.read", "machine.read"] },
  { id: "USR-OP-2", name: "Júlia Ferreira",  profile: "operador", clientId: "CL-01", permissions: ["operation.read", "machine.read"] },
  { id: "USR-OP-3", name: "Rafael Souza",    profile: "operador", clientId: "CL-01", permissions: ["operation.read", "machine.read"] },
  { id: "USR-OP-4", name: "Pedro Lima",      profile: "operador", clientId: "CL-02", permissions: ["operation.read", "machine.read"] },
  { id: "USR-OP-5", name: "Bruno Alves",     profile: "operador", clientId: "CL-02", permissions: ["operation.read", "machine.read"] },
  { id: "USR-OP-6", name: "Tiago Rocha",     profile: "operador", clientId: "CL-02", permissions: ["operation.read", "machine.read"] },
  { id: "USR-OP-7", name: "Marcos Vieira",   profile: "operador", clientId: "CL-03", permissions: ["operation.read", "machine.read"] },
  { id: "USR-OP-8", name: "Lucas Pinheiro",  profile: "operador", clientId: "CL-03", permissions: ["operation.read", "machine.read"] },
  { id: "USR-C-1",  name: "Marina Lopes",    profile: "consultor", permissions: ["client.read", "advisory.read"] },
  { id: "USR-A-1",  name: "Sompo Admin",     profile: "admin",     permissions: ["*"] },
];

// ---------- Áreas ----------
export const areas: Area[] = [
  { id: "AR-01", name: "Talhão Norte",     clientId: "CL-01", client: "Fazenda Santa Clara", type: "Campo aberto",            condition: "Solo úmido",   nearWater: "média", envRisk: "medio", score: 65, crop: "Soja",    hectares: 340 },
  { id: "AR-02", name: "Talhão Sul",       clientId: "CL-01", client: "Fazenda Santa Clara", type: "Área próxima de água",    condition: "Encharcado",   nearWater: "alta",  envRisk: "alto",  score: 82, crop: "Milho",   hectares: 220 },
  { id: "AR-03", name: "Talhão Leste",     clientId: "CL-02", client: "Agro Vale Norte",     type: "Campo aberto",            condition: "Seco",         nearWater: "baixa", envRisk: "medio", score: 55, crop: "Soja",    hectares: 410 },
  { id: "AR-04", name: "Setor Oeste",      clientId: "CL-02", client: "Agro Vale Norte",     type: "Talhão com solo crítico", condition: "Solo arenoso", nearWater: "baixa", envRisk: "medio", score: 48, crop: "Soja",    hectares: 180 },
  { id: "AR-05", name: "Pátio Central",    clientId: "CL-03", client: "Grupo Terra Forte",   type: "Transporte interno",      condition: "Pavimentado",  nearWater: "baixa", envRisk: "baixo", score: 28, crop: "Algodão", hectares: 90  },
];

// ---------- Máquinas ----------
export const machines: Machine[] = [
  { id: "MQ-001", code: "MQ-001", name: "Trator John Deere 6110J",          model: "6110J",        type: "Trator",          clientId: "CL-01", client: "Fazenda Santa Clara", areaId: "AR-01", area: "Talhão Norte",  operatorId: "USR-OP-1", operator: "Carlos Mendes",   status: "em alerta", score: 100, level: "alto", lastAlert: "Velocidade acima do recomendado", lastUpdate: "há 8 min" },
  { id: "MQ-002", code: "MQ-002", name: "Colheitadeira CR7.90",             model: "CR7.90",       type: "Colheitadeira",   clientId: "CL-01", client: "Fazenda Santa Clara", areaId: "AR-02", area: "Talhão Sul",    operatorId: "USR-OP-2", operator: "Júlia Ferreira",  status: "ativa",     score: 74, level: "alto",  lastAlert: "Proximidade de corpo d'água",    lastUpdate: "há 12 min" },
  { id: "MQ-003", code: "MQ-003", name: "Pulverizador Jacto Uniport",       model: "Uniport 3030", type: "Pulverizador",    clientId: "CL-01", client: "Fazenda Santa Clara", areaId: "AR-01", area: "Talhão Norte",  operatorId: "USR-OP-3", operator: "Rafael Souza",    status: "ativa",     score: 61, level: "medio", lastAlert: "Vento aumentando",                lastUpdate: "há 22 min" },
  { id: "MQ-004", code: "MQ-004", name: "Trator Massey 7415",               model: "7415",         type: "Trator",          clientId: "CL-02", client: "Agro Vale Norte",     areaId: "AR-03", area: "Talhão Leste",  operatorId: "USR-OP-4", operator: "Pedro Lima",      status: "ativa",     score: 55, level: "medio", lastAlert: "Manutenção próxima do prazo",     lastUpdate: "há 35 min" },
  { id: "MQ-005", code: "MQ-005", name: "Plantadeira Stara Estrela",        model: "Estrela 32",   type: "Plantadeira",     clientId: "CL-02", client: "Agro Vale Norte",     areaId: "AR-04", area: "Setor Oeste",   operatorId: "USR-OP-5", operator: "Bruno Alves",     status: "parada",    score: 42, level: "medio", lastAlert: "Aguardando reposição de insumo",  lastUpdate: "há 1h" },
  { id: "MQ-006", code: "MQ-006", name: "Caminhão Volvo VM 270",            model: "VM 270",       type: "Caminhão de apoio", clientId: "CL-02", client: "Agro Vale Norte",  areaId: "AR-03", area: "Talhão Leste",  operatorId: "USR-OP-6", operator: "Tiago Rocha",     status: "ativa",     score: 58, level: "medio", lastAlert: "Rota em deslocamento longo",      lastUpdate: "há 18 min" },
  { id: "MQ-007", code: "MQ-007", name: "Colheitadeira New Holland TC5.30", model: "TC5.30",       type: "Colheitadeira",   clientId: "CL-03", client: "Grupo Terra Forte",   areaId: "AR-05", area: "Pátio Central", operatorId: "USR-OP-7", operator: "Marcos Vieira",   status: "ativa",     score: 38, level: "baixo", lastAlert: "—",                                lastUpdate: "há 5 min" },
  { id: "MQ-008", code: "MQ-008", name: "Trator Valtra A750",               model: "A750",         type: "Trator",          clientId: "CL-03", client: "Grupo Terra Forte",   areaId: "AR-05", area: "Pátio Central", operatorId: "USR-OP-8", operator: "Lucas Pinheiro",  status: "parada",    score: 30, level: "baixo", lastAlert: "—",                                lastUpdate: "há 2h" },
];

// ---------- Fatores de risco ----------
export const riskFactors: RiskFactor[] = [
  { id: "RF-01", name: "Chuva e clima adverso",            category: "Clima",                   weight: 20, description: "Precipitação ou vento elevam risco de operação.",     impact: "alto"  },
  { id: "RF-02", name: "Operação próxima a corpos d'água", category: "Proximidade de água",     weight: 18, description: "Aumenta risco de atolamento e contaminação.",          impact: "alto"  },
  { id: "RF-03", name: "Tipo de operação crítica",         category: "Tipo de operação",        weight: 15, description: "Pulverização e transporte agregam mais risco.",        impact: "medio" },
  { id: "RF-04", name: "Histórico recente de incidente",   category: "Histórico operacional",   weight: 12, description: "Equipamento ou área com ocorrências recentes.",        impact: "medio" },
  { id: "RF-05", name: "Velocidade ou rota inadequada",    category: "Velocidade/rota",         weight: 20, description: "Velocidade incompatível com condição do terreno.",     impact: "alto"  },
  { id: "RF-06", name: "Condição crítica do terreno",      category: "Condição do terreno",     weight: 15, description: "Solo encharcado, arenoso ou irregular.",               impact: "medio" },
];

// ---------- Recomendações ----------
export const recommendations: Recommendation[] = [
  { id: "RC-01", riskType: "Velocidade/rota",     text: "Reduzir velocidade para no máximo 6 km/h no trecho atual.",             rationale: "Solo úmido reduz aderência e aumenta risco de tombamento.", audience: "operador" },
  { id: "RC-02", riskType: "Proximidade de água", text: "Evitar rota próxima ao curso d'água a leste do talhão.",                 rationale: "Risco de atolamento e contaminação ambiental.",            audience: "operador" },
  { id: "RC-03", riskType: "Clima",               text: "Reagendar operação para horário com menor probabilidade de chuva.",     rationale: "Janela climática melhora nas próximas 2h.",                 audience: "operador" },
  { id: "RC-04", riskType: "Histórico operacional", text: "Priorizar inspeção preventiva do equipamento antes do próximo turno.", rationale: "Manutenção atrasada eleva chance de falha em campo.",       audience: "gestor" },
  { id: "RC-05", riskType: "Tipo de operação",    text: "Reforçar treinamento da equipe em áreas de risco classificado como alto.", rationale: "Operadores treinados reduzem incidência de sinistros.",   audience: "consultor" },
  { id: "RC-06", riskType: "Condição do terreno", text: "Reavaliar plano de safra para talhões com solo crítico.",                rationale: "Mitiga perdas e ajusta cobertura recomendada.",              audience: "consultor" },
];

// ---------- Operações ----------
export const operations: Operation[] = [
  { id: "OP-1001", machineId: "MQ-001", machine: "MQ-001", operatorId: "USR-OP-1", clientId: "CL-01", areaId: "AR-01", area: "Talhão Norte",  type: "Trabalho no campo",       scheduledAt: "07:12", start: "07:12", duration: "3h 42m", status: "Em andamento", score: 100, factors: ["RF-05", "RF-06"], recommendationId: "RC-01" },
  { id: "OP-1002", machineId: "MQ-002", machine: "MQ-002", operatorId: "USR-OP-2", clientId: "CL-01", areaId: "AR-02", area: "Talhão Sul",    type: "Colheita",                scheduledAt: "06:45", start: "06:45", duration: "4h 10m", status: "Em andamento", score: 74, factors: ["RF-02", "RF-01"], recommendationId: "RC-02" },
  { id: "OP-1003", machineId: "MQ-003", machine: "MQ-003", operatorId: "USR-OP-3", clientId: "CL-01", areaId: "AR-01", area: "Talhão Norte",  type: "Pulverização",            scheduledAt: "08:00", start: "08:00", duration: "2h 15m", status: "Em andamento", score: 61, factors: ["RF-03", "RF-01"], recommendationId: "RC-03" },
  { id: "OP-1004", machineId: "MQ-004", machine: "MQ-004", operatorId: "USR-OP-4", clientId: "CL-02", areaId: "AR-03", area: "Talhão Leste",  type: "Trabalho no campo",       scheduledAt: "07:30", start: "07:30", duration: "3h 05m", status: "Em andamento", score: 55, factors: ["RF-06"],           recommendationId: "RC-06" },
  { id: "OP-1005", machineId: "MQ-006", machine: "MQ-006", operatorId: "USR-OP-6", clientId: "CL-02", areaId: "AR-03", area: "Talhão Leste",  type: "Transporte",              scheduledAt: "09:15", start: "09:15", duration: "1h 40m", status: "Em andamento", score: 58, factors: ["RF-05"],           recommendationId: "RC-01" },
  { id: "OP-1006", machineId: "MQ-005", machine: "MQ-005", operatorId: "USR-OP-5", clientId: "CL-02", areaId: "AR-04", area: "Setor Oeste",   type: "Trabalho no campo",       scheduledAt: "Ontem", start: "Ontem", duration: "5h 20m", status: "Concluída",    score: 42, factors: ["RF-06"],           recommendationId: "RC-06" },
  { id: "OP-1007", machineId: "MQ-007", machine: "MQ-007", operatorId: "USR-OP-7", clientId: "CL-03", areaId: "AR-05", area: "Pátio Central", type: "Deslocamento interno",    scheduledAt: "08:30", start: "08:30", duration: "0h 45m", status: "Em andamento", score: 38, factors: [],                  recommendationId: "RC-04" },
  { id: "OP-1008", machineId: "MQ-002", machine: "MQ-002", operatorId: "USR-OP-2", clientId: "CL-01", areaId: "AR-02", area: "Talhão Sul",    type: "Operação próxima de água", scheduledAt: "Ontem", start: "Ontem", duration: "6h 30m", status: "Concluída",    score: 71, factors: ["RF-02"],           recommendationId: "RC-02" },
  { id: "OP-1009", machineId: "MQ-001", machine: "MQ-001", operatorId: "USR-OP-1", clientId: "CL-01", areaId: "AR-01", area: "Talhão Norte",  type: "Trabalho no campo",       scheduledAt: "Ontem", start: "Ontem", duration: "1h 05m", status: "Interrompida", score: 88, factors: ["RF-05", "RF-01"], recommendationId: "RC-03" },
  { id: "OP-1010", machineId: "MQ-008", machine: "MQ-008", operatorId: "USR-OP-8", clientId: "CL-03", areaId: "AR-05", area: "Pátio Central", type: "Deslocamento interno",    scheduledAt: "2 dias", start: "2 dias", duration: "0h 30m", status: "Concluída",   score: 30, factors: [],                  recommendationId: "RC-04" },
  { id: "OP-1011", machineId: "MQ-003", machine: "MQ-003", operatorId: "USR-OP-3", clientId: "CL-01", areaId: "AR-01", area: "Talhão Norte",  type: "Pulverização",            scheduledAt: "2 dias", start: "2 dias", duration: "3h 50m", status: "Concluída",   score: 49, factors: ["RF-03"],           recommendationId: "RC-05" },
  { id: "OP-1012", machineId: "MQ-004", machine: "MQ-004", operatorId: "USR-OP-4", clientId: "CL-02", areaId: "AR-03", area: "Talhão Leste",  type: "Trabalho no campo",       scheduledAt: "Amanhã", start: "Amanhã", duration: "—",   status: "Agendada",     score: 50, factors: ["RF-06"],           recommendationId: "RC-06" },
];

// ---------- Alertas ----------
export const alerts: Alert[] = [
  { id: "AL-01", machineId: "MQ-001", machine: "MQ-001", operationId: "OP-1001", type: "Velocidade acima do recomendado", criticality: "alta",  level: "alto",  message: "Velocidade acima do recomendado em terreno úmido.",       mainFactor: "RF-05", status: "aberto",     datetime: "2026-06-16 09:20", time: "há 8 min" },
  { id: "AL-02", machineId: "MQ-002", machine: "MQ-002", operationId: "OP-1002", type: "Proximidade de água",             criticality: "alta",  level: "alto",  message: "Rota próxima a corpo d'água — risco de atolamento.",      mainFactor: "RF-02", status: "em análise", datetime: "2026-06-16 09:06", time: "há 22 min" },
  { id: "AL-03", machineId: "MQ-003", machine: "MQ-003", operationId: "OP-1003", type: "Chuva prevista",                  criticality: "média", level: "medio", message: "Vento aumentando — atenção em pulverização.",             mainFactor: "RF-01", status: "aberto",     datetime: "2026-06-16 08:53", time: "há 35 min" },
  { id: "AL-04", machineId: "MQ-003", machine: "MQ-003", operationId: "OP-1003", type: "Histórico de incidente",          criticality: "média", level: "medio", message: "Manutenção preventiva próxima do vencimento.",            mainFactor: "RF-04", status: "aberto",     datetime: "2026-06-16 08:28", time: "há 1h" },
  { id: "AL-05", machineId: "MQ-004", machine: "MQ-004", operationId: "OP-1004", type: "Solo crítico",                    criticality: "média", level: "medio", message: "Solo com baixa estabilidade no setor norte do talhão.",  mainFactor: "RF-06", status: "em análise", datetime: "2026-06-16 08:10", time: "há 1h 18m" },
  { id: "AL-06", machineId: "MQ-006", machine: "MQ-006", operationId: "OP-1005", type: "Operação em área crítica",        criticality: "alta",  level: "alto",  message: "Trajeto cruza área de acesso restrito.",                  mainFactor: "RF-03", status: "aberto",     datetime: "2026-06-16 07:55", time: "há 1h 33m" },
  { id: "AL-07", machineId: "MQ-002", machine: "MQ-002", operationId: "OP-1008", type: "Proximidade de água",             criticality: "alta",  level: "alto",  message: "Operação anterior registrou alagamento parcial.",         mainFactor: "RF-02", status: "resolvido",  datetime: "2026-06-15 17:42", time: "ontem" },
  { id: "AL-08", machineId: "MQ-001", machine: "MQ-001", operationId: "OP-1009", type: "Velocidade acima do recomendado", criticality: "alta",  level: "alto",  message: "Operação interrompida por excesso de velocidade.",        mainFactor: "RF-05", status: "resolvido",  datetime: "2026-06-15 14:11", time: "ontem" },
  { id: "AL-09", machineId: "MQ-005", machine: "MQ-005", operationId: "OP-1006", type: "Solo crítico",                    criticality: "baixa", level: "medio", message: "Solo arenoso identificado no Setor Oeste.",               mainFactor: "RF-06", status: "resolvido",  datetime: "2026-06-15 11:30", time: "ontem" },
  { id: "AL-10", machineId: "MQ-007", machine: "MQ-007", operationId: "OP-1007", type: "Chuva prevista",                  criticality: "baixa", level: "baixo", message: "Previsão de chuva leve no fim da tarde.",                mainFactor: "RF-01", status: "aberto",     datetime: "2026-06-16 09:00", time: "há 30 min" },
];

// ---------- Histórico operacional ----------
export const operationHistory: HistoryEntry[] = [
  { id: "HX-01", date: "2026-06-15", machineId: "MQ-001", operationId: "OP-1009", summary: "Operação interrompida por velocidade alta", score: 88 },
  { id: "HX-02", date: "2026-06-15", machineId: "MQ-002", operationId: "OP-1008", summary: "Colheita concluída próximo a corpo d'água", score: 71 },
  { id: "HX-03", date: "2026-06-15", machineId: "MQ-005", operationId: "OP-1006", summary: "Plantio concluído em solo arenoso",          score: 42 },
  { id: "HX-04", date: "2026-06-14", machineId: "MQ-003", operationId: "OP-1011", summary: "Pulverização concluída sem ocorrências",     score: 49 },
  { id: "HX-05", date: "2026-06-14", machineId: "MQ-008", operationId: "OP-1010", summary: "Deslocamento interno concluído",             score: 30 },
];

// ---------- Tendência geral (compat) ----------
export const riskTrend = [62, 58, 65, 71, 68, 74, 66];

// ---------- Perfis (navegação inicial) ----------
export const profiles = [
  { id: "gestor",    label: "Gestor",               description: "Visão consolidada da frota, risco e operações",       path: "/gestor" },
  { id: "operador",  label: "Operador",             description: "Status da operação atual e recomendações",            path: "/operador" },
  { id: "consultor", label: "Consultor / Corretor", description: "Análise por cliente e fatores de risco",              path: "/consultor" },
  { id: "admin",     label: "Admin / Sompo",        description: "Catálogos: máquinas, clientes, áreas e operações",    path: "/admin" },
] as const;

// ---------- Helpers ----------
export const getClient = (id?: string) => clients.find((c) => c.id === id);
export const getMachine = (id?: string) => machines.find((m) => m.id === id);
export const getArea = (id?: string) => areas.find((a) => a.id === id);
export const getOperator = (id?: string) => users.find((u) => u.id === id);
export const getOperation = (id?: string) => operations.find((o) => o.id === id);
export const getFactor = (id?: string) => riskFactors.find((f) => f.id === id);
export const getRecommendation = (id?: string) => recommendations.find((r) => r.id === id);

export const machinesByClient = (clientId: string) => machines.filter((m) => m.clientId === clientId);
export const operationsByOperator = (operatorId: string) => operations.filter((o) => o.operatorId === operatorId);
export const alertsByMachine = (machineId: string) => alerts.filter((a) => a.machineId === machineId);
export const recommendationsFor = (audience: ProfileId) => recommendations.filter((r) => r.audience === audience);

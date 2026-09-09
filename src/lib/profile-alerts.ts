// ============================================================
// Sompo AgroRisk · Alertas simulados por perfil
// Cada perfil enxerga uma lista coerente com sua função.
// ============================================================
import type { AlertCriticality, AlertStatus, ProfileId } from "@/lib/mock-data";

export interface ProfileAlert {
  id: string;
  title: string;
  context: string; // equipamento, área, cliente, etc.
  detail: string;
  criticality: AlertCriticality;
  status: AlertStatus;
  time: string;
}

export interface ProfileAlertsBundle {
  sectionId: string;
  sectionTitle: string;
  sectionDescription: string;
  alerts: ProfileAlert[];
}

// ---------------- Operador (visão restrita à própria operação) ----------------
const operadorAlerts: ProfileAlert[] = [
  {
    id: "OPA-01",
    title: "Inclinação acima do limite seguro",
    context: "TR-001 · Operação OP-1001",
    detail: "MPU6050 detectou inclinação crítica; selecione uma rota mais segura.",
    criticality: "alta",
    status: "aberto",
    time: "há 8 min",
  },
  {
    id: "OPA-02",
    title: "Proximidade de água",
    context: "Talhão Norte",
    detail: "Distância entre 50m e 100m do corpo d'água mais próximo.",
    criticality: "alta",
    status: "em análise",
    time: "há 18 min",
  },
  {
    id: "OPA-03",
    title: "Recomendação pendente",
    context: "Próxima ação: alterar rota",
    detail: "A recomendação “Alterar rota” ainda não foi confirmada.",
    criticality: "média",
    status: "aberto",
    time: "há 25 min",
  },
  {
    id: "OPA-04",
    title: "Solo com baixa aderência",
    context: "Talhão Norte",
    detail: "Última leitura indica solo úmido na faixa de operação.",
    criticality: "média",
    status: "em análise",
    time: "há 41 min",
  },
  {
    id: "OPA-05",
    title: "Score da operação atualizado",
    context: "Operação OP-1001",
    detail: "Score subiu para 82 após mudança de condição de terreno.",
    criticality: "baixa",
    status: "resolvido",
    time: "há 1h",
  },
];

// ---------------- Gestor (visão gerencial da fazenda) ----------------
const gestorAlerts: ProfileAlert[] = [
  {
    id: "GA-01",
    title: "Equipamento em risco alto",
    context: "TR-001 · Fazenda Santa Clara",
    detail: "Entrou no grupo de prioridade alta no ranking de equipamentos.",
    criticality: "alta",
    status: "aberto",
    time: "há 12 min",
  },
  {
    id: "GA-02",
    title: "Área crítica identificada",
    context: "Talhão Sul",
    detail: "Aumento no score médio de risco da área nas últimas 24h.",
    criticality: "média",
    status: "em análise",
    time: "há 30 min",
  },
  {
    id: "GA-03",
    title: "Ação preventiva recomendada",
    context: "Equipamentos do Talhão Sul",
    detail: "Priorizar inspeção preventiva antes do próximo turno.",
    criticality: "média",
    status: "aberto",
    time: "há 45 min",
  },
  {
    id: "GA-04",
    title: "Ranking alterado",
    context: "Ranking por equipamento",
    detail: "CR7.90 subiu duas posições no ranking de risco.",
    criticality: "média",
    status: "aberto",
    time: "há 1h",
  },
  {
    id: "GA-05",
    title: "Histórico recorrente de alerta",
    context: "TR-001",
    detail: "Mesmo equipamento gerou 3 alertas nas últimas 48h.",
    criticality: "alta",
    status: "em análise",
    time: "há 2h",
  },
  {
    id: "GA-06",
    title: "Múltiplas operações em risco",
    context: "Talhão Sul",
    detail: "2 operações ativas estão com score ≥ 70.",
    criticality: "média",
    status: "aberto",
    time: "há 3h",
  },
];

// ---------------- Consultor/Corretor (visão consultiva por cliente) ----------------
const consultorAlerts: ProfileAlert[] = [
  {
    id: "CA-01",
    title: "Cliente com risco em atenção",
    context: "Fazenda Santa Clara",
    detail: "Score médio 72 — fator dominante: proximidade de água.",
    criticality: "média",
    status: "aberto",
    time: "há 20 min",
  },
  {
    id: "CA-02",
    title: "Área crítica para acompanhamento",
    context: "Talhão Sul · Fazenda Santa Clara",
    detail: "Concentra o maior score de risco do cliente.",
    criticality: "média",
    status: "em análise",
    time: "há 40 min",
  },
  {
    id: "CA-03",
    title: "Recomendação preventiva disponível",
    context: "Fazenda Santa Clara",
    detail: "Orientar cliente sobre rotas próximas de água e solo úmido.",
    criticality: "baixa",
    status: "aberto",
    time: "há 1h",
  },
  {
    id: "CA-04",
    title: "Fator de risco recorrente",
    context: "Carteira (3 clientes)",
    detail: "Proximidade de água aparece em 2 dos 3 clientes da carteira.",
    criticality: "média",
    status: "em análise",
    time: "há 2h",
  },
  {
    id: "CA-05",
    title: "Equipamento relevante para conversa",
    context: "TR-001 · Fazenda Santa Clara",
    detail: "Equipamento com score 82 — ponto de atenção na reunião.",
    criticality: "baixa",
    status: "aberto",
    time: "há 3h",
  },
];

// ---------------- Admin/Sompo (visão consolidada do sistema) ----------------
const adminAlerts: ProfileAlert[] = [
  {
    id: "AA-01",
    title: "Alertas críticos no sistema",
    context: "Plataforma · 3 clientes",
    detail: "7 alertas críticos distribuídos entre os clientes simulados.",
    criticality: "alta",
    status: "aberto",
    time: "há 5 min",
  },
  {
    id: "AA-02",
    title: "Cliente com maior exposição",
    context: "Fazenda Santa Clara",
    detail: "Maior score médio entre os clientes da base.",
    criticality: "média",
    status: "em análise",
    time: "há 15 min",
  },
  {
    id: "AA-03",
    title: "Máquinas em risco alto",
    context: "Frota consolidada",
    detail: "3 equipamentos com score ≥ 70 em operação agora.",
    criticality: "alta",
    status: "aberto",
    time: "há 25 min",
  },
  {
    id: "AA-04",
    title: "Recomendações pendentes",
    context: "Todos os perfis",
    detail: "5 recomendações ainda não foram confirmadas pelos usuários.",
    criticality: "média",
    status: "aberto",
    time: "há 40 min",
  },
  {
    id: "AA-05",
    title: "Áreas críticas por cliente",
    context: "2 clientes",
    detail: "Talhão Sul e Talhão Leste concentram a maior parte do risco.",
    criticality: "média",
    status: "em análise",
    time: "há 1h",
  },
  {
    id: "AA-06",
    title: "Alertas sem tratamento",
    context: "Operacional",
    detail: "4 alertas continuam abertos há mais de 2h.",
    criticality: "alta",
    status: "aberto",
    time: "há 1h 30m",
  },
  {
    id: "AA-07",
    title: "Inconsistência simulada nos dados",
    context: "Operação OP-1009",
    detail: "Score 88 com status 'Interrompida' — verificar consistência.",
    criticality: "baixa",
    status: "em análise",
    time: "há 2h",
  },
  {
    id: "AA-08",
    title: "Visão consolidada de risco",
    context: "Plataforma",
    detail: "Score médio global da frota está em 56 (faixa média).",
    criticality: "baixa",
    status: "aberto",
    time: "há 3h",
  },
  {
    id: "AA-09",
    title: "Cobertura de monitoramento",
    context: "8 equipamentos · 5 áreas",
    detail: "Todos os equipamentos simulados estão sendo monitorados.",
    criticality: "baixa",
    status: "resolvido",
    time: "há 4h",
  },
  {
    id: "AA-10",
    title: "Novo alerta de proximidade de água",
    context: "MQ-002 · Talhão Sul",
    detail: "Disparado automaticamente em operação ativa.",
    criticality: "alta",
    status: "em análise",
    time: "há 4h 30m",
  },
  {
    id: "AA-11",
    title: "Recomendação consolidada",
    context: "Consultor / Corretor",
    detail: "2 novas recomendações preventivas geradas hoje.",
    criticality: "média",
    status: "aberto",
    time: "há 5h",
  },
  {
    id: "AA-12",
    title: "Tendência semanal",
    context: "Plataforma",
    detail: "Score médio subiu 4 pontos em relação à semana anterior.",
    criticality: "média",
    status: "aberto",
    time: "ontem",
  },
];

export const PROFILE_ALERTS: Record<ProfileId, ProfileAlertsBundle> = {
  operador: {
    sectionId: "alertas-operacao",
    sectionTitle: "Alertas da operação",
    sectionDescription: "Alertas relacionados à sua operação atual",
    alerts: operadorAlerts,
  },
  gestor: {
    sectionId: "alertas-gerenciais",
    sectionTitle: "Alertas gerenciais",
    sectionDescription: "Equipamentos, áreas e priorização da fazenda",
    alerts: gestorAlerts,
  },
  consultor: {
    sectionId: "alertas-cliente",
    sectionTitle: "Alertas do cliente",
    sectionDescription: "Sinais consultivos para apoio ao cliente",
    alerts: consultorAlerts,
  },
  admin: {
    sectionId: "central-alertas",
    sectionTitle: "Central de alertas",
    sectionDescription: "Visão consolidada de todos os alertas do sistema",
    alerts: adminAlerts,
  },
};

export const getProfileAlerts = (profile: ProfileId): ProfileAlertsBundle =>
  PROFILE_ALERTS[profile];

export const pendingCount = (alerts: ProfileAlert[], readIds: Set<string>) =>
  alerts.filter((a) => a.status !== "resolvido" && !readIds.has(a.id)).length;

import { z } from "zod";
import type {
  Alert,
  Area,
  Client,
  HistoryEntry,
  Machine,
  Operation,
} from "../mock-data";

const riskLevel = z.enum(["baixo", "medio", "alto"]);

const clientRow = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string().length(2),
  location: z.string(),
  mainOperation: z.string(),
  machineCount: z.number().int().nonnegative(),
  machines: z.number().int().nonnegative(),
  avgScore: z.number().int().min(0).max(100),
  level: riskLevel,
});

const areaRow = z.object({
  id: z.string(),
  name: z.string(),
  clientId: z.string(),
  client: z.string(),
  type: z.enum(["Campo aberto", "Área próxima de água", "Transporte interno", "Talhão com solo crítico", "Área de acesso restrito"]),
  condition: z.string(),
  nearWater: z.enum(["baixa", "média", "alta"]),
  envRisk: riskLevel,
  score: z.number().int().min(0).max(100),
  crop: z.string(),
  hectares: z.number().nonnegative(),
});

const machineRow = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  model: z.string(),
  type: z.enum(["Trator", "Colheitadeira", "Pulverizador", "Caminhão de apoio", "Plantadeira"]),
  clientId: z.string(),
  client: z.string(),
  areaId: z.string(),
  area: z.string(),
  operatorId: z.string(),
  operator: z.string(),
  status: z.enum(["ativa", "parada", "em alerta", "crítica"]),
  score: z.number().int().min(0).max(100),
  level: riskLevel,
  lastAlert: z.string(),
  lastUpdate: z.string(),
});

const operationRow = z.object({
  id: z.string(),
  machineId: z.string(),
  machine: z.string(),
  operatorId: z.string(),
  clientId: z.string(),
  areaId: z.string(),
  area: z.string(),
  type: z.enum(["Trabalho no campo", "Transporte", "Operação próxima de água", "Deslocamento interno", "Pulverização", "Colheita"]),
  scheduledAt: z.string(),
  start: z.string(),
  duration: z.string(),
  status: z.enum(["Em andamento", "Concluída", "Interrompida", "Agendada"]),
  score: z.number().int().min(0).max(100),
  factors: z.array(z.string()),
  recommendationId: z.string(),
});

const alertRow = z.object({
  id: z.string(),
  machineId: z.string(),
  machine: z.string(),
  operationId: z.string(),
  type: z.string(),
  criticality: z.enum(["baixa", "média", "alta"]),
  level: riskLevel,
  message: z.string(),
  mainFactor: z.string(),
  status: z.enum(["aberto", "em análise", "resolvido"]),
  datetime: z.string(),
  time: z.string(),
});

const historyRow = z.object({
  id: z.string(),
  date: z.string(),
  machineId: z.string(),
  operationId: z.string(),
  summary: z.string(),
  score: z.number().int().min(0).max(100),
});

export const parseClients = (rows: unknown[]): Client[] => clientRow.array().parse(rows);
export const parseAreas = (rows: unknown[]): Area[] => areaRow.array().parse(rows);
export const parseMachines = (rows: unknown[]): Machine[] => machineRow.array().parse(rows);
export const parseOperations = (rows: unknown[]): Operation[] => operationRow.array().parse(rows);
export const parseAlerts = (rows: unknown[]): Alert[] => alertRow.array().parse(rows);
export const parseHistory = (rows: unknown[]): HistoryEntry[] => historyRow.array().parse(rows);
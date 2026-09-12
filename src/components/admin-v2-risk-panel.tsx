import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/app-layout";
import { RecommendationCard } from "@/components/recommendation-card";
import { Slider } from "@/components/ui/slider";
import type { GeneratedRecommendation } from "@/lib/recommendations";
import { evaluateRiskEngineV2 } from "@/lib/risk-engine-v2/evaluate";
import type { OperationRiskEvaluation } from "@/lib/risk-engine-v2/operation-input.server";
import type { RiskEngineV2Result } from "@/lib/risk-engine-v2/types";
import type { Client, Operation } from "@/lib/mock-data";
import type { AdminOperationRow } from "@/lib/admin-dashboard-types";
import { cn } from "@/lib/utils";
import { getStoredSessionToken } from "@/lib/auth";
import { evaluateAdminRiskBatch } from "@/lib/api/admin-dashboard.functions";
import {
  deleteRiskEngineV2ClientOverride,
  getRiskEngineV2WeightConfiguration,
  saveRiskEngineV2ClientOverride,
  saveRiskEngineV2Configuration,
} from "@/lib/api/risk-config.functions";

const componentLabels: Record<string, string> = {
  climate: "Clima",
  structure: "Estrutura do risco",
  history: "Histórico",
};
const directionLabels = {
  increase: "aumenta risco relativo",
  decrease: "reduz risco relativo",
  neutral: "efeito neutro",
} as const;
const dominantLabels = {
  ml: "Modelo ML",
  operational_rules: "Operacional",
  balanced: "Equilibrado",
} as const;

const fmt = (value: number) => value.toFixed(2);

export const recommendationForV2Result = (
  result: RiskEngineV2Result,
): GeneratedRecommendation => {
  const mlDriver = result.drivers.find((driver) => driver.source === "ml");
  const operationalDriver = result.drivers.find(
    (driver) => driver.source === "operational_rules",
  );
  const operationalContext: Record<string, string> = {
    water_proximity: "a proximidade de água",
    operation_type: "o tipo da operação",
    terrain: "a condição do terreno",
  };
  const factor = operationalDriver
    ? operationalContext[operationalDriver.code] ?? operationalDriver.label.toLowerCase()
    : "as condições operacionais";
  const dominant =
    result.dominantComponent === "ml"
      ? "o score ML tem a maior contribuição ponderada"
      : result.dominantComponent === "operational_rules"
        ? "o score operacional tem a maior contribuição ponderada"
        : "os componentes ML e operacional têm contribuições ponderadas equivalentes";
  const mlContext = mlDriver
    ? ` O principal sinal explicativo do modelo é ${mlDriver.label.toLowerCase()}, sem indicar causalidade.`
    : "";

  if (result.level === "alto") {
    return {
      id: "v2-admin-high",
      title: "Revisar a operação antes de prosseguir",
      description: `Aplicar ação preventiva prioritária e revisar ${factor} antes de manter ou liberar a operação.`,
      rationale: `Risco alto: ${dominant}.${mlContext}`,
      category: operationalDriver?.code === "water_proximity" ? "Rota" : "Prevenção de sinistro",
      priority: "alta",
      audience: "admin",
      factor: operationalDriver?.label ?? "Risk Engine V2",
    };
  }

  if (result.level === "medio") {
    return {
      id: "v2-admin-medium",
      title: "Reforçar o acompanhamento da operação",
      description: `Revisar ${factor} e acompanhar a evolução do risco antes da próxima etapa.`,
      rationale: `Risco médio: ${dominant}.${mlContext}`,
      category: operationalDriver?.code === "water_proximity" ? "Rota" : "Prevenção de sinistro",
      priority: "média",
      audience: "admin",
      factor: operationalDriver?.label ?? "Risk Engine V2",
    };
  }

  return {
    id: "v2-admin-low",
    title: "Manter monitoramento preventivo",
    description: `Manter os controles atuais e observar ${factor} durante a operação.`,
    rationale: `Risco baixo: ${dominant}.${mlContext}`,
    category: operationalDriver?.code === "water_proximity" ? "Rota" : "Prevenção de sinistro",
    priority: "baixa",
    audience: "admin",
    factor: operationalDriver?.label ?? "Risk Engine V2",
  };
};

function LevelBadge({ level }: { level: RiskEngineV2Result["level"] }) {
  const labels = {
    baixo: "Risco baixo",
    medio: "Risco médio",
    alto: "Risco alto",
  } as const;
  const tones = {
    baixo: "border-success/30 bg-success/10 text-success",
    medio: "border-warning/30 bg-warning/10 text-warning-foreground",
    alto: "border-danger/30 bg-danger/10 text-danger",
  } as const;

  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", tones[level])}>
      {labels[level]}
    </span>
  );
}

function MlComponents({ result }: { result: RiskEngineV2Result }) {
  const maxAbs = Math.max(
    ...result.ml.components.map((item) => Math.abs(item.contribution)),
    Number.EPSILON,
  );
  return (
    <div className="space-y-3">
      {result.ml.components.map((item) => {
        const width = (Math.abs(item.contribution) / maxAbs) * 100;
        const Icon = item.direction === "decrease" ? ArrowDownRight : ArrowUpRight;
        return (
          <div key={item.component}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">
                {componentLabels[item.component] ?? item.label}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {item.contribution >= 0 ? "+" : ""}
                {fmt(item.contribution)}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
              aria-label={`Contribuição relativa de ${item.label}`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200",
                  item.contribution < 0 ? "bg-info" : "bg-primary",
                )}
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {directionLabels[item.direction]}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Barras mostram apenas magnitude relativa entre os sinais do modelo; não são percentuais e não
        precisam somar 100.
      </p>
    </div>
  );
}

function OperationalFactors({ result }: { result: RiskEngineV2Result }) {
  const formatPoints = (value: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

  return (
    <div className="space-y-3">
      {result.operationalRules.factors.map((factor) => (
        <div key={factor.id}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">{factor.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
              {formatPoints(factor.points)} / {formatPoints(factor.maxPoints)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-warning transition-[width] duration-200"
              style={{ width: `${(factor.points / factor.maxPoints) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="font-medium text-muted-foreground">Score Operacional</span>
        <strong className="tabular-nums text-foreground">
          {result.operationalRules.operationalRulesScore} / 100
        </strong>
      </div>
    </div>
  );
}

function ContributionTable({ result }: { result: RiskEngineV2Result }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">Fonte</th>
            <th className="py-2 pr-3">Score × peso</th>
            <th className="py-2 text-right">Contribuição</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {result.contributions.map((item) => (
            <tr key={item.component}>
              <td className="py-2 pr-3 font-medium">
                 {item.component === "ml" ? "ML" : "Operacional"}
              </td>
              <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                {fmt(item.sourceScore)} × {item.weight}%
              </td>
              <td className="py-2 text-right font-medium tabular-nums">
                {fmt(item.weightedContribution)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ConfigurationScope = {
  clientId: string | null;
  mlWeight: number;
  operationalRulesWeight: number;
  source: "client" | "global" | "default";
  revision: number | null;
  updatedAt: string | null;
  hasOverride: boolean;
};

const GLOBAL_SCOPE = "__sompo_global__";

export function selectAdminRiskPreviewOperation(
  clientId: string,
  operations: readonly Operation[],
): Operation | undefined {
  return operations.find((operation) => operation.clientId === clientId);
}

export function AdminV2RiskPanel({
  evaluation: initialEvaluation,
  clients,
  operations,
  operationRows,
}: {
  evaluation: OperationRiskEvaluation;
  clients: Client[];
  operations: Operation[];
  operationRows: AdminOperationRow[];
}) {
  const [selectedScope, setSelectedScope] = useState(GLOBAL_SCOPE);
  const [configuration, setConfiguration] = useState<ConfigurationScope | null>(null);
  const [mlWeight, setMlWeight] = useState(initialEvaluation.input.weights.ml);
  const [savedMlWeight, setSavedMlWeight] = useState(initialEvaluation.input.weights.ml);
  const [editingOverride, setEditingOverride] = useState(false);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [previewEvaluation, setPreviewEvaluation] =
    useState<OperationRiskEvaluation | null>(initialEvaluation);
  const [previewStatus, setPreviewStatus] = useState<"ready" | "loading" | "error">("ready");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const loadRequestVersion = useRef(0);
  const previewRequestVersion = useRef(0);
  const selectedClientId = selectedScope === GLOBAL_SCOPE ? null : selectedScope;
  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const canEdit = selectedClientId === null || editingOverride || configuration?.hasOverride === true;
  const activeEvaluation = previewEvaluation ?? initialEvaluation;
  const result = useMemo(
    () => evaluateRiskEngineV2({
      ...activeEvaluation.input,
      weights: { ml: mlWeight, operationalRules: 100 - mlWeight },
    }),
    [activeEvaluation, mlWeight],
  );
  const operationalRulesWeight = 100 - mlWeight;
  const savedOperationalRulesWeight = 100 - savedMlWeight;
  const isCreatingOverride =
    Boolean(selectedClientId) && editingOverride && configuration?.hasOverride === false;
  const hasUnsavedChanges = mlWeight !== savedMlWeight || isCreatingOverride;
  const isValidDraft =
    Number.isInteger(mlWeight) &&
    mlWeight >= 0 &&
    mlWeight <= 100 &&
    operationalRulesWeight >= 0 &&
    operationalRulesWeight <= 100 &&
    mlWeight + operationalRulesWeight === 100;
  const mlDriver = result?.drivers.find((driver) => driver.source === "ml");
  const operationalDriver = result?.drivers.find((driver) => driver.source === "operational_rules");
  const recommendation = result ? recommendationForV2Result(result) : null;

  useEffect(() => {
    const requestVersion = ++loadRequestVersion.current;
    const token = getStoredSessionToken();
    setLoadStatus("loading");
    setLoadError(null);
    setSaveStatus("idle");
    setSaveError(null);
    setRevisionConflict(false);
    setEditingOverride(false);
    if (!token) {
      setLoadStatus("error");
      setLoadError("Sessão não autorizada.");
      return;
    }
    void getRiskEngineV2WeightConfiguration({
      data: { token, clientId: selectedClientId ?? undefined },
    }).then((response) => {
      if (requestVersion !== loadRequestVersion.current) return;
      if (!response.ok) {
        setLoadStatus("error");
        setLoadError(response.error);
        return;
      }
      setConfiguration(response.configuration);
      setSavedMlWeight(response.configuration.mlWeight);
      setMlWeight(response.configuration.mlWeight);
      setEditingOverride(response.configuration.hasOverride);
      setLoadStatus("ready");
    }).catch(() => {
      if (requestVersion !== loadRequestVersion.current) return;
      setLoadStatus("error");
      setLoadError("Não foi possível carregar os pesos.");
    });
  }, [selectedClientId, reloadVersion]);

  useEffect(() => {
    const requestVersion = ++previewRequestVersion.current;
    setPreviewError(null);
    if (!selectedClientId) {
      setPreviewEvaluation(initialEvaluation);
      setPreviewStatus("ready");
      return;
    }
    const operation = selectAdminRiskPreviewOperation(selectedClientId, operations);
    if (!operation) {
      setPreviewEvaluation(null);
      setPreviewStatus("ready");
      return;
    }
    const available = operationRows.find((row) => row.operation.id === operation.id)?.evaluation;
    if (available) {
      setPreviewEvaluation(available);
      setPreviewStatus("ready");
      return;
    }
    const token = getStoredSessionToken();
    if (!token) {
      setPreviewEvaluation(null);
      setPreviewStatus("error");
      setPreviewError("Sessão não autorizada.");
      return;
    }
    setPreviewEvaluation(null);
    setPreviewStatus("loading");
    void evaluateAdminRiskBatch({
      data: { token, operationIds: [operation.id], limit: 1 },
    }).then((response) => {
      if (requestVersion !== previewRequestVersion.current) return;
      if (!response.ok || !response.operationRows[0]) {
        setPreviewStatus("error");
        setPreviewError(response.ok ? "Sem operação disponível para preview." : response.error);
        return;
      }
      const evaluated = response.operationRows[0];
      if (evaluated.operation.clientId !== selectedClientId) return;
      setPreviewEvaluation(evaluated.evaluation);
      setPreviewStatus("ready");
    }).catch(() => {
      if (requestVersion !== previewRequestVersion.current) return;
      setPreviewStatus("error");
      setPreviewError("Não foi possível carregar a operação para preview.");
    });
  }, [initialEvaluation, operationRows, operations, selectedClientId, reloadVersion]);

  const handleDraftChange = (value: number) => {
    if (revisionConflict) return;
    setMlWeight(value);
    setSaveStatus("idle");
    setSaveError(null);
  };

  const handleScopeChange = (value: string) => {
    loadRequestVersion.current += 1;
    previewRequestVersion.current += 1;
    setSelectedScope(value);
    setConfiguration(null);
    setMlWeight(70);
    setSavedMlWeight(70);
    setPreviewEvaluation(null);
    setPreviewStatus("loading");
    setPreviewError(null);
    setLoadStatus("loading");
    setSaveStatus("idle");
    setSaveError(null);
    setRevisionConflict(false);
    setEditingOverride(false);
  };

  const handleSave = async () => {
    if (
      revisionConflict ||
      !canEdit ||
      !hasUnsavedChanges ||
      !isValidDraft ||
      saveStatus === "saving"
    ) return;
    const token = getStoredSessionToken();
    if (!token) {
      setSaveStatus("error");
      setSaveError("Sessão não autorizada.");
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);
    const requestVersion = loadRequestVersion.current;
    try {
      const response = selectedClientId
        ? await saveRiskEngineV2ClientOverride({
            data: {
              token,
              clientId: selectedClientId,
              mlWeight,
              operationalRulesWeight,
              expectedRevision: configuration?.hasOverride
                ? configuration.revision
                : null,
            },
          })
        : await saveRiskEngineV2Configuration({
            data: {
              token,
              mlWeight,
              operationalRulesWeight,
              expectedRevision: configuration?.revision ?? null,
            },
          });
      if (requestVersion !== loadRequestVersion.current) return;
      if (!response.ok) {
        setSaveStatus("error");
        setSaveError(response.error);
        setRevisionConflict("code" in response && response.code === "REVISION_CONFLICT");
        return;
      }
      const saved: ConfigurationScope = selectedClientId
        ? response.configuration as ConfigurationScope
        : {
            ...response.configuration,
            clientId: null,
            hasOverride: false,
          } as ConfigurationScope;
      setConfiguration(saved);
      setSavedMlWeight(saved.mlWeight);
      setEditingOverride(Boolean(selectedClientId));
      setSaveStatus("success");
    } catch {
      if (requestVersion !== loadRequestVersion.current) return;
      setSaveStatus("error");
      setSaveError("Não foi possível salvar os pesos.");
    }
  };

  const handleRemoveOverride = async () => {
    if (
      !selectedClientId ||
      !configuration?.hasOverride ||
      configuration.revision === null ||
      revisionConflict ||
      saveStatus === "saving"
    ) return;
    if (!window.confirm("Voltar ao Padrão Sompo para este cliente?")) return;
    const token = getStoredSessionToken();
    if (!token) return;
    setSaveStatus("saving");
    setSaveError(null);
    setRevisionConflict(false);
    const requestVersion = loadRequestVersion.current;
    try {
      const response = await deleteRiskEngineV2ClientOverride({
        data: {
          token,
          clientId: selectedClientId,
          expectedRevision: configuration.revision,
        },
      });
      if (requestVersion !== loadRequestVersion.current) return;
      if (!response.ok) {
        setSaveStatus("error");
        setSaveError(response.error);
        setRevisionConflict("code" in response && response.code === "REVISION_CONFLICT");
        return;
      }
      setConfiguration(response.configuration);
      setSavedMlWeight(response.configuration.mlWeight);
      setMlWeight(response.configuration.mlWeight);
      setEditingOverride(false);
      setSaveStatus("success");
    } catch {
      if (requestVersion !== loadRequestVersion.current) return;
      setSaveStatus("error");
      setSaveError("Não foi possível remover a personalização.");
    }
  };

  return (
    <div className="space-y-5">
      {previewEvaluation ? (
      <Card className="border-primary/25 bg-primary/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Risk Engine V2 · operação avaliada
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
               {activeEvaluation.context.client.name} · {activeEvaluation.context.farm.name} · Área{" "}
               {activeEvaluation.context.area.name} · {activeEvaluation.context.machine.type}{" "}
               {activeEvaluation.context.machine.id} · Operação {activeEvaluation.context.operation.id}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
               {activeEvaluation.context.farm.municipality}/{activeEvaluation.context.farm.state} ·{" "}
              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                 new Date(activeEvaluation.context.operation.scheduledAt),
              )}
            </p>
          </div>
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Engine {result.engineVersion}
          </span>
        </div>
      </Card>
      ) : (
        <Card className="border-dashed">
          <div className="text-sm font-semibold">Preview da operação</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {previewStatus === "loading"
              ? "Carregando operação do cliente selecionado…"
              : previewError ?? "Sem operação disponível para preview."}
          </p>
          {previewStatus === "error" && (
            <button
              type="button"
              onClick={() => setReloadVersion((value) => value + 1)}
              className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Tentar novamente
            </button>
          )}
        </Card>
      )}

      <Card className="border-primary/20">
        <div className="mb-5 grid gap-3 border-b border-border pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Configuração
            </span>
            <select
              value={selectedScope}
              onChange={(event) => handleScopeChange(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value={GLOBAL_SCOPE}>Padrão Sompo</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
          <div className="md:text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              {selectedClientId === null
                ? "PADRÃO SOMPO"
                : configuration?.hasOverride
                  ? "CONFIGURAÇÃO PERSONALIZADA"
                  : "USANDO PADRÃO SOMPO"}
            </div>
            {selectedClient && (
              <div className="mt-1 text-sm font-medium text-foreground">{selectedClient.name}</div>
            )}
            {configuration?.updatedAt && (
              <div className="mt-1 text-xs text-muted-foreground">
                Atualizado em {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(configuration.updatedAt))}
              </div>
            )}
            {configuration && (
              <div className="mt-1 text-xs text-muted-foreground">
                Origem: {configuration.source}
              </div>
            )}
          </div>
        </div>
        {loadStatus === "error" && (
          <div className="mb-5 rounded-lg border border-danger/30 bg-danger/5 p-3">
            <p role="alert" className="text-sm text-danger">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadVersion((value) => value + 1)}
              className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Tentar novamente
            </button>
          </div>
        )}
        {loadStatus === "loading" && (
          <p className="mb-5 text-sm text-muted-foreground">Carregando configuração…</p>
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
          <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Pesos definidos pela Sompo
          </div>
          <div className="mt-5 flex items-end justify-between">
            <div>
                <div className="text-sm font-medium">Peso do modelo ML</div>
                <div className="text-xs text-muted-foreground">Participação do score ML no resultado</div>
            </div>
            <div className="text-3xl font-semibold tabular-nums text-primary">{mlWeight}%</div>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[mlWeight]}
            onValueChange={([value]) => handleDraftChange(value)}
             disabled={loadStatus !== "ready" || !canEdit || revisionConflict}
              aria-label="Peso do modelo ML no Risk Engine V2"
            className="mt-4"
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>0% ML</span>
              <span>100% ML</span>
          </div>
          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                 <Wrench className="h-4 w-4 text-warning" /> Operacional
              </span>
              <span className="text-xl font-semibold tabular-nums">{operationalRulesWeight}%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
               Peso operacional
            </p>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
             Os pesos Sompo definem quanto cada score participa do Score Final.
          </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Composição atual
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                 <div className="text-xs text-muted-foreground">ML</div>
                <div className="text-3xl font-semibold tabular-nums text-info">{mlWeight}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Operacional</div>
                <div className="text-3xl font-semibold tabular-nums text-warning-foreground">
                  {operationalRulesWeight}%
                </div>
              </div>
            </div>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-foreground">
                Configuração ativa: ML {savedMlWeight}% / Operacional {savedOperationalRulesWeight}%
            </p>
             {selectedClientId && !configuration?.hasOverride && !editingOverride && (
               <button
                 type="button"
                 onClick={() => {
                   setEditingOverride(true);
                   setSaveStatus("idle");
                 }}
                 className="mt-3 rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
               >
                 Personalizar para este cliente
               </button>
             )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                 disabled={!hasUnsavedChanges || !canEdit || !isValidDraft || saveStatus === "saving" || loadStatus !== "ready" || revisionConflict}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveStatus === "saving" ? "Salvando…" : "Salvar pesos"}
              </button>
               {selectedClientId && configuration?.hasOverride && (
                 <button
                   type="button"
                   onClick={handleRemoveOverride}
                   disabled={saveStatus === "saving" || revisionConflict}
                   className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                 >
                   Voltar ao Padrão Sompo
                 </button>
               )}
              {hasUnsavedChanges && (
                <span className="text-xs font-medium text-warning-foreground">
                  Alterações não salvas
                </span>
              )}
              {!hasUnsavedChanges && saveStatus === "success" && (
                <span role="status" className="text-xs font-medium text-success">
                  Pesos salvos com sucesso
                </span>
              )}
            </div>
            {saveStatus === "error" && saveError && (
               <div className="mt-2">
                 <p role="alert" className="text-xs font-medium text-danger">{saveError}</p>
                 {revisionConflict && (
                   <button
                     type="button"
                     onClick={() => setReloadVersion((value) => value + 1)}
                     className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                   >
                     Recarregar valores
                   </button>
                 )}
               </div>
            )}
          </div>
          </div>
        </div>
      </Card>

      {previewEvaluation ? (
      <>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-info/30 bg-info/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-info">
                 SCORE ML
              </div>
              <div className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
                {fmt(result.ml.mlRelativeScore)}
                <span className="ml-2 text-xl font-medium text-muted-foreground">/ 100</span>
              </div>
            </div>
            <span className="rounded-full border border-info/30 bg-background px-2.5 py-1 text-xs font-medium text-info">
              Peso {mlWeight}%
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
              Score ML
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
             Sinais disponíveis: Clima, Estrutura do risco e Histórico.
          </p>
          <div className="mt-5 border-t border-info/20 pt-4">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Sinais do modelo</h3>
            <MlComponents result={result} />
          </div>
        </Card>

        <Card className="border-warning/30 bg-warning/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-warning-foreground">
                 SCORE OPERACIONAL
              </div>
              <div className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
                {result.operationalRules.operationalRulesScore}
                <span className="ml-2 text-xl font-medium text-muted-foreground">/ 100</span>
              </div>
            </div>
            <span className="rounded-full border border-warning/30 bg-background px-2.5 py-1 text-xs font-medium text-warning-foreground">
              Peso {operationalRulesWeight}%
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
             Score operacional
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
             Água, tipo da operação e terreno da operação avaliada.
          </p>
          <div className="mt-5 border-t border-warning/20 pt-4">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Fatores operacionais
            </h3>
            <OperationalFactors result={result} />
          </div>
        </Card>
      </div>

      <Card className="border-2 border-primary/40 bg-primary/5">
        {hasUnsavedChanges && (
          <div className="mb-4 inline-flex rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning-foreground">
            Prévia com pesos não salvos
          </div>
        )}
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
               <Activity className="h-4 w-4" /> SCORE FINAL
            </div>
            <div className="mt-3 text-6xl font-semibold tabular-nums text-foreground">
              {result.finalScore}
              <span className="ml-2 text-2xl font-medium text-muted-foreground">/ 100</span>
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-background/80 p-4 md:min-w-64">
            <LevelBadge level={result.level} />
            <div className="mt-3 flex items-start gap-2 text-sm">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">Componente dominante</div>
                <strong className="text-foreground">
                  {dominantLabels[result.dominantComponent]}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">Composição ponderada</h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            Como os dois scores participam do resultado final.
          </p>
          <ContributionTable result={result} />
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-semibold text-foreground">Score Final</span>
            <strong className="tabular-nums text-primary">{result.finalScore}</strong>
          </div>
        </Card>
        <Card>
        <h2 className="text-sm font-semibold">Principais drivers</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {mlDriver && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Primeiro driver do modelo
              </div>
              <div className="mt-1 text-sm font-medium">
                {mlDriver.label} ·{" "}
                {mlDriver.direction === "decrease"
                  ? "reduz risco relativo"
                  : mlDriver.direction === "increase"
                    ? "aumenta risco relativo"
                    : "efeito neutro"}
              </div>
            </div>
          )}
          {operationalDriver && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Primeiro driver operacional
              </div>
              <div className="mt-1 text-sm font-medium">{operationalDriver.label}</div>
            </div>
          )}
        </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold">Recomendação administrativa</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
           Orientação baseada no nível, componente dominante e drivers da operação avaliada.
        </p>
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          Fator operacional dominante:{" "}
          <strong>
            {result.operationalRules.factors.find(
              (factor) => factor.id === result.operationalRules.dominantFactor,
            )?.label ?? "nenhum fator ativo"}
          </strong>
        </div>
       <RecommendationCard rec={recommendation!} />
      </Card>
       {activeEvaluation.hasIncompleteInputs && (
        <details className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Detalhes da disponibilidade dos dados
          </summary>
          <p className="mt-2 leading-relaxed">
            Parte dos sinais necessários para a avaliação está indisponível ou foi completada na
            preparação do input V2. O resultado exibido é o retorno atual do motor.
          </p>
        </details>
      )}
      </>
      ) : (
        <Card>
          <div className="text-sm font-semibold">Score Final simulado</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {previewStatus === "loading"
              ? "Carregando operação do cliente selecionado…"
              : previewError ?? "Sem operação disponível para preview."}
          </p>
        </Card>
      )}
    </div>
  );
}

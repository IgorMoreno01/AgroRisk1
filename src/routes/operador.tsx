import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout, Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge } from "@/components/risk-badge";
import { NextBestActionCard } from "@/components/next-best-action";
import { CloudSun, Droplets, Mountain, Wind, type LucideIcon } from "lucide-react";
import { RequireProfile } from "@/components/require-profile";
import { ActionableAlertsList } from "@/components/actionable-alerts";
import { getWeather } from "@/lib/api/weather.functions";
import type { WeatherData } from "@/lib/external-data.types";
import { getStoredSessionToken } from "@/lib/auth";
import { getOperadorDashboard } from "@/lib/api/operador-dashboard.functions";
import type { OperadorDashboardSnapshot } from "@/lib/operador-dashboard-types";
import { OperationRegistrationCard } from "@/components/operation-registration-card";
import { PreventiveMaintenanceCard } from "@/components/preventive-maintenance-card";

export const Route = createFileRoute("/operador")({
  head: () => ({ meta: [{ title: "AgroRisk · Operador" }] }),
  component: () => (
    <RequireProfile path="/operador">
      <OperadorPage />
    </RequireProfile>
  ),
});

function OperadorPage() {
  const [snapshot, setSnapshot] = useState<OperadorDashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // O clima permanece disponível como resumo operacional; os demais dados
  // externos continuam no backend, mas não são exibidos nesta persona.
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const token = getStoredSessionToken();
    if (!token) {
      setLoadError("Sessão do Operador não encontrada.");
      return;
    }
    void getOperadorDashboard({ data: { token } })
      .then((response) => {
        if (cancelled) return;
        if (!response.ok) throw new Error(response.error);
        setSnapshot(response.snapshot);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a operação.");
      });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!snapshot) return;
    const coords = snapshot.geo;
    getWeather({ data: { lat: coords.lat, lon: coords.lon } })
      .then(setWeather)
      .catch((e) => console.warn("[Operador] weather fetch failed:", e))
      .finally(() => setLoadingWeather(false));
  }, [snapshot?.geo.lat, snapshot?.geo.lon]);

  if (loadError) {
    return (
      <AppLayout title="Painel do Operador" subtitle="Contexto individual da operação">
        <Card>
          <SectionTitle title="Não foi possível carregar a operação" description={loadError} />
          <button onClick={() => setAttempt((value) => value + 1)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Tentar novamente
          </button>
        </Card>
      </AppLayout>
    );
  }

  if (!snapshot) {
    return (
      <AppLayout title="Painel do Operador" subtitle="Contexto individual da operação">
        <Card>
          <SectionTitle title="Carregando operação" description="Consultando o contexto individual no PostgreSQL…" />
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/2 animate-pulse rounded-full bg-primary" /></div>
        </Card>
      </AppLayout>
    );
  }

  const { operation, machine, area, client, risk: scoreContext } = snapshot;
  const score = scoreContext.finalScore;
  const level = scoreContext.level;
  const nextAction = snapshot.nextAction;
  const climate = loadingWeather
    ? { condition: "Carregando…", temperature: "—", precipitation: "—", wind: "—" }
    : weather
    ? {
        condition: weather.current.conditionLabel,
        temperature: `${Math.round(weather.current.temperature)}°C`,
        precipitation: `${weather.current.precipitation.toFixed(1)} mm/h`,
        wind: `${Math.round(weather.current.windSpeed)} km/h ${weather.current.windDirectionLabel}`,
      }
    : { condition: "Dados indisponíveis", temperature: "—", precipitation: "—", wind: "—" };

  return (
    <AppLayout
      title="Painel do Operador"
      subtitle={`Operação ${operation.id} · ${client.name} · ${snapshot.source === "postgres" ? "PostgreSQL" : "fallback demonstrativo"}`}
      account={{
        userId: snapshot.operator.id,
        name: snapshot.operator.name,
        clientName: client.name,
        clientLocation: client.location,
        operationId: operation.id,
        machineName: `${machine.type} · ${machine.id}`,
        areaName: area.name,
        operationStatus: operation.status,
        lastUpdate: machine.lastUpdate,
      }}
    >
      <div id="topo" className="scroll-mt-20" />
      <div id="operacao" className="grid scroll-mt-20 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle
            title="Operação atual"
            description={`${operation.type} · ${area.name}`}
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                {operation.status}
              </span>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Máquina</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{machine.type} · {machine.id}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Operação</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{operation.id}</div>
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle title="Risco agora" />
          <div className="flex flex-col items-center justify-center py-2">
            <ScoreGauge score={score} />
            <RiskBadge level={level} className="mt-3" score={score} />
            <div className="mt-4 w-full rounded-lg bg-muted/50 p-3 text-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fator principal</div>
              <div className="mt-1 font-medium text-foreground">{nextAction.factor}</div>
            </div>
          </div>
        </Card>
      </div>

      <div id="recomendacoes" className="mt-6 grid scroll-mt-20 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Próxima melhor ação" description="Prioridade para a operação atual" />
          <NextBestActionCard action={nextAction} />
        </Card>
        <Card>
          <SectionTitle title="Clima e segurança" description={climate.condition} />
          <div className="grid grid-cols-2 gap-3">
            <QuickStatus icon={CloudSun} label="Temperatura" value={climate.temperature} />
            <QuickStatus icon={Droplets} label="Precipitação" value={climate.precipitation} />
            <QuickStatus icon={Wind} label="Vento" value={climate.wind} />
            <QuickStatus
              icon={Mountain}
              label="Inclinação simulada"
              value={`${snapshot.telemetry.inclinationDegrees.toFixed(1)}° · ${snapshot.telemetry.inclinationStatus}`}
            />
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <ActionableAlertsList sectionId="alertas-operacao" title="Alertas da operação" />
      </div>

      <div id="registro-operacao" className="mt-6 scroll-mt-20">
        <OperationRegistrationCard />
      </div>

      <div className="mt-6">
        <PreventiveMaintenanceCard />
      </div>

    </AppLayout>
  );
}

function QuickStatus({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color =
    score >= 71 ? "var(--color-danger)" : score >= 41 ? "var(--color-warning)" : "var(--color-success)";
  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="14" />
      <circle
        cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="14"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 80 80)"
      />
      <text x="80" y="84" textAnchor="middle" fontSize="34" fontWeight="600" fill="var(--color-foreground)">
        {score}
      </text>
      <text x="80" y="104" textAnchor="middle" fontSize="11" fill="var(--color-muted-foreground)">
        score / 100
      </text>
    </svg>
  );
}

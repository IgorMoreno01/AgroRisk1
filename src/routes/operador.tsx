import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout, Card, SectionTitle } from "@/components/app-layout";
import { RiskBadge } from "@/components/risk-badge";
import { RiskComposition } from "@/components/risk-composition";
import { RecommendationCard } from "@/components/recommendation-card";
import { NextBestActionCard } from "@/components/next-best-action";
import {
  OperationalSummary, GeoContextCard, RecentHistoryCard,
} from "@/components/operador-cards";
import {
  getMachine, getArea, operationsByOperator,
} from "@/lib/mock-data";
import {
  riskResultForOperation,
  deriveWeatherFromReal, deriveWaterDistanceFromReal,
  inputsForOperationWithOverrides, inclinationLabel,
} from "@/lib/risk-score";
import {
  recommendationsForOperation, nextBestActionForOperation,
} from "@/lib/recommendations";
import { AlertTriangle, Cloud, Droplets, Wind, MapPin, Mountain, Loader2, Wifi, WifiOff } from "lucide-react";
import { RequireProfile } from "@/components/require-profile";
import { ProfileAlertsSection } from "@/components/profile-alerts-section";
import { getProfileAlerts } from "@/lib/profile-alerts";
import { getWeather } from "@/lib/api/weather.functions";
import { getWaterFeatures } from "@/lib/api/water-geo.functions";
import { getRouting } from "@/lib/api/routing.functions";
import { getElevation } from "@/lib/api/terrain.functions";
import { getAreaCoords } from "@/lib/area-coordinates";
import type { WeatherData, WaterGeoData, RouteData, ElevationData } from "@/lib/external-data.types";
import {
  ClimateSection,
  WaterFeaturesSection,
  RoutingSection,
  TerrainSection,
  SoilDemoSection,
  DataSourcesPanel,
  RiskFactorsWithSources,
} from "@/components/external-data-sections";
import { useRiskConfig } from "@/lib/risk-config";

export const Route = createFileRoute("/operador")({
  head: () => ({ meta: [{ title: "AgroRisk · Operador" }] }),
  component: () => (
    <RequireProfile path="/operador">
      <OperadorPage />
    </RequireProfile>
  ),
});

const OPERATOR_ID = "USR-OP-1";

function OperadorPage() {
  const { weights } = useRiskConfig();
  const operation = operationsByOperator(OPERATOR_ID)[0]!;
  const machine = getMachine(operation.machineId)!;
  const area = getArea(operation.areaId)!;
  const coords = getAreaCoords(operation.areaId);

  // ---- Dados externos (carregados assincronamente) ----
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [waterGeo, setWaterGeo] = useState<WaterGeoData | null>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [elevation, setElevation] = useState<ElevationData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [loadingWater, setLoadingWater] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [loadingTerrain, setLoadingTerrain] = useState(true);

  useEffect(() => {
    // Origem simulada: ~5 km ao norte da área (pátio da fazenda)
    const originLat = coords.lat + 0.045;
    const originLon = coords.lon;

    getWeather({ data: { lat: coords.lat, lon: coords.lon } })
      .then(setWeather)
      .catch((e) => console.warn("[Operador] weather fetch failed:", e))
      .finally(() => setLoadingWeather(false));

    getWaterFeatures({ data: { lat: coords.lat, lon: coords.lon, radiusM: 3000 } })
      .then(setWaterGeo)
      .catch((e) => console.warn("[Operador] water-geo fetch failed:", e))
      .finally(() => setLoadingWater(false));

    getRouting({ data: { originLat, originLon, destLat: coords.lat, destLon: coords.lon } })
      .then(setRouteData)
      .catch((e) => console.warn("[Operador] routing fetch failed:", e))
      .finally(() => setLoadingRoute(false));

    getElevation({ data: { lat: coords.lat, lon: coords.lon } })
      .then(setElevation)
      .catch((e) => console.warn("[Operador] terrain fetch failed:", e))
      .finally(() => setLoadingTerrain(false));
  }, [coords.lat, coords.lon]);

  // ---- Score: recalcula com dados reais quando disponíveis ----
  const scoreContext = (() => {
    const weatherOverride = weather ? deriveWeatherFromReal(weather) : undefined;
    const waterOverride = waterGeo ? deriveWaterDistanceFromReal(waterGeo) : undefined;
    return riskResultForOperation(operation, weights, {
      ...(weatherOverride ? { weather: weatherOverride } : {}),
      ...(waterOverride ? { waterDistance: waterOverride } : {}),
    });
  })();
  const breakdown = scoreContext.breakdown;
  const score = scoreContext.finalScore;
  const level = scoreContext.level;
  const isHigh = level === "alto";

  const riskOptions = {
    weights,
    result: scoreContext,
    overrides: {
      ...(weather ? { weather: deriveWeatherFromReal(weather) } : {}),
      ...(waterGeo ? { waterDistance: deriveWaterDistanceFromReal(waterGeo) } : {}),
    },
  };
  const recs = recommendationsForOperation(operation, "operador", riskOptions);
  const nextAction = nextBestActionForOperation(operation, riskOptions);

  const topFactors = [...breakdown.parts]
    .filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  // ---- Cards de condição: real quando disponível, mock como fallback ----
  const climaValue = loadingWeather
    ? "Carregando…"
    : weather
    ? weather.current.conditionLabel
    : breakdown.parts[0].detail;

  const ventoValue = loadingWeather
    ? "Carregando…"
    : weather
    ? `${Math.round(weather.current.windSpeed)} km/h ${weather.current.windDirectionLabel}`
    : "14 km/h NE";
  const inclinationValue = inclinationLabel(
    inputsForOperationWithOverrides(operation, riskOptions.overrides).inclinationDegrees,
  );

  const conditions = [
    { icon: Cloud,    label: "Clima",   value: climaValue },
    { icon: Droplets, label: "Solo",    value: area.condition },
    { icon: Wind,     label: "Vento",   value: ventoValue },
    { icon: Mountain, label: "Inclinação", value: `${inclinationValue} · MPU6050 simulado` },
    { icon: MapPin,   label: "Posição", value: `${area.name} · ${area.type}` },
  ];

  return (
    <AppLayout title="Painel do Operador" subtitle={`Operação ${operation.id} · ${machine.client}`}>
      <div id="topo" className="scroll-mt-20" />
      {isHigh && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border-2 border-danger/50 bg-danger/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <div className="font-semibold text-danger">ALERTA DE RISCO ALTO</div>
            <p className="mt-0.5 text-sm text-foreground/80">
              Motivo: {topFactors.map((f) => f.label.toLowerCase()).join(" + ")}.
              Siga as ações abaixo ou pause a operação até a normalização.
            </p>
          </div>
        </div>
      )}

      {/* Topo */}
      <div id="operacao" className="grid scroll-mt-20 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle
            title="Operação em andamento"
            description={`Iniciada às ${operation.start} · ${operation.type} · ${area.name}`}
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                Ativa
              </span>
            }
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Equipamento</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{machine.name}</div>
              <div className="text-sm text-muted-foreground">{machine.id} · {machine.client}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Operador</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{machine.operator}</div>
              <div className="text-sm text-muted-foreground">Turno matutino · {operation.duration}</div>
            </div>
          </div>

          {/* Badge de fonte dos dados climáticos */}
          <div className="mt-4 flex items-center gap-2">
            {loadingWeather ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando dados climáticos…
              </span>
            ) : weather?.source === "open-meteo" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-2.5 py-0.5 text-[11px] font-medium text-info">
                <Wifi className="h-3 w-3" /> Clima via Open-Meteo · {weather.current.temperature}°C · umidade {weather.current.humidity}%
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                <WifiOff className="h-3 w-3" /> Dados climáticos simulados (API indisponível)
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {conditions.map((c) => (
              <div key={c.label} className="rounded-lg border border-border p-3">
                <c.icon className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </div>
                <div className="text-sm font-medium text-foreground">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <NextBestActionCard action={nextAction} />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Score de risco atual" />
          <div className="flex flex-col items-center justify-center py-2">
            <ScoreGauge score={score} />
            <RiskBadge level={level} className="mt-3" />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Atualizado há instantes · escala 0–100
            </p>
             <p className="mt-1 text-center text-xs text-muted-foreground">
               Motor Sompo: clima {weights.climate}% · operacional {weights.operational}%
             </p>
            <div className="mt-3 w-full rounded-lg bg-muted/60 p-3 text-xs">
              <div className="font-medium text-foreground">Risco {level} devido a:</div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {topFactors.map((f) => (
                  <li key={f.category}>• {f.detail}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      {/* Meio: resumo + mini-mapa */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <OperationalSummary
          operation={operation}
          machine={machine}
          area={area}
          breakdown={breakdown}
          nextAction={nextAction}
        />
        <section id="geo" className="scroll-mt-20">
          <GeoContextCard area={area} breakdown={breakdown} waterGeo={waterGeo} loadingWater={loadingWater} routeData={routeData} loadingRoute={loadingRoute} />
        </section>
      </div>

      {/* Inferior: composição + ações */}
      <div id="recomendacoes" className="mt-6 grid scroll-mt-20 gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle
            title="Composição do score"
            description={`Como os ${score} pontos foram calculados`}
          />
          <RiskComposition breakdown={breakdown} />
        </Card>

        <Card>
          <SectionTitle
            title="Ações recomendadas"
            description="Decida e execute em sequência — prioridade alta primeiro"
          />
          <div className="space-y-3">
            {recs.map((r) => (
              <RecommendationCard key={r.id} rec={r} showAction />
            ))}
          </div>
        </Card>
      </div>

      {/* ──────────── Dados externos das APIs ──────────── */}

      {/* Fontes de dados — status geral */}
      <div id="fontes" className="mt-6 scroll-mt-20">
        <DataSourcesPanel
          weather={weather}
          waterGeo={waterGeo}
          routeData={routeData}
          elevation={elevation}
          loadingWeather={loadingWeather}
          loadingWater={loadingWater}
          loadingRoute={loadingRoute}
          loadingTerrain={loadingTerrain}
        />
      </div>

      {/* Condições climáticas (Open-Meteo) + Recursos hídricos (Overpass/OSM) */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ClimateSection weather={weather} loading={loadingWeather} />
        <WaterFeaturesSection waterGeo={waterGeo} loading={loadingWater} />
      </div>

      {/* Rota operacional (openrouteservice) + Terreno (OpenTopography) */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RoutingSection routeData={routeData} loading={loadingRoute} />
        <TerrainSection elevation={elevation} loading={loadingTerrain} />
      </div>

      {/* Análise do Solo (SoilGrids — demonstração) */}
      <div className="mt-6">
        <SoilDemoSection />
      </div>

      {/* Fatores de risco com origem dos dados */}
      <div className="mt-6">
        <RiskFactorsWithSources
          breakdown={breakdown}
          weather={weather}
          waterGeo={waterGeo}
          elevation={elevation}
          routeData={routeData}
        />
      </div>

      {/* Histórico recente */}
      <section id="historico" className="mt-6 scroll-mt-20">
        <RecentHistoryCard operation={operation} breakdown={breakdown} area={area} />
      </section>

      {/* Alertas da operação (US 5 · personalização por perfil) */}
      <div className="mt-6">
        <ProfileAlertsSection bundle={getProfileAlerts("operador")} />
      </div>
    </AppLayout>
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

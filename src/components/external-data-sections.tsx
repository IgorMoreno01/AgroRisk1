// ============================================================
// AgroRisk · Seções de dados externos para o Painel do Operador
// Cada seção mostra dados reais da API + timestamp + fonte.
// ============================================================

import { Card, SectionTitle } from "@/components/app-layout";
import type { WeatherData, WaterGeoData, RouteData, ElevationData } from "@/lib/external-data.types";
import type { ScoreBreakdown } from "@/lib/risk-score";
import {
  Thermometer, Droplets, Wind, CloudRain, Cloud, Wifi, WifiOff,
  Loader2, MapPin, Navigation, Mountain, FlaskConical, AlertTriangle,
  CheckCircle2, Clock, Layers, Waves, ArrowRight, Route, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────────────────────────

function ts(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SourceRow({
  icon: Icon,
  label,
  source,
  timestamp,
  real,
}: {
  icon: React.ElementType;
  label: string;
  source: string;
  timestamp?: string;
  real: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        {" · "}
        <span>{source}</span>
        {timestamp && (
          <>
            {" · "}
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {ts(timestamp)}
            </span>
          </>
        )}
        {" · "}
        {real ? (
          <span className="text-success font-medium">Dado real</span>
        ) : (
          <span className="text-warning font-medium">Fallback simulado</span>
        )}
      </span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

// ─── 1. CLIMA (Open-Meteo) ─────────────────────────────────────────────────────

function windDegToLabel(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","L","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function ClimateSection({
  weather,
  loading,
}: {
  weather: WeatherData | null;
  loading: boolean;
}) {
  return (
    <Card>
      <SectionTitle
        title="Condições Climáticas"
        description="Dados em tempo real via Open-Meteo"
        action={
          loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : weather?.source === "open-meteo" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
              <Wifi className="h-3 w-3" /> Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              <WifiOff className="h-3 w-3" /> Fallback
            </span>
          )
        }
      />

      {loading ? (
        <LoadingState label="Consultando Open-Meteo…" />
      ) : !weather ? (
        <p className="text-sm text-muted-foreground py-4">API indisponível — dados climáticos não carregados.</p>
      ) : (
        <>
          {/* Grid principal */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <MeteoCard icon={Thermometer} label="Temperatura" value={`${weather.current.temperature.toFixed(1)} °C`} highlight />
            <MeteoCard icon={Droplets} label="Umidade" value={`${weather.current.humidity} %`} />
            <MeteoCard icon={CloudRain} label="Precipitação" value={`${weather.current.precipitation.toFixed(1)} mm/h`} />
            <MeteoCard icon={Wind} label="Vento" value={`${Math.round(weather.current.windSpeed)} km/h`} />
            <MeteoCard icon={Navigation} label="Direção" value={`${windDegToLabel(weather.current.windDirection)} (${weather.current.windDirection}°)`} />
            <MeteoCard icon={Cloud} label="Condição" value={weather.current.conditionLabel} />
          </div>

          {/* Previsão horária */}
          {weather.hourlyForecast.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Previsão próximas horas
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weather.hourlyForecast.slice(0, 6).map((h) => (
                  <div
                    key={h.hour}
                    className="flex min-w-[72px] flex-col items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center"
                  >
                    <span className="text-xs font-medium text-foreground">{h.hour}h</span>
                    <span className="text-sm font-semibold text-foreground">{h.temperature.toFixed(0)}°</span>
                    <span className="text-[10px] text-muted-foreground">{h.precipitationProbability}% 🌧</span>
                    <span className="text-[10px] text-muted-foreground">{Math.round(h.windSpeed)} km/h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <SourceRow
              icon={Wifi}
              label="Open-Meteo"
              source="api.open-meteo.com — gratuito, sem chave"
              timestamp={weather.fetchedAt}
              real={weather.source === "open-meteo"}
            />
          </div>
        </>
      )}
    </Card>
  );
}

function MeteoCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border p-3", highlight && "border-primary/30 bg-primary/5")}>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground leading-tight">{value}</div>
    </div>
  );
}

// ─── 2. RECURSOS HÍDRICOS (Overpass / OSM) ────────────────────────────────────

export function WaterFeaturesSection({
  waterGeo,
  loading,
}: {
  waterGeo: WaterGeoData | null;
  loading: boolean;
}) {
  return (
    <Card>
      <SectionTitle
        title="Recursos Hídricos Próximos"
        description="Corpos d'água num raio de 3 km — OpenStreetMap / Overpass"
        action={
          loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : waterGeo?.source === "overpass" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
              <Wifi className="h-3 w-3" /> Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              <WifiOff className="h-3 w-3" /> Fallback
            </span>
          )
        }
      />

      {loading ? (
        <LoadingState label="Consultando Overpass / OSM…" />
      ) : !waterGeo ? (
        <p className="text-sm text-muted-foreground py-4">API indisponível.</p>
      ) : waterGeo.features.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          Nenhum corpo d'água encontrado num raio de {(waterGeo.radiusM / 1000).toFixed(0)} km
          {waterGeo.source === "overpass" ? " (dado real — OSM)" : " (simulado)"}.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {waterGeo.features
              .slice()
              .sort((a, b) => a.distanceM - b.distanceM)
              .slice(0, 8)
              .map((f) => (
                <div
                  key={f.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm",
                    f.distanceM <= 50 && "border-danger/40 bg-danger/5",
                    f.distanceM > 50 && f.distanceM <= 150 && "border-warning/40 bg-warning/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Waves className={cn(
                      "h-4 w-4 shrink-0",
                      f.distanceM <= 50 ? "text-danger" : f.distanceM <= 150 ? "text-warning" : "text-info",
                    )} />
                    <div>
                      <span className="font-medium text-foreground">{f.name}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">({f.typeLabel})</span>
                    </div>
                  </div>
                  <span className={cn(
                    "text-xs font-semibold tabular-nums",
                    f.distanceM <= 50 ? "text-danger" : f.distanceM <= 150 ? "text-warning" : "text-muted-foreground",
                  )}>
                    {f.distanceM >= 1000
                      ? `${(f.distanceM / 1000).toFixed(1)} km`
                      : `${Math.round(f.distanceM)} m`}
                  </span>
                </div>
              ))}
          </div>

          {waterGeo.nearestDistanceM !== null && (
            <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Mais próximo: <span className="font-medium text-foreground">{waterGeo.nearestName ?? "—"}</span>
              {" · "}
              <span className="font-semibold text-foreground">
                {waterGeo.nearestDistanceM >= 1000
                  ? `${(waterGeo.nearestDistanceM / 1000).toFixed(1)} km`
                  : `${Math.round(waterGeo.nearestDistanceM)} m`}
              </span>
              {waterGeo.nearestDistanceM <= 50 && (
                <span className="ml-2 font-medium text-danger">⚠ Zona crítica</span>
              )}
            </div>
          )}

          <div className="mt-3">
            <SourceRow
              icon={Waves}
              label="OpenStreetMap / Overpass"
              source="overpass-api.de — gratuito, sem chave"
              timestamp={waterGeo.fetchedAt}
              real={waterGeo.source === "overpass"}
            />
          </div>
        </>
      )}
    </Card>
  );
}

// ─── 3. ROTA OPERACIONAL (openrouteservice) ───────────────────────────────────

export function RoutingSection({
  routeData,
  loading,
}: {
  routeData: RouteData | null;
  loading: boolean;
}) {
  return (
    <Card>
      <SectionTitle
        title="Rota Operacional"
        description="Distância e tempo de deslocamento — openrouteservice"
        action={
          loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : routeData?.source === "openrouteservice" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
              <Wifi className="h-3 w-3" /> Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              <WifiOff className="h-3 w-3" /> {routeData ? "Fallback (sem chave ORS)" : "Indisponível"}
            </span>
          )
        }
      />

      {loading ? (
        <LoadingState label="Calculando rota via openrouteservice…" />
      ) : !routeData ? (
        <p className="text-sm text-muted-foreground py-4">Dados de rota não disponíveis.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Rota principal */}
            <RouteCard
              label="Rota Principal"
              route={routeData.primary}
              primary
              origin={routeData.origin}
              destination={routeData.destination}
            />
            {/* Rota alternativa */}
            {routeData.alternative ? (
              <RouteCard
                label="Rota Alternativa"
                route={routeData.alternative}
                primary={false}
                origin={routeData.origin}
                destination={routeData.destination}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-xs text-muted-foreground">
                Sem rota alternativa disponível
              </div>
            )}
          </div>

          {/* Passos da rota principal */}
          {routeData.primary.steps.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Instruções de navegação
              </div>
              <div className="space-y-1">
                {routeData.primary.steps.slice(0, 5).map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1">{step.instruction}</span>
                    <span className="tabular-nums">
                      {step.distanceM >= 1000
                        ? `${(step.distanceM / 1000).toFixed(1)} km`
                        : `${Math.round(step.distanceM)} m`}
                    </span>
                  </div>
                ))}
                {routeData.primary.steps.length > 5 && (
                  <div className="text-xs text-muted-foreground pl-6">
                    + {routeData.primary.steps.length - 5} instruções adicionais
                  </div>
                )}
              </div>
            </div>
          )}

          {routeData.source === "mock" && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <Info className="mr-1 inline h-3 w-3" />
              Distância calculada por distância euclidiana (fallback). Configure <code className="font-mono">ORS_API_KEY</code> para rota real.
            </div>
          )}

          <div className="mt-3">
            <SourceRow
              icon={Route}
              label="openrouteservice"
              source="openrouteservice.org — requer ORS_API_KEY"
              timestamp={routeData.fetchedAt}
              real={routeData.source === "openrouteservice"}
            />
          </div>
        </>
      )}
    </Card>
  );
}

function RouteCard({
  label,
  route,
  primary,
  origin,
  destination,
}: {
  label: string;
  route: { distanceM: number; durationS: number; durationLabel: string; distanceLabel: string };
  primary: boolean;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      primary ? "border-primary/30 bg-primary/5" : "border-border",
    )}>
      <div className="mb-3 flex items-center gap-2">
        <Route className={cn("h-4 w-4", primary ? "text-primary" : "text-muted-foreground")} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Distância</div>
          <div className="text-lg font-bold text-foreground">{route.distanceLabel}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Duração</div>
          <div className="text-lg font-bold text-foreground">{route.durationLabel}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
        <MapPin className="h-2.5 w-2.5" />
        {origin.lat.toFixed(3)}, {origin.lon.toFixed(3)}
        <ArrowRight className="h-2.5 w-2.5 mx-1" />
        <MapPin className="h-2.5 w-2.5" />
        {destination.lat.toFixed(3)}, {destination.lon.toFixed(3)}
      </div>
    </div>
  );
}

// ─── 4. CONDIÇÕES DO TERRENO (OpenTopography) ─────────────────────────────────

const SLOPE_COLORS: Record<string, string> = {
  flat: "text-success",
  gentle: "text-info",
  moderate: "text-warning",
  steep: "text-danger",
  very_steep: "text-danger",
};

export function TerrainSection({
  elevation,
  loading,
}: {
  elevation: ElevationData | null;
  loading: boolean;
}) {
  return (
    <Card>
      <SectionTitle
        title="Condições do Terreno"
        description="Elevação e declividade — OpenTopography / Open-Elevation"
        action={
          loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : elevation?.source === "opentopography" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
              <Wifi className="h-3 w-3" /> OpenTopography
            </span>
          ) : elevation?.source === "open-elevation" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
              <Wifi className="h-3 w-3" /> Open-Elevation
            </span>
          ) : elevation?.source === "mock" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              <WifiOff className="h-3 w-3" /> Fallback
            </span>
          ) : null
        }
      />

      {loading ? (
        <LoadingState label="Consultando dados de elevação…" />
      ) : !elevation ? (
        <p className="text-sm text-muted-foreground py-4">Dados de terreno não disponíveis.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MeteoCard icon={Mountain} label="Elevação" value={`${elevation.elevationM.toFixed(0)} m`} highlight />
            <div className="rounded-lg border border-border p-3">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Declividade</div>
              <div className={cn("mt-0.5 text-sm font-semibold leading-tight", SLOPE_COLORS[elevation.slopeClass])}>
                {elevation.slopePercent !== null ? `${elevation.slopePercent.toFixed(1)} %` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <Info className="h-4 w-4 text-muted-foreground" />
              <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Classe</div>
              <div className={cn("mt-0.5 text-sm font-semibold leading-tight", SLOPE_COLORS[elevation.slopeClass])}>
                {elevation.slopeLabel}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Coordenada</div>
              <div className="mt-0.5 text-xs font-medium text-foreground leading-tight">
                {elevation.lat.toFixed(4)}, {elevation.lon.toFixed(4)}
              </div>
            </div>
          </div>

          {elevation.nearbyPoints.length > 1 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pontos de referência ({elevation.nearbyPoints.length})
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {elevation.nearbyPoints.map((p, i) => (
                  <div
                    key={i}
                    className="flex min-w-[80px] flex-col items-center gap-0.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center text-xs"
                  >
                    <span className="font-semibold text-foreground">{p.elevationM.toFixed(0)} m</span>
                    <span className="text-[10px] text-muted-foreground">{p.lat.toFixed(3)}</span>
                    <span className="text-[10px] text-muted-foreground">{p.lon.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <SourceRow
              icon={Mountain}
              label={
                elevation.source === "opentopography"
                  ? "OpenTopography"
                  : elevation.source === "open-elevation"
                  ? "Open-Elevation (fallback público)"
                  : "Mock (ambas APIs indisponíveis)"
              }
              source={
                elevation.source === "opentopography"
                  ? "opentopography.org — requer OPENTOPO_API_KEY"
                  : elevation.source === "open-elevation"
                  ? "api.open-elevation.com — gratuito, sem chave"
                  : "dados simulados"
              }
              timestamp={elevation.fetchedAt}
              real={elevation.source !== "mock"}
            />
          </div>
        </>
      )}
    </Card>
  );
}

// ─── 5. ANÁLISE DO SOLO — Demonstração (SoilGrids / ISRIC) ───────────────────

const SOIL_DEMO = {
  clay: 32, sand: 45, silt: 23,
  organicCarbon: 2.1, ph: 5.8,
  bulkDensity: 1.35, depth: "0–30 cm",
};

export function SoilDemoSection() {
  return (
    <Card>
      <SectionTitle
        title="Análise do Solo"
        description="SoilGrids / ISRIC"
        action={
          <span className="inline-flex items-center gap-1 rounded-full border border-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            ◐ Demonstração
          </span>
        }
      />

      {/* Banner de demonstração */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/50 px-3 py-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide text-foreground">DEMONSTRAÇÃO — DADOS ILUSTRATIVOS</span>
          <br />
          Os valores abaixo são exemplos representativos, <em>não</em> dados reais do local.
          A integração com SoilGrids WCS está planejada para fase futura.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SoilMetric label="Argila" value={`${SOIL_DEMO.clay} %`} />
        <SoilMetric label="Areia" value={`${SOIL_DEMO.sand} %`} />
        <SoilMetric label="Silte" value={`${SOIL_DEMO.silt} %`} />
        <SoilMetric label="Carbono orgânico" value={`${SOIL_DEMO.organicCarbon} %`} />
        <SoilMetric label="pH" value={String(SOIL_DEMO.ph)} />
        <SoilMetric label="Densidade aparente" value={`${SOIL_DEMO.bulkDensity} g/cm³`} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" />
        <span>
          Profundidade: {SOIL_DEMO.depth} · Fonte prevista:{" "}
          <span className="font-medium">SoilGrids / ISRIC</span> · Status:{" "}
          <span className="font-medium">Integração planejada — SoilGrids WCS</span>
        </span>
      </div>
    </Card>
  );
}

function SoilMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-muted-foreground">{value}</div>
    </div>
  );
}

// ─── 6. FONTES DE DADOS — painel de status ─────────────────────────────────────

type IntegrationStatus =
  | { state: "loading" }
  | { state: "connected"; source: string; timestamp: string }
  | { state: "fallback"; reason: string }
  | { state: "demo" };

function statusFromSource(
  source: string | undefined,
  realSources: string[],
  timestamp?: string,
  fallbackReason?: string,
): IntegrationStatus {
  if (source === undefined) return { state: "loading" };
  if (realSources.includes(source)) return { state: "connected", source, timestamp: timestamp ?? "" };
  return { state: "fallback", reason: fallbackReason ?? "API indisponível ou sem chave" };
}

function IntegrationRow({
  icon: Icon,
  name,
  category,
  status,
}: {
  icon: React.ElementType;
  name: string;
  category: string;
  status: IntegrationStatus;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{name}</div>
          <div className="text-xs text-muted-foreground">{category}</div>
        </div>
      </div>
      <div className="shrink-0">
        {status.state === "loading" ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Verificando…
          </span>
        ) : status.state === "connected" ? (
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-3 w-3" /> Conectado
            </span>
            {status.timestamp && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {ts(status.timestamp)}
              </div>
            )}
          </div>
        ) : status.state === "fallback" ? (
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              <AlertTriangle className="h-3 w-3" /> Fallback
            </span>
            <div className="mt-0.5 text-[10px] text-muted-foreground max-w-[160px]">{status.reason}</div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            ◐ Demonstração
          </span>
        )}
      </div>
    </div>
  );
}

export function DataSourcesPanel({
  weather,
  waterGeo,
  routeData,
  elevation,
  loadingWeather,
  loadingWater,
  loadingRoute,
  loadingTerrain,
}: {
  weather: WeatherData | null;
  waterGeo: WaterGeoData | null;
  routeData: RouteData | null;
  elevation: ElevationData | null;
  loadingWeather: boolean;
  loadingWater: boolean;
  loadingRoute: boolean;
  loadingTerrain: boolean;
}) {
  const climateStatus: IntegrationStatus = loadingWeather
    ? { state: "loading" }
    : statusFromSource(weather?.source, ["open-meteo"], weather?.fetchedAt, "API temporariamente indisponível");

  const waterStatus: IntegrationStatus = loadingWater
    ? { state: "loading" }
    : statusFromSource(waterGeo?.source, ["overpass"], waterGeo?.fetchedAt, "API temporariamente indisponível");

  const routeStatus: IntegrationStatus = loadingRoute
    ? { state: "loading" }
    : routeData?.source === "openrouteservice"
    ? { state: "connected", source: "openrouteservice", timestamp: routeData.fetchedAt }
    : routeData?.source === "mock"
    ? { state: "fallback", reason: "ORS_API_KEY não configurada — usando cálculo euclidiano" }
    : { state: "fallback", reason: "Dados não carregados" };

  const terrainStatus: IntegrationStatus = loadingTerrain
    ? { state: "loading" }
    : elevation?.source === "opentopography"
    ? { state: "connected", source: "opentopography", timestamp: elevation.fetchedAt }
    : elevation?.source === "open-elevation"
    ? { state: "connected", source: "open-elevation", timestamp: elevation.fetchedAt }
    : elevation?.source === "mock"
    ? { state: "fallback", reason: "Ambas APIs indisponíveis — dados simulados" }
    : { state: "fallback", reason: "Dados não carregados" };

  return (
    <Card>
      <SectionTitle
        title="Fontes de Dados"
        description="Status das integrações com APIs externas em tempo real"
      />
      <IntegrationRow
        icon={Cloud}
        name="Open-Meteo"
        category="Clima"
        status={climateStatus}
      />
      <IntegrationRow
        icon={Waves}
        name="OpenStreetMap / Overpass"
        category="Água e geodados"
        status={waterStatus}
      />
      <IntegrationRow
        icon={Route}
        name="openrouteservice"
        category="Rotas"
        status={routeStatus}
      />
      <IntegrationRow
        icon={Mountain}
        name="OpenTopography"
        category="Relevo"
        status={terrainStatus}
      />
      <IntegrationRow
        icon={FlaskConical}
        name="SoilGrids / ISRIC"
        category="Solo"
        status={{ state: "demo" }}
      />
    </Card>
  );
}

// ─── 7. FATORES DE RISCO COM FONTES ──────────────────────────────────────────

const CATEGORY_META: Record<string, {
  icon: string;
  apiSource: string;
  apiLabel: string;
  isReal: (w: WeatherData | null, wg: WaterGeoData | null, el: ElevationData | null, rd: RouteData | null) => boolean;
}> = {
  weather: {
    icon: "🌧️",
    apiSource: "Open-Meteo",
    apiLabel: "open-meteo.com",
    isReal: (w) => w?.source === "open-meteo",
  },
  waterDistance: {
    icon: "💧",
    apiSource: "Overpass / OSM",
    apiLabel: "overpass-api.de",
    isReal: (_, wg) => wg?.source === "overpass",
  },
  terrain: {
    icon: "⛰️",
    apiSource: "OpenTopography",
    apiLabel: "opentopography.org",
    isReal: (_, _2, el) => el !== null && el.source !== "mock",
  },
  speed: {
    icon: "🚜",
    apiSource: "Sistema interno",
    apiLabel: "dados da operação",
    isReal: () => true,
  },
  operationType: {
    icon: "🌾",
    apiSource: "Sistema interno",
    apiLabel: "catálogo de operações",
    isReal: () => true,
  },
  history: {
    icon: "📋",
    apiSource: "Sistema interno",
    apiLabel: "histórico de alertas",
    isReal: () => true,
  },
};

export function RiskFactorsWithSources({
  breakdown,
  weather,
  waterGeo,
  elevation,
  routeData,
}: {
  breakdown: ScoreBreakdown;
  weather: WeatherData | null;
  waterGeo: WaterGeoData | null;
  elevation: ElevationData | null;
  routeData: RouteData | null;
}) {
  const sorted = [...breakdown.parts]
    .filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points);

  return (
    <Card>
      <SectionTitle
        title="Fatores de Risco — Origem dos Dados"
        description="De onde vêm os valores usados pelo Risk Engine"
      />
      <div className="space-y-3">
        {sorted.map((part) => {
          const meta = CATEGORY_META[part.category];
          if (!meta) return null;
          const real = meta.isReal(weather, waterGeo, elevation, routeData);
          return (
            <div key={part.category} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none">{meta.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-foreground">{part.label}</div>
                    <div className="text-xs text-muted-foreground">{part.detail}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-bold text-foreground">{part.points}</span>
                  <span className="text-xs text-muted-foreground">/{part.max} pts</span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                {real ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success">
                    <Wifi className="h-2.5 w-2.5" />
                    {meta.apiSource}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    <WifiOff className="h-2.5 w-2.5" />
                    {meta.apiSource} · fallback simulado
                  </span>
                )}
                <span className="text-muted-foreground">via {meta.apiLabel}</span>
              </div>
            </div>
          );
        })}

        {/* Solo (SoilGrids — demo) */}
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">🌱</span>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Solo</div>
                <div className="text-xs text-muted-foreground">Composição do solo — não incluído no score atual</div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">— / — pts</span>
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              ◐ SoilGrids / ISRIC · Demonstração
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

import { useEffect, useRef, useState } from "react";
import { CloudSun, Droplets, Wind, type LucideIcon } from "lucide-react";
import { Card, SectionTitle } from "@/components/app-layout";
import { getStoredSessionToken } from "@/lib/auth";
import { getWeather } from "@/lib/api/weather.functions";
import type { WeatherData } from "@/lib/external-data.types";

export function OperatorCurrentWeather({
  municipality,
  state,
}: {
  municipality: string;
  state: string;
}) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const requestKey = useRef("");

  useEffect(() => {
    const key = `${municipality.trim().toLowerCase()}:${state.trim().toLowerCase()}`;
    if (!municipality || !state || requestKey.current === key) return;
    requestKey.current = key;
    let cancelled = false;
    const token = getStoredSessionToken();
    if (!token) {
      setUnavailable(true);
      return;
    }
    setWeather(null);
    setUnavailable(false);
    void getWeather({ data: { token, municipality, state } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setUnavailable(true);
        setWeather(result.weather);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [municipality, state]);

  const value = (formatted?: string) =>
    weather ? formatted! : unavailable ? "Indisponível" : "Carregando...";

  return (
    <Card>
      <SectionTitle
        title="Condições atuais da operação"
        description="Clima atual da localização da operação"
      />
      <div className="grid grid-cols-3 gap-3">
        <QuickStatus
          icon={CloudSun}
          label="Temperatura atual"
          value={value(weather ? `${Math.round(weather.current.temperature)}°C` : undefined)}
        />
        <QuickStatus
          icon={Droplets}
          label="Precipitação atual"
          value={value(weather ? `${weather.current.precipitation.toFixed(1)} mm` : undefined)}
        />
        <QuickStatus
          icon={Wind}
          label="Vento atual"
          value={value(weather ? `${weather.current.windSpeed.toFixed(1)} km/h` : undefined)}
        />
      </div>
    </Card>
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
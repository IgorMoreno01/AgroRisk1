import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getStoredSessionToken, useAuth } from "./auth";
import {
  getRiskConfiguration,
  saveRiskConfiguration,
} from "./api/risk-config.functions";
import { DEFAULT_RISK_WEIGHTS, type RiskWeights } from "./risk-score";

export interface RiskConfiguration extends RiskWeights {
  updatedAt: string | null;
}

interface RiskConfigContextValue {
  configuration: RiskConfiguration;
  weights: RiskWeights;
  status: "loading" | "ready" | "error";
  error: string | null;
  isSaving: boolean;
  saveWeights: (climate: number) => Promise<{ ok: boolean; error?: string }>;
}

const DEFAULT_CONFIGURATION: RiskConfiguration = {
  ...DEFAULT_RISK_WEIGHTS,
  updatedAt: null,
};

const RiskConfigContext = createContext<RiskConfigContextValue | null>(null);

export function RiskConfigProvider({ children }: { children: ReactNode }) {
  const { profile, status: authStatus } = useAuth();
  const [configuration, setConfiguration] = useState<RiskConfiguration>(DEFAULT_CONFIGURATION);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("ready");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const requestVersion = useRef(0);
  const saving = useRef(false);

  const loadConfiguration = useCallback(async (background = false) => {
    if (saving.current) return;
    const version = ++requestVersion.current;
    const token = getStoredSessionToken();
    if (!token) {
      if (!background) {
        setConfiguration(DEFAULT_CONFIGURATION);
        setStatus("error");
        setError("Não foi possível carregar a configuração da sessão.");
      }
      return;
    }

    if (!background) {
      setStatus("loading");
      setError(null);
    }

    try {
      const result = await getRiskConfiguration({ data: { token } });
      if (version !== requestVersion.current) return;
      if (!result.ok) {
        if (!background) {
          setConfiguration(DEFAULT_CONFIGURATION);
          setStatus("error");
          setError(result.error);
        }
        return;
      }
      setConfiguration(result.configuration);
      setStatus("ready");
      setError(null);
    } catch {
      if (version !== requestVersion.current) return;
      if (!background) {
        setConfiguration(DEFAULT_CONFIGURATION);
        setStatus("error");
        setError("Não foi possível carregar a configuração. O padrão 50/50 está em uso.");
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (authStatus !== "ready" || !profile) {
      setConfiguration(DEFAULT_CONFIGURATION);
      setStatus("ready");
      setError(null);
      return;
    }

    void loadConfiguration();

    const refresh = () => {
      if (!cancelled && document.visibilityState === "visible") {
        void loadConfiguration(true);
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      requestVersion.current += 1;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [authStatus, loadConfiguration, profile]);

  const saveWeights = useCallback(async (climate: number) => {
    const operational = 100 - climate;
    const token = getStoredSessionToken();
    if (!token) return { ok: false, error: "Sessão não autorizada." };

    saving.current = true;
    const version = ++requestVersion.current;
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveRiskConfiguration({
        data: { token, climate, operational },
      });
      if (!result.ok) {
        if (version === requestVersion.current) setError(result.error);
        return { ok: false, error: result.error };
      }
      if (version === requestVersion.current) {
        setConfiguration(result.configuration);
        setStatus("ready");
      }
      return { ok: true };
    } catch {
      const message = "Não foi possível salvar a configuração.";
      if (version === requestVersion.current) setError(message);
      return { ok: false, error: message };
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      configuration,
      weights: {
        climate: configuration.climate,
        operational: configuration.operational,
      },
      status,
      error,
      isSaving,
      saveWeights,
    }),
    [configuration, error, isSaving, saveWeights, status],
  );

  return <RiskConfigContext.Provider value={value}>{children}</RiskConfigContext.Provider>;
}

export function useRiskConfig() {
  const context = useContext(RiskConfigContext);
  if (!context) throw new Error("useRiskConfig must be used within RiskConfigProvider");
  return context;
}
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, History, Loader2, Play, Save, Square, StickyNote } from "lucide-react";
import { Card, SectionTitle } from "@/components/app-layout";
import { getStoredSessionToken } from "@/lib/auth";
import {
  finishOperation,
  getOperationLog,
  saveOperationLogObservation,
  startOperation,
} from "@/lib/api/operation-logs.functions";
import type { OperationLog, OperationLogSnapshot } from "@/lib/operation-log-types";

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function durationBetween(log: OperationLog) {
  if (!log.startedAt) return "—";
  const end = log.finishedAt ? new Date(log.finishedAt) : new Date();
  const minutes = Math.max(0, Math.floor((end.getTime() - new Date(log.startedAt).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}min` : `${remainingMinutes}min`;
}

export function OperationRegistrationCard() {
  const [snapshot, setSnapshot] = useState<OperationLogSnapshot | null>(null);
  const [observation, setObservation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"start" | "observation" | "finish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getStoredSessionToken();
    if (!token) throw new Error("Sessão do Operador não encontrada.");
    const response = await getOperationLog({ data: { token } });
    if (!response.ok) throw new Error(response.error);
    setSnapshot(response.snapshot);
    setObservation(response.snapshot.activeLog?.observation ?? response.snapshot.latestLog?.observation ?? "");
  }, []);

  useEffect(() => {
    void refresh()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar o registro."))
      .finally(() => setLoading(false));
  }, [refresh]);

  const execute = async (
    action: "start" | "observation" | "finish",
    request: (token: string) => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setSaving(action);
    setError(null);
    setNotice(null);
    try {
      const token = getStoredSessionToken();
      if (!token) throw new Error("Sessão do Operador não encontrada.");
      const response = await request(token);
      if (!response.ok) throw new Error(response.error);
      await refresh();
      setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o registro.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <SectionTitle title="Registro da operação" description="Carregando registro persistido…" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando o PostgreSQL
        </div>
      </Card>
    );
  }

  const active = snapshot?.activeLog ?? null;
  const latest = active ?? snapshot?.latestLog ?? null;
  const isCompleted = !active && latest?.status === "completed";
  const history = (snapshot?.history ?? []).filter((log) => log.id !== active?.id);

  return (
    <Card>
      <SectionTitle
        title="Registro da operação"
        description={snapshot ? `Execução vinculada a ${snapshot.operationId} · ${snapshot.machineId}` : "Registro da execução atual"}
        action={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            active ? "bg-success/15 text-success" : isCompleted ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
          }`}>
            {active ? <Clock3 className="h-3.5 w-3.5" /> : isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            {active ? "Em andamento" : isCompleted ? "Concluída" : "Não iniciada"}
          </span>
        }
      />

      {latest && (
        <div className="mb-4 grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Início</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatTime(latest.startedAt)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Duração</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{durationBetween(latest)}</div>
          </div>
        </div>
      )}

      {active ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <StickyNote className="h-4 w-4 text-muted-foreground" /> Observações da operação
            </span>
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Descreva um problema, condição observada ou informação operacional relevante."
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => execute(
                "observation",
                (token) => saveOperationLogObservation({ data: { token, observation } }),
                "Observação salva.",
              )}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "observation" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar observação
            </button>
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => execute("finish", (token) => finishOperation({ data: { token } }), "Operação finalizada.")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "finish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Finalizar operação
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {isCompleted && latest.observation && (
            <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Observação preservada: </span>{latest.observation}
            </div>
          )}
          <button
            type="button"
            disabled={saving !== null || !snapshot}
            onClick={() => execute("start", (token) => startOperation({ data: { token } }), "Operação iniciada.")}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isCompleted ? "Iniciar nova execução" : "Iniciar operação"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mt-3 text-sm text-success">{notice}</p>}

      {history.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Registros recentes
          </div>
          <div className="space-y-2">
            {history.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{log.status === "completed" ? "Operação concluída" : "Registro de operação"}</div>
                  {log.observation && <div className="truncate text-xs text-muted-foreground">{log.observation}</div>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{durationBetween(log)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
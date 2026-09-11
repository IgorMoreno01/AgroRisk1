import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sprout, LayoutDashboard, Tractor, Users, ShieldCheck, ArrowRight, Lock, Mail } from "lucide-react";
import { profiles } from "@/lib/mock-data";
import type { ProfileId } from "@/lib/mock-data";
import { useState, useEffect } from "react";
import { useAuth, defaultRouteFor } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AgroRisk · Login" },
      { name: "description", content: "Plataforma de gestão de risco agrícola — faça login para acessar." },
    ],
  }),
  component: LoginScreen,
});

const icons = {
  gestor: LayoutDashboard,
  operador: Tractor,
  consultor: Users,
  admin: ShieldCheck,
} as const;

function LoginScreen() {
  const navigate = useNavigate();
  const { login, profile: current, logout } = useAuth();
  const [selected, setSelected] = useState<ProfileId | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current) {
      // Already logged in — go straight to default route.
      navigate({ to: defaultRouteFor(current) });
    }
  }, [current, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const result = await login(selected, email, password);
    if (!result.ok) {
      setError(result.error ?? "Não foi possível entrar.");
      return;
    }
    setError(null);
    navigate({ to: defaultRouteFor(selected) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sprout className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">AgroRisk</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Plataforma de monitoramento, score de risco e recomendações para operações
            agrícolas. Selecione seu perfil e informe e-mail e senha para entrar.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid gap-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              1 · Selecione o perfil
            </div>
            {profiles.map((p) => {
              const Icon = icons[p.id];
              const active = selected === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelected(p.id as ProfileId);
                    setError(null);
                  }}
                  className={
                    "group flex items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition " +
                    (active
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/60")
                  }
                >
                  <div
                    className={
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-primary")
                    }
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground">{p.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{p.description}</div>
                  </div>
                  {active && <ArrowRight className="h-5 w-5 text-primary" />}
                </button>
              );
            })}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2 · Informe as credenciais
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                E-mail
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="nome@agrorisk.demo"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                  autoComplete="username"
                />
              </div>
            </div>

            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="profile-label">
                Perfil selecionado
              </label>
              <div
                id="profile-label"
                className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {selected
                  ? profiles.find((p) => p.id === selected)?.label
                  : "Nenhum perfil selecionado"}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                Senha
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Digite sua senha"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!selected || !email || !password}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Entrar
              <ArrowRight className="h-4 w-4" />
            </button>

            {current && (
              <button
                type="button"
                onClick={logout}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Encerrar sessão atual ({current})
              </button>
            )}
          </form>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Versão demonstrativa · Dados simulados · Acesso autenticado por conta
        </p>
      </div>
    </div>
  );
}

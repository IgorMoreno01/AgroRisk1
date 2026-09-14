import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  LayoutDashboard,
  Lock,
  Mail,
  ShieldCheck,
  Sprout,
  Tractor,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { profiles } from "@/lib/mock-data";
import type { ProfileId } from "@/lib/mock-data";
import { defaultRouteFor, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AgroRisk · Login" },
      {
        name: "description",
        content: "Plataforma de gestão de risco agrícola — faça login para acessar.",
      },
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
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current) navigate({ to: defaultRouteFor(current) });
  }, [current, navigate]);

  useEffect(() => {
    if (selected) emailRef.current?.focus();
  }, [selected]);

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
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <header className="mb-9 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sprout className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">AgroRisk</h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            Plataforma de monitoramento, score de risco e recomendações para operações agrícolas.
            <br className="hidden sm:block" /> Selecione seu perfil para continuar.
          </p>
        </header>

        <section aria-labelledby="profile-heading">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Etapa 1
              </p>
              <h2 id="profile-heading" className="mt-1 text-base font-semibold text-foreground">
                Selecione seu perfil
              </h2>
            </div>
            {selected && (
              <span className="text-xs font-medium text-primary" aria-live="polite">
                Perfil selecionado
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => {
              const Icon = icons[p.id];
              const active = selected === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelected(p.id as ProfileId);
                    setError(null);
                  }}
                  className={
                    "group flex min-h-[92px] items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60 " +
                    (active ? "border-primary ring-2 ring-primary/25" : "border-border")
                  }
                >
                  <div
                    className={
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg " +
                      (active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")
                    }
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground">{p.label}</div>
                    <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {p.description}
                    </div>
                  </div>
                  {active ? (
                    <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {selected && (
          <form
            onSubmit={handleSubmit}
            aria-labelledby="credentials-heading"
            className="mt-7 flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-[opacity,transform] duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Etapa 2
                </p>
                <h2
                  id="credentials-heading"
                  className="mt-1 text-base font-semibold text-foreground"
                >
                  Confirme suas credenciais
                </h2>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {profiles.find((p) => p.id === selected)?.label}
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                E-mail
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  ref={emailRef}
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

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                Senha
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
                <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!email || !password}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Entrar <ArrowRight className="h-4 w-4" />
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
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Versão demonstrativa · Dados simulados · Acesso autenticado por conta
        </p>
      </div>
    </main>
  );
}

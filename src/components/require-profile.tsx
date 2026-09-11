import { useAuth } from "@/lib/auth";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function RequireProfile({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const { profile, status, canAccess } = useAuth();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const target = path ?? currentPath;
  const check = canAccess(target) ? "allowed" : "denied";

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <ShieldAlert className="mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">Sessão não iniciada</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Faça login para acessar a plataforma AgroRisk.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  if (check === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <ShieldAlert className="mb-4 h-10 w-10 text-danger" />
        <h1 className="text-lg font-semibold text-foreground">
          Acesso restrito ao perfil autorizado.
        </h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Seu perfil ({profile}) não tem permissão para visualizar esta tela.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Voltar ao login
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

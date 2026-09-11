import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell, LogOut, UserCircle, Repeat, ShieldCheck, Building2, CheckCheck,
  AlertTriangle, MapPin, Tractor, Briefcase, Activity, Check, Eye,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  operations, machines, clients,
  type AlertCriticality, type AlertStatus, type ProfileId,
} from "@/lib/mock-data";
import { useAuth, profileLabels, userFor, clientFor } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { getProfileAlerts, pendingCount, type ProfileAlert } from "@/lib/profile-alerts";

// ---------- Alerts ----------
const critColor: Record<AlertCriticality, string> = {
  alta: "bg-danger/15 text-danger border-danger/30",
  média: "bg-warning/15 text-warning border-warning/30",
  baixa: "bg-success/15 text-success border-success/30",
};

const statusColor: Record<AlertStatus, string> = {
  aberto: "bg-danger/10 text-danger",
  "em análise": "bg-warning/10 text-warning",
  resolvido: "bg-success/10 text-success",
};

function AlertRow({ a, read }: { a: ProfileAlert; read?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col gap-1 border-b border-border p-3 last:border-b-0 hover:bg-muted/40",
      read && "opacity-60",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{a.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {a.context} · {a.detail}
          </div>
        </div>
        <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", critColor[a.criticality])}>
          {a.criticality}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{a.time}</span>
        <span className={cn("rounded px-1.5 py-0.5 font-medium", statusColor[a.status])}>{a.status}</span>
      </div>
    </div>
  );
}

export function HeaderAlerts({ bundleOverride }: { bundleOverride?: ReturnType<typeof getProfileAlerts> }) {
  const { profile } = useAuth();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const bundle = useMemo(
    () => bundleOverride ?? (profile && profile !== "operador" ? getProfileAlerts(profile) : null),
    [bundleOverride, profile],
  );
  const alerts = bundle?.alerts ?? [];
  const recent = alerts.slice(0, 5);
  const pending = bundle ? pendingCount(alerts, readIds) : 0;

  const markAllRead = () => {
    setReadIds(new Set(alerts.map((a) => a.id)));
  };

  const goToSection = () => {
    setMenuOpen(false);
    if (!bundle) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(bundle.sectionId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#${bundle.sectionId}`);
      } else {
        setAllOpen(true);
      }
    });
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Abrir notificações de alertas"
            className="relative cursor-pointer rounded-lg border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Bell className="h-4 w-4" />
            {pending > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground">
                {pending}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[380px] p-0">
          <div className="flex items-center justify-between px-3 py-2">
            <DropdownMenuLabel className="p-0 text-sm">Alertas recentes</DropdownMenuLabel>
            <span className="text-[11px] text-muted-foreground">{pending} pendentes</span>
          </div>
          <DropdownMenuSeparator className="my-0" />
          <div className="max-h-[360px] overflow-y-auto">
            {recent.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Sem alertas no momento.</div>
            ) : (
              recent.map((a) => <AlertRow key={a.id} a={a} read={readIds.has(a.id)} />)
            )}
          </div>
          <DropdownMenuSeparator className="my-0" />
          <div className="flex items-center justify-between gap-2 p-2">
            <button
              onClick={markAllRead}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todos como lidos
            </button>
            <button
              onClick={goToSection}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Ver todos os alertas
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-danger" />
              {bundle?.sectionTitle ?? "Alertas"}
            </DialogTitle>
            <DialogDescription>
              {alerts.length} alertas simulados para o perfil atual.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {alerts.map((a) => <AlertRow key={a.id} a={a} read={readIds.has(a.id)} />)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- User menu ----------
type ProfileContext = {
  scope: string;
  rows: { icon: typeof MapPin; label: string; value: string }[];
  permissions: string[];
};

export interface HeaderAccountContext {
  userId: string;
  name: string;
  clientName?: string;
  clientLocation?: string;
  operationId?: string;
  machineName?: string;
  areaName?: string;
}

function buildContext(profile: ProfileId, account?: HeaderAccountContext): ProfileContext {
  if (profile === "operador") {
    return {
      scope: "Visão restrita à sua operação atual",
      rows: [
        { icon: Building2, label: "Fazenda",       value: account?.clientName ?? "—" },
        { icon: Activity,  label: "Operação",      value: account?.operationId ?? "—" },
        { icon: Tractor,   label: "Equipamento",   value: account?.machineName ?? "—" },
        { icon: MapPin,    label: "Área atual",    value: account?.areaName ?? "—" },
      ],
      permissions: [
        "Visualizar própria operação",
        "Visualizar alertas da operação",
        "Visualizar recomendações práticas",
        "Confirmar ciência das recomendações",
      ],
    };
  }
  const user = userFor(profile);
  const client = clientFor(user);
  if (profile === "gestor") {
    return {
      scope: "Visão gerencial da operação",
      rows: [
        { icon: Building2, label: "Cliente",  value: client?.name ?? "—" },
        { icon: MapPin,    label: "Região",   value: client?.location ?? "—" },
        { icon: Tractor,   label: "Frota",    value: `${client?.machines ?? 0} equipamentos` },
      ],
      permissions: [
        "Visualizar dashboard gerencial",
        "Visualizar ranking de risco",
        "Visualizar equipamentos",
        "Visualizar áreas críticas",
        "Visualizar recomendações prioritárias",
      ],
    };
  }
  if (profile === "consultor") {
    const selected = clients[0];
    return {
      scope: "Análise consolidada por cliente",
      rows: [
        { icon: Briefcase, label: "Carteira",          value: `${clients.length} clientes` },
        { icon: Building2, label: "Cliente atual",     value: selected?.name ?? "—" },
        { icon: MapPin,    label: "Região",            value: selected?.location ?? "—" },
      ],
      permissions: [
        "Visualizar clientes",
        "Top equipamentos em risco",
        "Áreas críticas",
        "Explicação para o cliente",
        "Recomendações preventivas",
      ],
    };
  }
  // admin
  return {
    scope: "Acesso total ao MVP",
    rows: [
      { icon: Briefcase, label: "Clientes",     value: `${clients.length}` },
      { icon: Tractor,   label: "Equipamentos", value: `${machines.length}` },
      { icon: Activity,  label: "Operações",    value: `${operations.length}` },
    ],
    permissions: [
      "Visualizar todos os clientes",
      "Visualizar todas as máquinas",
      "Visualizar todas as áreas",
      "Visualizar todos os alertas",
      "Scores, rankings e recomendações",
      "Acessar todas as telas simuladas",
    ],
  };
}

export function HeaderUserMenu({ account }: { account?: HeaderAccountContext }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);

  const fallbackUser = profile && profile !== "operador" ? userFor(profile) : undefined;
  const fallbackClient = clientFor(fallbackUser);
  const name = account?.name ?? fallbackUser?.name ?? "Usuário";
  const label = profile ? profileLabels[profile] : "—";
  const ctx = profile ? buildContext(profile, account) : null;

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Abrir perfil de ${name}`}
            title={`${name} · ${label}`}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-offset-background transition-all hover:opacity-90 hover:ring-2 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {name.charAt(0)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-80 p-0 animate-in fade-in-0 zoom-in-95"
        >
          {/* Top — avatar + name + badge */}
          <div className="flex items-center gap-3 border-b border-border p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
              {name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{name}</div>
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                <ShieldCheck className="h-3 w-3" />
                {label}
              </div>
            </div>
          </div>

          {/* Context block */}
          {ctx && (
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contexto
              </div>
              <div className="space-y-1.5">
                {ctx.rows.map((r) => {
                  const Icon = r.icon;
                  return (
                    <div key={r.label} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {r.label}
                      </span>
                      <span className="max-w-[60%] truncate text-right font-medium text-foreground">
                        {r.value}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] italic text-muted-foreground">
                Escopo: {ctx.scope}
              </div>
            </div>
          )}

          {/* Permissions */}
          {ctx && (
            <div className="border-b border-border px-4 py-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Permissões principais
              </div>
              <ul className="space-y-1">
                {ctx.permissions.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-[11px] text-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="p-1">
            <DropdownMenuItem onSelect={() => setAccountOpen(true)} className="cursor-pointer">
              <UserCircle className="mr-2 h-4 w-4" />
              Minha conta
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleLogout} className="cursor-pointer">
              <Repeat className="mr-2 h-4 w-4" />
              Trocar perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="cursor-pointer text-danger focus:bg-danger/10 focus:text-danger"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair do sistema
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Minha conta
            </DialogTitle>
            <DialogDescription>
              {profile === "operador" ? "Dados da conta autenticada." : "Dados do usuário logado."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Row label="Nome" value={name} />
            <Row label="Perfil" value={label} />
            <Row label="ID do usuário" value={account?.userId ?? fallbackUser?.id ?? "—"} />
            {(account?.clientName || fallbackClient) && (
              <Row
                label="Cliente / Fazenda"
                value={account
                  ? `${account.clientName ?? "—"} · ${account.clientLocation ?? "—"}`
                  : `${fallbackClient!.name} · ${fallbackClient!.location}`}
              />
            )}
            <div>
              <div className="text-xs font-medium text-muted-foreground">Permissões principais</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(ctx?.permissions ?? fallbackUser?.permissions ?? []).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-foreground">
                    <Eye className="h-3 w-3 text-muted-foreground" />
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => { setAccountOpen(false); handleLogout(); }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair do sistema
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

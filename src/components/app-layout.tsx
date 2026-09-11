import { useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Tractor,
  Users,
  ShieldCheck,
  LogOut,
  Sprout,
  Search,
  ChevronsLeft,
  ChevronsRight,
  Bell,
  Lightbulb,
  Trophy,
  MapPin,
  Wrench,
  Briefcase,
  MessageSquare,
  Activity,
  Database,
  Layers,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, userFor, clientFor, profileLabels } from "@/lib/auth";
import type { ProfileId } from "@/lib/mock-data";
import { HeaderAlerts, HeaderUserMenu } from "@/components/header-menus";
import type { ProfileAlertsBundle } from "@/lib/profile-alerts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = {
  label: string;
  icon: LucideIcon;
  to?: string;       // route to navigate to (optional)
  href?: string;     // hash anchor on the current page (optional)
  disabled?: boolean;
};

const NAV_BY_PROFILE: Record<ProfileId, NavItem[]> = {
  operador: [
    { label: "Painel",              icon: LayoutDashboard, to: "/operador",  href: "#topo" },
    { label: "Minha operação",      icon: Activity,        href: "#operacao" },
    { label: "Alertas",             icon: Bell,            href: "#alertas-operacao" },
    { label: "Recomendações",       icon: Lightbulb,       href: "#recomendacoes" },
    { label: "Registro da operação", icon: Wrench,         href: "#registro-operacao" },
  ],
  gestor: [
    { label: "Dashboard",           icon: LayoutDashboard, to: "/gestor", href: "#topo" },
    { label: "Ranking",             icon: Trophy,          href: "#ranking" },
    { label: "Equipamentos",        icon: Tractor,         href: "#ranking" },
    { label: "Áreas",               icon: MapPin,          href: "#ranking" },
    { label: "Recomendações",       icon: Lightbulb,       href: "#recomendacoes" },
    { label: "Alertas gerenciais",  icon: Bell,            href: "#alertas-gerenciais" },
  ],
  consultor: [
    { label: "Clientes",                icon: Briefcase,     to: "/consultor", href: "#clientes" },
    { label: "Análise do cliente",      icon: Activity,      href: "#analise" },
    { label: "Equipamentos em risco",   icon: Tractor,       href: "#equipamentos-risco" },
    { label: "Áreas críticas",          icon: MapPin,        href: "#areas-criticas" },
    { label: "Recomendações",           icon: Lightbulb,     href: "#recomendacoes" },
    { label: "Explicação para cliente", icon: MessageSquare, href: "#explicacao" },
    { label: "Alertas do cliente",      icon: Bell,          href: "#alertas-cliente" },
  ],
  admin: [
    { label: "Visão geral",   icon: ShieldCheck, to: "/admin", href: "#visao-geral" },
    { label: "Rankings",      icon: Trophy,      to: "/admin", href: "#rankings" },
    { label: "Scores",        icon: Layers,      to: "/admin", href: "#scores" },
    { label: "Recomendações", icon: Lightbulb,   to: "/admin", href: "#recs" },
    { label: "Clientes",      icon: Briefcase,   to: "/admin", href: "#clients" },
    { label: "Máquinas",      icon: Tractor,     to: "/admin", href: "#machines" },
    { label: "Áreas",         icon: MapPin,      to: "/admin", href: "#areas" },
    { label: "Operações",     icon: Wrench,      to: "/admin", href: "#operations" },
    { label: "Alertas",       icon: Bell,        to: "/admin", href: "#alerts" },
    { label: "Motor de risco", icon: SlidersHorizontal, to: "/admin", href: "#motor-risco" },
  ],
};

const SEARCH_BY_PROFILE: Record<ProfileId, string | null> = {
  operador:  null,
  gestor:    "Buscar máquinas, áreas, operações...",
  consultor: "Buscar clientes, fazendas, máquinas...",
  admin:     "Buscar clientes, máquinas, áreas, alertas...",
};

const SIDEBAR_KEY = "agrorisk:sidebar-collapsed";

export interface AppLayoutAccount {
  userId: string;
  name: string;
  clientName?: string;
  clientLocation?: string;
  operationId?: string;
  machineName?: string;
  areaName?: string;
  operationStatus?: string;
  lastUpdate?: string;
}

function OperatorContext({ account }: { account?: AppLayoutAccount }) {
  if (!account?.operationId) return null;
  return (
    <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] text-muted-foreground lg:flex">
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" />
      <span className="font-medium text-foreground">{account.operationId}</span>
      <span className="text-border">•</span>
      <span>{account.areaName ?? "Área atual"}</span>
      <span className="text-border">•</span>
      <span className="text-success">{account.operationStatus ?? "Em andamento"}</span>
      <span className="text-border">•</span>
      <span>Atualizado {account.lastUpdate ?? "há instantes"}</span>
    </div>
  );
}

export function AppLayout({
  title,
  subtitle,
  account,
  alerts,
  children,
}: {
  title: string;
  subtitle?: string;
  account?: AppLayoutAccount;
  alerts?: ProfileAlertsBundle;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, canAccess, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = profile ? NAV_BY_PROFILE[profile] : [];
  const searchPlaceholder = profile ? SEARCH_BY_PROFILE[profile] : null;
  const fallbackUser = profile && profile !== "operador" ? userFor(profile) : undefined;
  const fallbackClient = clientFor(fallbackUser);
  const user = account ? { name: account.name } : fallbackUser;
  const clientName = account?.clientName ?? fallbackClient?.name;

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(SIDEBAR_KEY) : null;
    if (saved === "1") setCollapsed(true);
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  // Hash ativo (atualizado em navegação e via clique)
  const [activeHash, setActiveHash] = useState<string>("");
  useEffect(() => {
    const sync = () => setActiveHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);

  const isActive = (item: NavItem) => {
    // Item ativo: rota corresponde E (sem hash ou hash bate)
    if (item.to && pathname !== item.to) return false;
    if (item.href) return activeHash === item.href;
    return !!item.to && pathname === item.to;
  };

  const scrollToHash = (hash: string) => {
    const id = hash.replace(/^#/, "");
    // Atualiza hash de forma que dispare 'hashchange' (admin/outros escutam para trocar tab)
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    setActiveHash(hash);
    // Topo do documento
    if (id === "topo") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Tenta achar a seção; se ainda não montou (ex: troca de tab), repete
    const tryScroll = (attempts = 0) => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (attempts < 12) {
        setTimeout(() => tryScroll(attempts + 1), 60);
      }
    };
    requestAnimationFrame(() => tryScroll());
  };

  const handleNavClick = (
    e: React.MouseEvent<HTMLElement>,
    item: NavItem,
  ) => {
    // Se item tem rota diferente, navega para ela e depois aplica hash
    if (item.to && pathname !== item.to) {
      e.preventDefault();
      navigate({ to: item.to });
      if (item.href) {
        // espera mount da nova rota antes de scrollar
        setTimeout(() => scrollToHash(item.href!), 120);
      }
      return;
    }
    if (item.href) {
      e.preventDefault();
      scrollToHash(item.href);
    }
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item);
    const baseClass = cn(
      "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
      collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
      item.disabled
        ? "cursor-not-allowed text-sidebar-foreground/40"
        : active
        ? "bg-sidebar-accent text-sidebar-accent-foreground cursor-pointer"
        : "cursor-pointer text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    );

    // Bloqueia rotas sem permissão (sem renderizar)
    if (item.to && !canAccess(item.to)) return null;

    let node: ReactNode;
    if (item.disabled) {
      node = (
        <div className={baseClass} aria-disabled="true">
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </div>
      );
    } else {
      node = (
        <button
          type="button"
          onClick={(e) => handleNavClick(e, item)}
          className={baseClass}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </button>
      );
    }

    if (collapsed || item.disabled) {
      return (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>{node as any}</TooltipTrigger>
          <TooltipContent side="right">
            {item.disabled ? "Funcionalidade prevista para versão futura" : item.label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return <div key={item.label}>{node}</div>;
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        {/* Sidebar */}
        <aside
          className={cn(
            "hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out md:flex",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <div
            className={cn(
              "flex h-16 items-center gap-2 border-b border-sidebar-border",
              collapsed ? "justify-center px-2" : "px-5",
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Sprout className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="truncate text-base font-semibold">AgroRisk</div>
                <div className="truncate text-[11px] text-sidebar-foreground/60">
                  Gestão de Risco Agrícola
                </div>
              </div>
            )}
          </div>

          {user && (collapsed ? (
            <div className="flex justify-center border-b border-sidebar-border px-2 py-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex h-8 w-8 cursor-default items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                    {user.name.charAt(0)}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="text-xs font-medium">{user.name}</div>
                  <div className="text-[10px] opacity-70">{profile ? profileLabels[profile] : ""}</div>
                  {clientName && <div className="text-[10px] opacity-70">{clientName}</div>}
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="border-b border-sidebar-border px-5 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Perfil ativo
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-sidebar-foreground">
                    {user.name}
                  </div>
                  <div className="truncate text-[11px] text-sidebar-foreground/60">
                    {profile ? profileLabels[profile] : ""}
                  </div>
                </div>
              </div>
              <div className="mt-1.5 truncate text-[11px] text-sidebar-foreground/60">
                {clientName ?? "AgroRisk"}
              </div>
            </div>
          ))}

          <div className={cn("flex border-b border-sidebar-border", collapsed ? "justify-center px-2 py-2" : "justify-end px-3 py-2")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? "Expandir sidebar" : "Minimizar sidebar"}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                >
                  {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? "Expandir menu" : "Minimizar menu"}
              </TooltipContent>
            </Tooltip>
          </div>

          <nav className={cn("flex-1 space-y-1 py-4", collapsed ? "px-2" : "px-3")}>
            {!collapsed && (
              <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Navegação
              </div>
            )}
            {navItems.map(renderNavItem)}
          </nav>

          <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    aria-label="Sair"
                    className="flex w-full cursor-pointer items-center justify-center rounded-lg px-2 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sair</TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleLogout}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            )}
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-card/80 px-6 backdrop-blur">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>

            {searchPlaceholder ? (
              <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground lg:flex">
                <Search className="h-4 w-4" />
                <input
                  placeholder={searchPlaceholder}
                  className="w-72 bg-transparent outline-none placeholder:text-muted-foreground/70"
                />
              </div>
            ) : profile === "operador" ? (
              <OperatorContext account={account} />
            ) : null}

            <HeaderAlerts bundleOverride={alerts} />

            <div className="border-l border-border pl-2">
              <HeaderUserMenu account={account} />
            </div>
          </header>

          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

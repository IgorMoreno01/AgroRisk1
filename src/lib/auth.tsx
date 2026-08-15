import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { users, clients, type ProfileId, type User, type Client } from "./mock-data";
import { signIn, verifySession } from "./auth.functions";

export const profileLabels: Record<ProfileId, string> = {
  gestor: "Gestor",
  operador: "Operador",
  consultor: "Consultor / Corretor",
  admin: "Admin / Sompo",
};

export function userFor(profile: ProfileId): User | undefined {
  return users.find((u) => u.profile === profile);
}

export function clientFor(user?: User): Client | undefined {
  return user?.clientId ? clients.find((c) => c.id === user.clientId) : undefined;
}

const STORAGE_KEY = "agrorisk.session";

// Landing routes are only used for post-login navigation UX. The authoritative
// permission list always comes from the server-verified session below.
const DEFAULT_ROUTE: Record<ProfileId, string> = {
  gestor: "/gestor",
  operador: "/operador",
  consultor: "/consultor",
  admin: "/admin",
};

interface AuthContextValue {
  profile: ProfileId | null;
  status: "loading" | "ready";
  login: (profile: ProfileId, password: string) => Promise<boolean>;
  logout: () => void;
  canAccess: (path: string) => boolean;
  allowedRoutes: string[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileId | null>(null);
  const [allowedRoutes, setAllowedRoutes] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token: string | null = null;
      try {
        token = localStorage.getItem(STORAGE_KEY);
      } catch {}

      if (!token) {
        if (!cancelled) setStatus("ready");
        return;
      }

      try {
        const result = await verifySession({ data: { token } });
        if (cancelled) return;
        if (result.ok) {
          setProfile(result.profile as ProfileId);
          setAllowedRoutes(result.allowedRoutes);
        } else {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }
      } catch {}
      if (!cancelled) setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (p: ProfileId, password: string) => {
    try {
      const result = await signIn({ data: { profile: p, password } });
      if (!result.ok) return false;
      setProfile(result.profile as ProfileId);
      setAllowedRoutes(result.allowedRoutes);
      try {
        localStorage.setItem(STORAGE_KEY, result.token);
      } catch {}
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setProfile(null);
    setAllowedRoutes([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("agrorisk.auth");
    } catch {}
  };

  const canAccess = (path: string) => allowedRoutes.includes(path);

  return (
    <AuthContext.Provider
      value={{ profile, status, login, logout, canAccess, allowedRoutes }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function defaultRouteFor(profile: ProfileId): string {
  return DEFAULT_ROUTE[profile];
}

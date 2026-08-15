import process from "node:process";

// Server-only authentication logic. The .server.ts suffix keeps this file
// (and the credentials/permissions below) out of the client bundle.

export type ProfileId = "gestor" | "operador" | "consultor" | "admin";

const PASSWORDS: Record<ProfileId, string> = {
  gestor: "gestor123",
  operador: "operador123",
  consultor: "consultor123",
  admin: "admin123",
};

const ALLOWED_ROUTES: Record<ProfileId, string[]> = {
  gestor: ["/gestor"],
  operador: ["/operador"],
  consultor: ["/consultor"],
  admin: ["/admin", "/gestor", "/operador", "/consultor"],
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env["AUTH_SESSION_SECRET"] ?? "agrorisk-dev-session-secret";
}

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

export interface Session {
  profile: ProfileId;
  allowedRoutes: string[];
}

export async function createSession(
  profile: string,
  password: string,
): Promise<{ token: string; session: Session } | null> {
  if (!Object.prototype.hasOwnProperty.call(PASSWORDS, profile)) return null;
  const id = profile as ProfileId;
  if (PASSWORDS[id] !== password) return null;

  const payload = base64url(
    new TextEncoder().encode(JSON.stringify({ p: id, exp: Date.now() + SESSION_TTL_MS })),
  );
  const token = `${payload}.${await hmac(payload)}`;
  return { token, session: { profile: id, allowedRoutes: ALLOWED_ROUTES[id] } };
}

export async function readSession(token: string): Promise<Session | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if ((await hmac(payload)) !== signature) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as {
      p?: string;
      exp?: number;
    };
    if (!data.p || !data.exp || data.exp < Date.now()) return null;
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_ROUTES, data.p)) return null;
    const id = data.p as ProfileId;
    return { profile: id, allowedRoutes: ALLOWED_ROUTES[id] };
  } catch {
    return null;
  }
}

export async function authorize(token: string, path: string): Promise<Session | null> {
  const session = await readSession(token);
  if (!session) return null;
  return session.allowedRoutes.includes(path) ? session : null;
}

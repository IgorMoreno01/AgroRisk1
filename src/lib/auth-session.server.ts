import { timingSafeEqual } from "node:crypto";
import process from "node:process";

export type ProfileId = "gestor" | "operador" | "consultor" | "admin";

const ALLOWED_ROUTES: Record<ProfileId, string[]> = {
  gestor: ["/gestor"],
  operador: ["/operador"],
  consultor: ["/consultor"],
  admin: ["/admin", "/gestor", "/consultor"],
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não está configurado.");
  return secret;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(signature));
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export interface Session {
  userId: string;
  profile: ProfileId;
  email: string;
  globalScope: boolean;
  linkedOperatorId: string | null;
  clientIds: string[] | null;
  allowedRoutes: string[];
}

export type SignInResult =
  | { ok: true; token: string; session: Session }
  | {
      ok: false;
      reason: "INVALID_CREDENTIALS" | "PROFILE_MISMATCH" | "INACTIVE_ACCOUNT" | "INVALID_SCOPE";
    };

export async function createSession(
  profile: string,
  email: string,
  password: string,
): Promise<SignInResult> {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_ROUTES, profile)) {
    return { ok: false, reason: "PROFILE_MISMATCH" };
  }
  const { authenticateAccount } = await import("./auth-account.server");
  const authenticated = await authenticateAccount(profile as ProfileId, email, password);
  if (!authenticated.ok) return authenticated;
  const account = authenticated.account;
  const payload = base64url(
    new TextEncoder().encode(JSON.stringify({
      u: account.userId,
      exp: Date.now() + SESSION_TTL_MS,
    })),
  );
  const token = `${payload}.${await hmac(payload)}`;
  return {
    ok: true,
    token,
    session: { ...account, allowedRoutes: ALLOWED_ROUTES[account.profile] },
  };
}

export async function readSession(token: string): Promise<Session | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !signaturesMatch(await hmac(payload), signature)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as {
      u?: string;
      exp?: number;
    };
    if (!data.u || !data.exp || data.exp < Date.now()) return null;
    const { loadAuthorizedAccount } = await import("./auth-account.server");
    const account = await loadAuthorizedAccount(data.u);
    if (!account) return null;
    return {
      ...account,
      allowedRoutes: ALLOWED_ROUTES[account.profile],
    };
  } catch {
    return null;
  }
}

export async function authorize(token: string, path: string): Promise<Session | null> {
  const session = await readSession(token);
  return session?.allowedRoutes.includes(path) ? session : null;
}
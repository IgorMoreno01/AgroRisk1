import postgres from "postgres";
import type { ProfileId } from "./auth-session.server";
import { cacheOrFetch } from "./cache.server";

declare const Bun: {
  password: {
    verify(password: string, hash: string): Promise<boolean>;
  };
};

let client: ReturnType<typeof postgres> | undefined;

function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está configurada para autenticação.");
  client ??= postgres(databaseUrl, { max: 3, prepare: false });
  return client;
}

export type AuthenticationFailure =
  | "INVALID_CREDENTIALS"
  | "PROFILE_MISMATCH"
  | "INACTIVE_ACCOUNT"
  | "INVALID_SCOPE";

export interface AuthenticatedAccount {
  userId: string;
  profile: ProfileId;
  email: string;
  globalScope: boolean;
  linkedOperatorId: string | null;
  clientIds: string[] | null;
}

export async function authenticateAccount(
  selectedProfile: ProfileId,
  email: string,
  password: string,
): Promise<
  | { ok: true; account: AuthenticatedAccount }
  | { ok: false; reason: AuthenticationFailure }
> {
  const rows = await db()`
    SELECT u.id, u.profile, u.email, u.password_hash, u.status,
      u.global_scope, u.linked_operator_id,
      count(s.client_id)::int AS scope_count,
      coalesce(array_agg(s.client_id ORDER BY s.client_id)
        FILTER (WHERE s.client_id IS NOT NULL), ARRAY[]::text[]) AS client_ids
    FROM agrorisk.users u
    LEFT JOIN agrorisk.user_client_scopes s ON s.user_id = u.id
    WHERE lower(u.email) = lower(${email.trim()})
    GROUP BY u.id
    LIMIT 1
  `;
  const row = rows[0];
  if (!row?.password_hash || !row.email) return { ok: false, reason: "INVALID_CREDENTIALS" };
  if (row.profile !== selectedProfile) return { ok: false, reason: "PROFILE_MISMATCH" };
  if (row.status !== "active") return { ok: false, reason: "INACTIVE_ACCOUNT" };
  if (!String(row.password_hash).startsWith("$argon2id$") ||
      !await Bun.password.verify(password, String(row.password_hash))) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  const hasValidScope =
    (row.profile === "admin" && row.global_scope === true) ||
    ((row.profile === "gestor" || row.profile === "consultor") && Number(row.scope_count) > 0) ||
    (row.profile === "operador" && row.linked_operator_id === row.id);
  if (!hasValidScope) return { ok: false, reason: "INVALID_SCOPE" };

  return {
    ok: true,
    account: {
      userId: String(row.id),
      profile: row.profile as ProfileId,
      email: String(row.email),
      globalScope: row.global_scope === true,
      linkedOperatorId: row.linked_operator_id ? String(row.linked_operator_id) : null,
      clientIds: row.profile === "admin"
        ? null
        : [...(row.client_ids as string[])].map(String),
    },
  };
}

export async function loadAuthorizedAccount(userId: string): Promise<AuthenticatedAccount | null> {
  const rows = await db()`
    SELECT u.id, u.profile, u.email, u.status, u.global_scope, u.linked_operator_id,
      count(s.client_id)::int AS scope_count,
      coalesce(array_agg(s.client_id ORDER BY s.client_id)
        FILTER (WHERE s.client_id IS NOT NULL), ARRAY[]::text[]) AS client_ids
    FROM agrorisk.users u
    LEFT JOIN agrorisk.user_client_scopes s ON s.user_id = u.id
    WHERE u.id = ${userId}
    GROUP BY u.id
    LIMIT 1
  `;
  const row = rows[0];
  if (!row?.email || row.status !== "active") return null;
  const hasValidScope =
    (row.profile === "admin" && row.global_scope === true) ||
    ((row.profile === "gestor" || row.profile === "consultor") && Number(row.scope_count) > 0) ||
    (row.profile === "operador" && row.linked_operator_id === row.id);
  if (!hasValidScope) return null;
  return {
    userId: String(row.id),
    profile: row.profile as ProfileId,
    email: String(row.email),
    globalScope: row.global_scope === true,
    linkedOperatorId: row.linked_operator_id ? String(row.linked_operator_id) : null,
    clientIds: row.profile === "admin"
      ? null
      : [...(row.client_ids as string[])].map(String),
  };
}

export async function getAccountClientScope(userId: string): Promise<string[]> {
  return cacheOrFetch(`account-client-scope:v2:${userId}`, 15, async () => {
    const account = await loadAuthorizedAccount(userId);
    return account?.clientIds ?? [];
  });
}

export async function closeAuthAccountRepository() {
  if (!client) return;
  await client.end({ timeout: 1 });
  client = undefined;
}
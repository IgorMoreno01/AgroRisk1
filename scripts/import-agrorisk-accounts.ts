import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;
type Profile = "admin" | "gestor" | "consultor" | "operador";

export const DEFAULT_ACCOUNTS_PATH =
  "attached_assets/AgroRisk_Contas_Teste_Escopos_Atualizado_1789085301112.xlsx";
export const ACCOUNTS_MIGRATION_PATH = "db/migrations/001_accounts_and_client_scopes.sql";

const EXPECTED_PROFILE_COUNTS: Record<Profile, number> = {
  admin: 3,
  gestor: 10,
  consultor: 8,
  operador: 55,
};

const PROFILE_MAP: Record<string, Profile> = {
  "Admin/Sompo": "admin",
  Gestor: "gestor",
  "Consultor/Corretor": "consultor",
  Operador: "operador",
};

const text = (row: Row, column: string, context: string): string => {
  const value = row[column];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`${context}: coluna obrigatória "${column}" vazia.`);
  }
  return String(value).trim();
};

const optionalText = (row: Row, column: string): string | null => {
  const value = row[column];
  return value === undefined || value === null || String(value).trim() === ""
    ? null
    : String(value).trim();
};

const sheetRows = (workbook: XLSX.WorkBook, name: string): Row[] => {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Aba obrigatória "${name}" não encontrada.`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { raw: true, defval: null });
};

const assertUnique = (values: string[], label: string) => {
  const normalized = values.map((value) => value.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label}: valores duplicados encontrados.`);
  }
};

export interface AccountSeedRow {
  id: string;
  client_id: string | null;
  name: string;
  profile: Profile;
  permissions: string[];
  email: string;
  password: string;
  status: "active" | "inactive";
  global_scope: boolean;
  linked_operator_id: string | null;
}

export interface AccountScopeSeedRow {
  user_id: string;
  client_id: string;
}

export interface AccountsSeed {
  accounts: AccountSeedRow[];
  scopes: AccountScopeSeedRow[];
}

export function loadAccountsSeed(filePath = DEFAULT_ACCOUNTS_PATH): AccountsSeed {
  const workbook = XLSX.readFile(resolve(filePath), { cellDates: false });
  const accountRows = sheetRows(workbook, "Contas");
  const managerScopes = sheetRows(workbook, "Escopos_Gestores");
  const consultantScopes = sheetRows(workbook, "Escopos_Consultores");
  const operatorRows = sheetRows(workbook, "Operadores");
  const clientRows = sheetRows(workbook, "Clientes_Referencia");

  if (accountRows.length !== 76) {
    throw new Error(`Contas: esperado 76 registros, encontrado ${accountRows.length}.`);
  }
  if (operatorRows.length !== 55) {
    throw new Error(`Operadores: esperado 55 registros, encontrado ${operatorRows.length}.`);
  }

  const clientIds = new Set(
    clientRows.map((row, index) => text(row, "cliente_id", `Clientes_Referencia linha ${index + 2}`)),
  );
  const operators = new Map(
    operatorRows.map((row, index) => {
      const context = `Operadores linha ${index + 2}`;
      const id = text(row, "operador_id", context);
      return [id, {
        clientId: text(row, "cliente_id", context),
        email: text(row, "email_teste", context),
        password: text(row, "senha_teste", context),
      }];
    }),
  );

  const accounts = accountRows.map((row, index): AccountSeedRow => {
    const context = `Contas linha ${index + 2}`;
    const id = text(row, "usuario_id", context);
    const sourceProfile = text(row, "perfil", context);
    const profile = PROFILE_MAP[sourceProfile];
    if (!profile) throw new Error(`${context}: perfil inválido "${sourceProfile}".`);
    const operatorId = optionalText(row, "operador_id");
    const clientId = optionalText(row, "cliente_principal_id");
    const email = text(row, "email_teste", context);
    const password = text(row, "senha_teste", context);
    if (text(row, "ativo", context) !== "SIM") throw new Error(`${id}: somente contas ativas são esperadas.`);

    if (profile === "admin" && text(row, "escopo_ids", context) !== "GLOBAL") {
      throw new Error(`${id}: Admin/Sompo deve possuir escopo GLOBAL.`);
    }
    if (profile === "operador") {
      const operator = operators.get(id);
      if (!operator || operatorId !== id) throw new Error(`${id}: vínculo de operador inválido.`);
      if (operator.clientId !== clientId || operator.email !== email || operator.password !== password) {
        throw new Error(`${id}: credenciais ou cliente divergem da aba Operadores.`);
      }
    }
    if (clientId && !clientIds.has(clientId)) throw new Error(`${id}: cliente principal inexistente.`);

    return {
      id,
      client_id: clientId,
      name: text(row, "nome_teste", context),
      profile,
      permissions: [],
      email,
      password,
      status: "active",
      global_scope: profile === "admin",
      linked_operator_id: profile === "operador" ? id : null,
    };
  });

  assertUnique(accounts.map((account) => account.id), "Contas.usuario_id");
  assertUnique(accounts.map((account) => account.email), "Contas.email_teste");
  const accountIds = new Set(accounts.map((account) => account.id));

  for (const [profile, expected] of Object.entries(EXPECTED_PROFILE_COUNTS)) {
    const actual = accounts.filter((account) => account.profile === profile).length;
    if (actual !== expected) throw new Error(`${profile}: esperado ${expected}, encontrado ${actual}.`);
  }
  for (let index = 1; index <= 55; index += 1) {
    const expected = `OPR-${String(index).padStart(3, "0")}`;
    if (!operators.has(expected) || !accountIds.has(expected)) throw new Error(`Operador ausente: ${expected}.`);
  }

  const scopes: AccountScopeSeedRow[] = [
    ...managerScopes.map((row, index) => ({
      user_id: text(row, "gestor_id", `Escopos_Gestores linha ${index + 2}`),
      client_id: text(row, "cliente_id", `Escopos_Gestores linha ${index + 2}`),
    })),
    ...consultantScopes.map((row, index) => ({
      user_id: text(row, "consultor_id", `Escopos_Consultores linha ${index + 2}`),
      client_id: text(row, "cliente_id", `Escopos_Consultores linha ${index + 2}`),
    })),
  ];
  assertUnique(scopes.map((scope) => `${scope.user_id}:${scope.client_id}`), "Escopos");
  for (const scope of scopes) {
    const account = accounts.find((candidate) => candidate.id === scope.user_id);
    if (!account || !["gestor", "consultor"].includes(account.profile)) {
      throw new Error(`Escopo referencia conta inválida: ${scope.user_id}.`);
    }
    if (!clientIds.has(scope.client_id)) throw new Error(`Escopo referencia cliente inexistente: ${scope.client_id}.`);
  }

  for (const account of accounts.filter((item) => item.profile === "gestor" || item.profile === "consultor")) {
    const expected = text(
      accountRows.find((row) => row["usuario_id"] === account.id)!,
      "escopo_ids",
      account.id,
    ).split("|").map((id) => id.trim()).sort();
    const actual = scopes.filter((scope) => scope.user_id === account.id).map((scope) => scope.client_id).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(`${account.id}: escopo detalhado diverge da aba Contas.`);
    }
  }

  return { accounts, scopes };
}

class IntentionalRollback extends Error {}

export async function importAccounts(
  seed: AccountsSeed,
  options: { dryRun?: boolean; databaseUrl?: string } = {},
) {
  const sql = postgres(options.databaseUrl ?? process.env.DATABASE_URL!, { max: 1, prepare: false });
  const migration = await readFile(resolve(ACCOUNTS_MIGRATION_PATH), "utf8");
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      const accountIds = seed.accounts.map((account) => account.id);
      const existingRows = await tx`
        SELECT id, password_hash
        FROM agrorisk.users
        WHERE id = ANY(${accountIds})
      `;
      const existingHashes = new Map(
        existingRows.map((row) => [String(row.id), row.password_hash ? String(row.password_hash) : null]),
      );
      const hashedAccounts = await Promise.all(seed.accounts.map(async ({ password, ...account }) => ({
        ...account,
        password_hash:
          existingHashes.get(account.id) &&
          await Bun.password.verify(password, existingHashes.get(account.id)!)
            ? existingHashes.get(account.id)!
            : await Bun.password.hash(password, {
                algorithm: "argon2id",
                memoryCost: 65_536,
                timeCost: 3,
              }),
      })));
      await tx`
        INSERT INTO agrorisk.users ${tx(hashedAccounts)}
        ON CONFLICT (id) DO UPDATE SET
          client_id = excluded.client_id,
          name = excluded.name,
          profile = excluded.profile,
          permissions = excluded.permissions,
          email = excluded.email,
          password_hash = excluded.password_hash,
          status = excluded.status,
          global_scope = excluded.global_scope,
          linked_operator_id = excluded.linked_operator_id
      `;
      const scopedUserIds = seed.accounts
        .filter((account) => account.profile === "gestor" || account.profile === "consultor")
        .map((account) => account.id);
      await tx`DELETE FROM agrorisk.user_client_scopes WHERE user_id = ANY(${scopedUserIds})`;
      await tx`INSERT INTO agrorisk.user_client_scopes ${tx(seed.scopes)} ON CONFLICT DO NOTHING`;

      const [integrity] = await tx`
        SELECT
          (SELECT count(*)::int FROM agrorisk.users WHERE email IS NOT NULL) AS accounts,
          (SELECT count(DISTINCT lower(email))::int FROM agrorisk.users WHERE email IS NOT NULL) AS unique_emails,
          (SELECT count(*)::int FROM agrorisk.users WHERE profile = 'admin' AND global_scope) AS admins,
          (SELECT count(*)::int FROM agrorisk.users WHERE profile = 'gestor') AS managers,
          (SELECT count(*)::int FROM agrorisk.users WHERE profile = 'consultor') AS consultants,
          (SELECT count(*)::int FROM agrorisk.users WHERE profile = 'operador'
            AND linked_operator_id = id AND id ~ '^OPR-[0-9]{3}$') AS operators,
          (SELECT count(*)::int FROM agrorisk.user_client_scopes) AS scopes,
          (SELECT count(*)::int FROM agrorisk.users
            WHERE email IS NOT NULL AND password_hash !~ '^\\$argon2id\\$') AS invalid_hashes,
          (SELECT count(*)::int FROM agrorisk.user_client_scopes s
            LEFT JOIN agrorisk.users u ON u.id = s.user_id
            LEFT JOIN agrorisk.clients c ON c.id = s.client_id
            WHERE u.id IS NULL OR c.id IS NULL) AS broken_scopes,
          (SELECT count(*)::int FROM agrorisk.users u
            LEFT JOIN agrorisk.users op ON op.id = u.linked_operator_id AND op.profile = 'operador'
            WHERE u.profile = 'operador' AND op.id IS NULL) AS broken_operators
      `;
      if (
        integrity.accounts !== 76 ||
        integrity.unique_emails !== 76 ||
        integrity.admins !== 3 ||
        integrity.managers !== 10 ||
        integrity.consultants !== 8 ||
        integrity.operators !== 55 ||
        integrity.scopes !== 93 ||
        integrity.invalid_hashes !== 0 ||
        integrity.broken_scopes !== 0 ||
        integrity.broken_operators !== 0
      ) {
        throw new Error("Verificação de integridade falhou; transação revertida.");
      }
      if (options.dryRun) throw new IntentionalRollback("Dry-run validado; transação revertida.");
    });
    return { rolledBack: false };
  } catch (error) {
    if (error instanceof IntentionalRollback) return { rolledBack: true };
    throw error;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.find((argument) => !argument.startsWith("--"));
  const seed = loadAccountsSeed(positional ?? DEFAULT_ACCOUNTS_PATH);
  const result = await importAccounts(seed, { dryRun });
  console.log(JSON.stringify({
    mode: result.rolledBack ? "dry-run-rollback" : "committed",
    accounts: seed.accounts.length,
    scopes: seed.scopes.length,
    profiles: Object.fromEntries(
      Object.keys(EXPECTED_PROFILE_COUNTS).map((profile) => [
        profile,
        seed.accounts.filter((account) => account.profile === profile).length,
      ]),
    ),
  }, null, 2));
}

if (import.meta.main) await main();
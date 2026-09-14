import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_ACCOUNTS_PATH,
  loadAccountsSeed,
} from "../scripts/import-agrorisk-accounts";

const importerSource = readFileSync(
  new URL("../scripts/import-agrorisk-accounts.ts", import.meta.url),
  "utf8",
);

describe("Importação de contas e escopos AgroRisk", () => {
  const seed = loadAccountsSeed(DEFAULT_ACCOUNTS_PATH);

  test("valida as 76 contas e os perfis esperados", () => {
    expect(seed.accounts).toHaveLength(76);
    expect(seed.accounts.filter((item) => item.profile === "admin")).toHaveLength(3);
    expect(seed.accounts.filter((item) => item.profile === "gestor")).toHaveLength(10);
    expect(seed.accounts.filter((item) => item.profile === "consultor")).toHaveLength(8);
    expect(seed.accounts.filter((item) => item.profile === "operador")).toHaveLength(55);
    expect(new Set(seed.accounts.map((item) => item.id)).size).toBe(76);
    expect(new Set(seed.accounts.map((item) => item.email.toLowerCase())).size).toBe(76);
  });

  test("preserva todos os vínculos e escopos detalhados", () => {
    expect(seed.scopes).toHaveLength(93);
    expect(seed.scopes.filter((item) => item.user_id.startsWith("GST-"))).toHaveLength(50);
    expect(seed.scopes.filter((item) => item.user_id.startsWith("CST-"))).toHaveLength(43);
    for (let index = 1; index <= 55; index += 1) {
      const id = `OPR-${String(index).padStart(3, "0")}`;
      expect(seed.accounts.find((item) => item.id === id)).toMatchObject({
        profile: "operador",
        linked_operator_id: id,
      });
    }
  });

  test("mantém senhas somente em memória e persiste Argon2id", () => {
    expect(importerSource).toContain('algorithm: "argon2id"');
    expect(importerSource).toContain("password_hash");
    expect(importerSource).not.toContain("senha_teste text");
    expect(importerSource).not.toContain("password_plaintext");
  });

  test("usa uma transação e upserts idempotentes", () => {
    expect(importerSource).toContain("sql.begin");
    expect(importerSource).toContain("ON CONFLICT (id) DO UPDATE");
    expect(importerSource).toContain("ON CONFLICT DO NOTHING");
    expect(importerSource).toContain("IntentionalRollback");
  });
});
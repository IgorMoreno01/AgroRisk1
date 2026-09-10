import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadPortfolioSeed } from "../scripts/import-agrorisk-portfolio";

const importerSource = readFileSync(
  new URL("../scripts/import-agrorisk-portfolio.ts", import.meta.url),
  "utf8",
);

describe("Importação da carteira AgroRisk", () => {
  const seed = loadPortfolioSeed();

  test("mapeia os volumes esperados sem IDs duplicados", () => {
    expect(seed.clients).toHaveLength(25);
    expect(seed.farms).toHaveLength(35);
    expect(seed.areas).toHaveLength(90);
    expect(seed.users).toHaveLength(55);
    expect(seed.machines).toHaveLength(120);
    expect(seed.operations).toHaveLength(500);
    for (const rows of Object.values(seed)) {
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    }
  });

  test("não importa score calculado, recomendação ou autenticação", () => {
    expect(seed.operations.every((row) => row.score === 0)).toBe(true);
    expect(seed.operations.every((row) => row.recommendation_id === null)).toBe(true);
    expect(seed.users.every((row) => row.profile === "operador")).toBe(true);
    expect(seed.users.every((row) => Array.isArray(row.permissions) && row.permissions.length === 0)).toBe(
      true,
    );
    expect(importerSource).not.toContain("score = excluded.score");
    expect(importerSource).not.toContain("recommendation_id = excluded.recommendation_id");
    expect(importerSource).not.toContain("profile = excluded.profile");
    expect(importerSource).not.toContain("permissions = excluded.permissions");
  });

  test("normaliza apenas domínios necessários do schema atual", () => {
    const operationTypes = new Set(seed.operations.map((row) => row.type));
    expect(operationTypes).toEqual(
      new Set(["Deslocamento interno", "Trabalho no campo", "Pulverização", "Colheita"]),
    );
    const machineTypes = new Set(seed.machines.map((row) => row.type));
    expect(machineTypes.has("Caminhão de apoio")).toBe(true);
    expect(machineTypes.has("Máquina de apoio")).toBe(false);
  });

  test("preserva a distinção entre contexto público e entidades sintéticas", () => {
    const clientContext = seed.clients[0].agricultural_context as {
      dataNature: { client: string; geographicAgriculturalContext: string };
    };
    const farmContext = seed.farms[0].agricultural_context as {
      dataNature: { farm: string };
      sources: { pam: string; zarc: string };
    };
    expect(clientContext.dataNature.client).toBe("synthetic");
    expect(clientContext.dataNature.geographicAgriculturalContext).toBe("public_real");
    expect(farmContext.dataNature.farm).toBe("synthetic");
    expect(farmContext.sources.pam).toContain("IBGE PAM");
    expect(farmContext.sources.zarc).toContain("MAPA ZARC");
  });

  test("preserva relações cliente, fazenda, área, operador e máquina", () => {
    const clients = new Set(seed.clients.map((row) => row.id));
    const farms = new Map(seed.farms.map((row) => [row.id, row]));
    const areas = new Map(seed.areas.map((row) => [row.id, row]));
    const users = new Map(seed.users.map((row) => [row.id, row]));
    const machines = new Map(seed.machines.map((row) => [row.id, row]));

    for (const area of seed.areas) {
      expect(clients.has(area.client_id)).toBe(true);
      expect(farms.get(area.farm_id)?.client_id).toBe(area.client_id);
    }
    for (const machine of seed.machines) {
      expect(areas.get(machine.area_id)?.client_id).toBe(machine.client_id);
      expect(users.get(machine.operator_id)?.client_id).toBe(machine.client_id);
    }
    for (const operation of seed.operations) {
      expect(areas.get(operation.area_id)?.client_id).toBe(operation.client_id);
      expect(machines.get(operation.machine_id)?.area_id).toBe(operation.area_id);
      expect(machines.get(operation.machine_id)?.client_id).toBe(operation.client_id);
      expect(users.get(operation.operator_id)?.client_id).toBe(operation.client_id);
    }
  });
});
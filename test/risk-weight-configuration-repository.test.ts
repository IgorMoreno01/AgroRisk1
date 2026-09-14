import { describe, expect, test } from "bun:test";
import { createMockRepository } from "../src/lib/data/mock-repository.server";
import type { RiskWeightConfigurationRepository } from "../src/lib/data/repository";
import {
  RiskWeightClientNotFoundError,
  RiskWeightConfigurationConflictError,
} from "../src/lib/data/risk-weight-configuration";

const createRepository = () =>
  createMockRepository() as RiskWeightConfigurationRepository;

const getTwoClientIds = async () => {
  const repository = createMockRepository();
  const [first, second] = await repository.listClients();
  if (!first || !second) throw new Error("O mock precisa conter pelo menos dois clientes.");
  return [first.id, second.id] as const;
};

describe("Persistência e resolução de pesos Sompo", () => {
  test("sem configuração resolve o default imutável 70/30", async () => {
    const repository = createRepository();
    expect(await repository.resolveEffectiveRiskWeights()).toEqual({
      weights: { mlWeight: 70, operationalRulesWeight: 30 },
      source: "default",
      revision: null,
      updatedAt: null,
    });
  });

  test("global 60/40 é persistido e resolvido como global", async () => {
    const repository = createRepository();
    const saved = await repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    );
    expect(saved.revision).toBe(1);
    expect(await repository.resolveEffectiveRiskWeights()).toMatchObject({
      weights: { mlWeight: 60, operationalRulesWeight: 40 },
      source: "global",
      revision: 1,
    });
  });

  test("cliente sem override usa global e outro cliente não herda override alheio", async () => {
    const repository = createRepository();
    const [clientA, clientB] = await getTwoClientIds();
    await repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    );
    await repository.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );
    expect(await repository.resolveEffectiveRiskWeights(clientA)).toMatchObject({
      weights: { mlWeight: 80, operationalRulesWeight: 20 },
      source: "client",
    });
    expect(await repository.resolveEffectiveRiskWeights(clientB)).toMatchObject({
      weights: { mlWeight: 60, operationalRulesWeight: 40 },
      source: "global",
    });
  });

  test("remover override faz o cliente voltar imediatamente ao global", async () => {
    const repository = createRepository();
    const [clientA] = await getTwoClientIds();
    await repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    );
    const override = await repository.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );
    await repository.deleteClientRiskWeightOverride(clientA, override.revision);
    expect(await repository.getClientRiskWeightOverride(clientA)).toBeUndefined();
    expect(await repository.resolveEffectiveRiskWeights(clientA)).toMatchObject({
      weights: { mlWeight: 60, operationalRulesWeight: 40 },
      source: "global",
    });
  });

  test("cliente inexistente produz erro explícito", async () => {
    const repository = createRepository();
    await expect(repository.resolveEffectiveRiskWeights("CL-INEXISTENTE"))
      .rejects.toBeInstanceOf(RiskWeightClientNotFoundError);
    await expect(repository.saveClientRiskWeightOverride(
      "CL-INEXISTENTE",
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    )).rejects.toBeInstanceOf(RiskWeightClientNotFoundError);
  });

  test("rejeita pesos inválidos e soma diferente de 100", async () => {
    const repository = createRepository();
    for (const weights of [
      { mlWeight: -1, operationalRulesWeight: 101 },
      { mlWeight: 101, operationalRulesWeight: -1 },
      { mlWeight: Number.NaN, operationalRulesWeight: 100 },
      { mlWeight: 60, operationalRulesWeight: 30 },
      { mlWeight: 60.5, operationalRulesWeight: 39.5 },
    ]) {
      await expect(repository.saveGlobalRiskWeightConfiguration(
        weights,
        { expectedRevision: null },
      )).rejects.toThrow();
    }
  });

  test("aceita os extremos 0/100 e 100/0", async () => {
    const first = createRepository();
    expect(await first.saveGlobalRiskWeightConfiguration(
      { mlWeight: 0, operationalRulesWeight: 100 },
      { expectedRevision: null },
    )).toMatchObject({ mlWeight: 0, operationalRulesWeight: 100 });

    const second = createRepository();
    expect(await second.saveGlobalRiskWeightConfiguration(
      { mlWeight: 100, operationalRulesWeight: 0 },
      { expectedRevision: null },
    )).toMatchObject({ mlWeight: 100, operationalRulesWeight: 0 });
  });

  test("revision avança e rejeita atualização concorrente obsoleta", async () => {
    const repository = createRepository();
    const initial = await repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 70, operationalRulesWeight: 30 },
      { expectedRevision: null },
    );
    const updated = await repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: initial.revision },
    );
    expect(updated.revision).toBe(initial.revision + 1);
    await expect(repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 50, operationalRulesWeight: 50 },
      { expectedRevision: initial.revision },
    )).rejects.toBeInstanceOf(RiskWeightConfigurationConflictError);
  });

  test("não permite criar duas configurações globais ou dois overrides do mesmo cliente", async () => {
    const repository = createRepository();
    const [clientA] = await getTwoClientIds();
    await repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 70, operationalRulesWeight: 30 },
      { expectedRevision: null },
    );
    await expect(repository.saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    )).rejects.toBeInstanceOf(RiskWeightConfigurationConflictError);

    await repository.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );
    await expect(repository.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 90, operationalRulesWeight: 10 },
      { expectedRevision: null },
    )).rejects.toBeInstanceOf(RiskWeightConfigurationConflictError);
  });

  test("remoção e recriação não reutilizam revision obsoleta", async () => {
    const repository = createRepository();
    const [clientA] = await getTwoClientIds();
    const original = await repository.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
    );
    await repository.deleteClientRiskWeightOverride(clientA, original.revision);
    const recreated = await repository.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
    );
    expect(recreated.revision).toBeGreaterThan(original.revision);
    await expect(repository.saveClientRiskWeightOverride(
      clientA,
      { mlWeight: 50, operationalRulesWeight: 50 },
      { expectedRevision: original.revision },
    )).rejects.toBeInstanceOf(RiskWeightConfigurationConflictError);
  });
});
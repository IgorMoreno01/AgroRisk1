import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { selectAdminRiskPreviewOperation } from "../src/components/admin-v2-risk-panel";
import { createMockRepository } from "../src/lib/data/mock-repository.server";
import type { RiskWeightConfigurationRepository } from "../src/lib/data/repository";
import { RiskWeightConfigurationConflictError } from "../src/lib/data/risk-weight-configuration";
import {
  deleteClientRiskWeightOverride,
  getRiskWeightConfigurationScope,
  saveClientRiskWeightOverride,
  saveGlobalRiskWeightConfiguration,
} from "../src/lib/risk-config.server";

const panelSource = readFileSync(
  new URL("../src/components/admin-v2-risk-panel.tsx", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(
  new URL("../src/lib/api/risk-config.functions.ts", import.meta.url),
  "utf8",
);

const createRepository = () =>
  createMockRepository() as RiskWeightConfigurationRepository;

describe("Etapa 3 · configuração Admin/Sompo por escopo", () => {
  test("carrega e atualiza o Padrão Sompo global com revision", async () => {
    const repository = createRepository();
    const initial = await getRiskWeightConfigurationScope(undefined, repository);
    expect(initial).toMatchObject({
      clientId: null,
      mlWeight: 70,
      operationalRulesWeight: 30,
      source: "default",
      revision: null,
      hasOverride: false,
    });
    const first = await saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
      repository,
    );
    const second = await saveGlobalRiskWeightConfiguration(
      { mlWeight: 55, operationalRulesWeight: 45 },
      { expectedRevision: first.revision },
      repository,
    );
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(await getRiskWeightConfigurationScope(undefined, repository)).toMatchObject({
      mlWeight: 55,
      operationalRulesWeight: 45,
      source: "global",
      revision: second.revision,
    });
  });

  test("cria override somente para o cliente e outro cliente herda o global", async () => {
    const repository = createRepository();
    const clients = await repository.listClients();
    const [clientA, clientB] = clients;
    await saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
      repository,
    );
    const inherited = await getRiskWeightConfigurationScope(clientA.id, repository);
    expect(inherited).toMatchObject({
      source: "global",
      hasOverride: false,
      mlWeight: 60,
    });
    await saveClientRiskWeightOverride(
      clientA.id,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
      repository,
    );
    expect(await getRiskWeightConfigurationScope(clientA.id, repository)).toMatchObject({
      source: "client",
      hasOverride: true,
      mlWeight: 80,
    });
    expect(await getRiskWeightConfigurationScope(clientB.id, repository)).toMatchObject({
      source: "global",
      hasOverride: false,
      mlWeight: 60,
    });
  });

  test("voltar ao padrão remove override sem copiar os pesos globais", async () => {
    const repository = createRepository();
    const [client] = await repository.listClients();
    const global = await saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
      repository,
    );
    const override = await saveClientRiskWeightOverride(
      client.id,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
      repository,
    );
    await deleteClientRiskWeightOverride(client.id, override.revision, repository);
    expect(await getRiskWeightConfigurationScope(client.id, repository)).toMatchObject({
      source: "global",
      hasOverride: false,
      revision: global.revision,
      mlWeight: 60,
    });
  });

  test("mudança global alcança herdado e não altera cliente personalizado", async () => {
    const repository = createRepository();
    const [clientA, clientB] = await repository.listClients();
    const global = await saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
      repository,
    );
    await saveClientRiskWeightOverride(
      clientA.id,
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: null },
      repository,
    );
    await saveGlobalRiskWeightConfiguration(
      { mlWeight: 50, operationalRulesWeight: 50 },
      { expectedRevision: global.revision },
      repository,
    );
    expect((await getRiskWeightConfigurationScope(clientA.id, repository)).mlWeight).toBe(80);
    expect((await getRiskWeightConfigurationScope(clientB.id, repository)).mlWeight).toBe(50);
  });

  test("preview seleciona somente operação pertencente ao cliente", async () => {
    const repository = createRepository();
    const operations = await repository.listOperations();
    const target = operations[operations.length - 1]!;
    const selected = selectAdminRiskPreviewOperation(target.clientId, operations);
    expect(selected?.clientId).toBe(target.clientId);
    expect(selectAdminRiskPreviewOperation("cliente-sem-operacao", operations)).toBeUndefined();
  });

  test("draft não salva automaticamente e troca rápida descarta resposta antiga", () => {
    expect(panelSource).toContain("Prévia com pesos não salvos");
    expect(panelSource).toContain("setMlWeight(value)");
    expect(panelSource).toContain("saveRiskEngineV2ClientOverride");
    expect(panelSource).toContain("requestVersion !== loadRequestVersion.current");
    expect(panelSource).toContain("requestVersion !== previewRequestVersion.current");
    expect(
      panelSource.match(/requestVersion !== loadRequestVersion.current/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(panelSource).toContain("setPreviewEvaluation(null)");
    expect(panelSource).toContain("Sem operação disponível para preview.");
  });

  test("conflito de revision não sobrescreve", async () => {
    const repository = createRepository();
    const first = await saveGlobalRiskWeightConfiguration(
      { mlWeight: 60, operationalRulesWeight: 40 },
      { expectedRevision: null },
      repository,
    );
    await saveGlobalRiskWeightConfiguration(
      { mlWeight: 55, operationalRulesWeight: 45 },
      { expectedRevision: first.revision },
      repository,
    );
    await expect(saveGlobalRiskWeightConfiguration(
      { mlWeight: 80, operationalRulesWeight: 20 },
      { expectedRevision: first.revision },
      repository,
    )).rejects.toBeInstanceOf(RiskWeightConfigurationConflictError);
    expect(panelSource).toContain("Recarregar valores");
    expect(panelSource).toContain("if (revisionConflict) return");
    expect(panelSource).toContain("|| revisionConflict}");
    expect(apiSource).toContain("REVISION_CONFLICT");
  });

  test("somente Admin global pode salvar ou remover", () => {
    expect(apiSource).toContain('session?.profile === "admin" && session.globalScope');
    expect(apiSource).toContain("requireRiskWeightAdmin(data.token)");
    expect(apiSource).toContain("Somente Admin/Sompo pode alterar os pesos.");
    expect(apiSource).toContain("deleteClientRiskWeightOverride");
  });

  test("painel mantém um slider e três estados explícitos", () => {
    expect(panelSource.match(/<Slider\n/g)).toHaveLength(1);
    expect(panelSource).toContain("100 - mlWeight");
    expect(panelSource).toContain("PADRÃO SOMPO");
    expect(panelSource).toContain("USANDO PADRÃO SOMPO");
    expect(panelSource).toContain("CONFIGURAÇÃO PERSONALIZADA");
    expect(panelSource).toContain("Personalizar para este cliente");
    expect(panelSource).toContain("Voltar ao Padrão Sompo");
  });
});
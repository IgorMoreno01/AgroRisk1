import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { closePostgresRepository } from "../src/lib/data/postgres-repository.server";
import { loadOperadorDashboardSnapshot } from "../src/lib/operador-dashboard.server";

afterAll(async () => {
  await closePostgresRepository();
});

describe("Tela operacional simplificada", () => {
  test("mantém os mesmos dados centrais de Diego", async () => {
    const snapshot = await loadOperadorDashboardSnapshot("OPR-010");
    expect(snapshot.operator).toMatchObject({ id: "OPR-010", name: "Diego Nunes" });
    expect(snapshot.operation).toMatchObject({
      id: "OP-1200",
      operatorId: "OPR-010",
      machineId: "MQ-080",
    });
    expect(snapshot.risk.finalScore).toBe(snapshot.engineResult.finalScore);
    expect(snapshot.risk.level).toBe(snapshot.engineResult.level);
    expect(snapshot.nextAction).toEqual(
      expect.objectContaining({
        title: snapshot.recommendation.title,
        factor: snapshot.recommendation.factor,
      }),
    );
    expect(snapshot.alerts.length).toBeGreaterThan(0);
  });

  test("renderiza somente a hierarquia operacional solicitada", () => {
    const route = readFileSync(
      new URL("../src/routes/operador.tsx", import.meta.url),
      "utf8",
    );

    for (const visible of [
      "Operação atual",
      "Risco agora",
      "Próxima ação",
      "Clima e segurança",
      "PreventiveMaintenanceCard",
      "ActionableAlertsList",
      "OperationRegistrationCard",
      "machine.type",
      "machine.id",
      "scoreContext.finalScore",
      "snapshot.nextAction",
    ]) {
      expect(route).toContain(visible);
    }

    for (const removed of [
      "PersonaV2RiskPanel",
      "RiskComposition",
      "RiskExplanation",
      "GeoContextCard",
      "DataSourcesPanel",
      "ClimateSection",
      "WaterFeaturesSection",
      "RoutingSection",
      "TerrainSection",
      "SoilDemoSection",
      "RiskFactorsWithSources",
      "RecentHistoryCard",
      "machine.model",
      "machine.name",
    ]) {
      expect(route).not.toContain(removed);
    }

    const navigation = readFileSync(
      new URL("../src/components/app-layout.tsx", import.meta.url),
      "utf8",
    );
    const operatorNavigation = navigation.slice(
      navigation.indexOf("operador: ["),
      navigation.indexOf("gestor: ["),
    );
    expect(operatorNavigation).not.toContain("Histórico recente");

    const registrationCard = readFileSync(
      new URL("../src/components/operation-registration-card.tsx", import.meta.url),
      "utf8",
    );
    expect(registrationCard).toContain(".slice(0, 3)");
    expect(registrationCard).not.toContain("RiskBadge");
    expect(registrationCard).not.toContain("RecommendationCard");
    expect(registrationCard).not.toContain("ProfileAlertsSection");
  });
});
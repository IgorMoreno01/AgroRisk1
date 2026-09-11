import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("interface de alertas acionáveis", () => {
  test("provider usa somente token e alertId nas RPCs", () => {
    const source = read("src/lib/actionable-alerts.tsx");
    expect(source).toContain("listActionableAlerts({ data: { token } })");
    expect(source).toContain("markActionableAlertsViewed({ data: { token, alertId: ids } })");
    expect(source).toContain("acknowledgeActionableAlerts({ data: { token, alertId: id } })");
    expect(source).not.toMatch(/\b(clientId|operatorId|machineId|operationId)\s*:/);
  });

  test("sino deriva badge persistente e abertura marca novos como visualizados", () => {
    const source = read("src/components/header-menus.tsx");
    expect(source).toContain("const pending = snapshot.unreadCount");
    expect(source).toContain('a.status === "new"');
    expect(source).toContain("void markViewed(ids)");
    expect(source).toContain("Marcar todos como lidos");
  });

  test("lista destaca novos e permite reconhecer", () => {
    const source = read("src/components/actionable-alerts.tsx");
    expect(source).toContain('alert.status === "new" && "ring-2 ring-primary/30"');
    expect(source).toContain("Reconhecer alerta");
    expect(source).toContain("acknowledge(alert.id)");
  });

  test("banner crítico é evidente e não bloqueante", () => {
    const source = read("src/components/actionable-alerts.tsx");
    expect(source).toContain('item.severity === "critical"');
    expect(source).toContain("Ação necessária");
    expect(source).toContain("CriticalAlertBanner");
    expect(source).not.toContain("<Dialog");
  });

  test("as quatro personas renderizam sua seção persistente", () => {
    const routes = [
      ["src/routes/operador.tsx", "alertas-operacao", "ActionableAlertsList"],
      ["src/routes/gestor.tsx", "GestorOperationalOverview", "GestorOperationalOverview"],
      ["src/routes/consultor.tsx", "alertas-cliente", "ActionableAlertsList"],
      ["src/routes/admin.tsx", "central-alertas", "ActionableAlertsList"],
    ] as const;
    for (const [path, sectionId, componentName] of routes) {
      const source = read(path);
      expect(source).toContain(componentName);
      expect(source).toContain(sectionId);
      expect(source).not.toContain("ProfileAlertsSection");
      expect(source).not.toContain("getProfileAlerts");
    }
  });
});
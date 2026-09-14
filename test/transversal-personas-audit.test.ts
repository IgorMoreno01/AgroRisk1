import { afterAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import {
  evaluateAdminDashboardRiskBatch,
  loadAdminDashboardSnapshot,
} from "../src/lib/admin-dashboard.server";
import { loadConsultorDashboardSnapshot } from "../src/lib/consultor-dashboard.server";
import { closePostgresRepository } from "../src/lib/data/postgres-repository.server";
import { evaluateGestorRiskBatch, loadGestorDashboardSnapshot } from "../src/lib/gestor-dashboard.server";
import { evaluateConsultorRiskBatch } from "../src/lib/consultor-dashboard.server";
import { loadOperadorDashboardSnapshot } from "../src/lib/operador-dashboard.server";
import { mockRepository } from "../src/lib/data/mock-repository.server";
import { postgresRepository } from "../src/lib/data/postgres-repository.server";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

afterAll(async () => {
  await Promise.all([
    closePostgresRepository(),
    sql.end({ timeout: 1 }),
  ]);
});

describe("auditoria transversal das quatro personas", () => {
  test("a mesma máquina mantém score, classificação, fator e pesos", async () => {
    const candidates = await sql`
      SELECT DISTINCT o.operator_id AS "operatorId", o.client_id AS "clientId",
        gs.user_id AS "gestorId", cs.user_id AS "consultorId"
      FROM agrorisk.operations o
      JOIN agrorisk.users op ON op.id=o.operator_id AND op.profile='operador'
      JOIN agrorisk.user_client_scopes gs ON gs.client_id=o.client_id
      JOIN agrorisk.users gu ON gu.id=gs.user_id AND gu.profile='gestor'
      JOIN agrorisk.user_client_scopes cs ON cs.client_id=o.client_id
      JOIN agrorisk.users cu ON cu.id=cs.user_id AND cu.profile='consultor'
      ORDER BY o.operator_id
      LIMIT 1
    `;
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0] as {
      operatorId: string;
      clientId: string;
      gestorId: string;
      consultorId: string;
    };
    const [gestorScopes, consultorScopes] = await Promise.all([
      sql`SELECT client_id AS id FROM agrorisk.user_client_scopes WHERE user_id=${candidate.gestorId}`,
      sql`SELECT client_id AS id FROM agrorisk.user_client_scopes WHERE user_id=${candidate.consultorId}`,
    ]);
    const operador = await loadOperadorDashboardSnapshot(
      candidate.operatorId,
      postgresRepository,
      mockRepository,
    );
    const operationId = operador.operation.id;
    const managerClientIds = gestorScopes.map((row) => String(row.id));
    const consultantClientIds = consultorScopes.map((row) => String(row.id));
    expect(managerClientIds).toContain(operador.operation.clientId);
    expect(consultantClientIds).toContain(operador.operation.clientId);
    const [adminRows, gestor, consultor] = await Promise.all([
      evaluateAdminDashboardRiskBatch([operationId], 1),
      evaluateGestorRiskBatch({
        userId: candidate.gestorId,
        clientIds: managerClientIds,
      }, [operationId], 1),
      evaluateConsultorRiskBatch({
        userId: candidate.consultorId,
        clientIds: consultantClientIds,
      }, operador.operation.clientId, [operationId], 1),
    ]);
    const adminRow = adminRows.find((row) => row.operation.id === operationId);
    const gestorRow = gestor.operationRows.find((row) => row.operation.id === operationId);
    const consultorRow = consultor.machines.find((row) => row.operation?.id === operationId);
    expect(adminRow).toBeDefined();
    expect(gestorRow).toBeDefined();
    expect(consultorRow).toBeDefined();
    const signatures = [adminRow, gestorRow, consultorRow].map((row) => ({
      score: row!.score,
      level: row!.level,
      factor: row!.mainFactor,
    }));
    expect(new Set(signatures.map((item) => JSON.stringify(item))).size).toBe(1);
    expect(operador.risk.finalScore).toBe(adminRow!.score);
    expect(operador.risk.level).toBe(adminRow!.level);
    expect(operador.mainFactor).toBe(adminRow!.mainFactor);
    const sharedInputs = [
       adminRow!.evaluation.input,
       gestorRow!.evaluation.input,
       consultorRow!.evaluation.input,
       operador.evaluationContext.input,
     ];
    expect(new Set(sharedInputs.map((input) => JSON.stringify(input))).size).toBe(1);
    const sharedOperationalProvenance = [
       adminRow!.evaluation.provenance.operationalRules,
       gestorRow!.evaluation.provenance.operationalRules,
       consultorRow!.evaluation.provenance.operationalRules,
      operador.evaluationContext.provenance.operationalRules,
    ];
    expect(new Set(
      sharedOperationalProvenance.map((provenance) => JSON.stringify(provenance)),
    ).size).toBe(1);
    expect(gestorRow!.evaluation.result.weights).toEqual(adminRow!.evaluation.result.weights);
    expect(consultorRow!.evaluation.result.weights).toEqual(adminRow!.evaluation.result.weights);
    expect(operador.weights).toEqual({
      climate: adminRow!.evaluation.result.weights.ml,
      operational: adminRow!.evaluation.result.weights.operationalRules,
    });
  }, 30_000);

  test("os snapshots aplicam escopo global, carteira e operador vinculado", async () => {
    const users = await sql`
      SELECT
        (SELECT id FROM agrorisk.users WHERE profile='gestor' ORDER BY id LIMIT 1) AS "gestorId",
        (SELECT id FROM agrorisk.users WHERE profile='consultor' ORDER BY id LIMIT 1) AS "consultorId",
        (SELECT id FROM agrorisk.users WHERE profile='operador' ORDER BY id LIMIT 1) AS "operatorId"
    `;
    const ids = users[0] as { gestorId: string; consultorId: string; operatorId: string };
    const [gestorScopes, consultorScopes] = await Promise.all([
      sql`SELECT client_id AS id FROM agrorisk.user_client_scopes WHERE user_id=${ids.gestorId} ORDER BY id`,
      sql`SELECT client_id AS id FROM agrorisk.user_client_scopes WHERE user_id=${ids.consultorId} ORDER BY id`,
    ]);
    const gestorClientIds = gestorScopes.map((row) => String(row.id));
    const consultorClientIds = consultorScopes.map((row) => String(row.id));
    const [admin, gestor, consultor, operador] = await Promise.all([
       loadAdminDashboardSnapshot(postgresRepository, mockRepository),
      loadGestorDashboardSnapshot(
        { userId: ids.gestorId, clientIds: gestorClientIds },
        postgresRepository,
         mockRepository,
      ),
      loadConsultorDashboardSnapshot(
        { userId: ids.consultorId, clientIds: consultorClientIds },
        postgresRepository,
         mockRepository,
      ),
      loadOperadorDashboardSnapshot(
        ids.operatorId,
        postgresRepository,
         mockRepository,
      ),
    ]);

    const allClientRows = await sql`SELECT id FROM agrorisk.clients ORDER BY id`;
    expect(admin.clients.map((client) => client.id).sort()).toEqual(
      allClientRows.map((row) => String(row.id)),
    );
    expect(gestor.clients.map((client) => client.id).sort()).toEqual(gestorClientIds);
    expect(consultor.clients.map((view) => view.client.id).sort()).toEqual(consultorClientIds);
    expect(operador.operator.id).toBe(ids.operatorId);
    expect(operador.operation.operatorId).toBe(ids.operatorId);
    expect(operador.machine.operatorId).toBe(ids.operatorId);
  }, 30_000);
});
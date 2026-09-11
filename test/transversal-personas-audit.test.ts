import { afterAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { loadAdminDashboardSnapshot } from "../src/lib/admin-dashboard.server";
import { loadConsultorDashboardSnapshot } from "../src/lib/consultor-dashboard.server";
import { closePostgresRepository } from "../src/lib/data/postgres-repository.server";
import { loadGestorDashboardSnapshot } from "../src/lib/gestor-dashboard.server";
import { loadOperadorDashboardSnapshot } from "../src/lib/operador-dashboard.server";

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
    const [admin, gestor, consultor, operador] = await Promise.all([
      loadAdminDashboardSnapshot(),
      loadGestorDashboardSnapshot({
        userId: candidate.gestorId,
        clientIds: gestorScopes.map((row) => String(row.id)),
      }),
      loadConsultorDashboardSnapshot({
        userId: candidate.consultorId,
        clientIds: consultorScopes.map((row) => String(row.id)),
      }),
      loadOperadorDashboardSnapshot(candidate.operatorId),
    ]);

    const machineId = operador.machine.id;
    const adminMachine = admin.machineRows.find((row) => row.machine.id === machineId);
    const gestorMachine = gestor.machineRows.find((row) => row.machine.id === machineId);
    const consultorMachine = consultor.clients
      .flatMap((view) => view.machines)
      .find((row) => row.machine.id === machineId);

    expect(adminMachine).toBeDefined();
    expect(gestorMachine).toBeDefined();
    expect(consultorMachine).toBeDefined();
    const signatures = [adminMachine, gestorMachine, consultorMachine].map((row) => ({
      score: row!.score,
      level: row!.level,
      factor: row!.mainFactor,
    }));
    expect(new Set(signatures.map((item) => JSON.stringify(item))).size).toBe(1);
    expect(operador.risk.finalScore).toBe(adminMachine!.score);
    expect(operador.risk.level).toBe(adminMachine!.level);
    expect(operador.mainFactor).toBe(adminMachine!.mainFactor);
    const sharedInputs = [
      adminMachine!.evaluation.input,
      gestorMachine!.evaluation.input,
      consultorMachine!.evaluation.input,
      operador.evaluationContext.input,
    ];
    expect(new Set(sharedInputs.map((input) => JSON.stringify(input))).size).toBe(1);
    expect(admin.weights).toEqual(gestor.weights);
    expect(admin.weights).toEqual(consultor.weights);
    expect(operador.weights).toEqual({
      climate: admin.weights.ml,
      operational: admin.weights.operationalRules,
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
      loadAdminDashboardSnapshot(),
      loadGestorDashboardSnapshot({ userId: ids.gestorId, clientIds: gestorClientIds }),
      loadConsultorDashboardSnapshot({ userId: ids.consultorId, clientIds: consultorClientIds }),
      loadOperadorDashboardSnapshot(ids.operatorId),
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
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({
  token: z.string().min(1).max(2000),
});

const saveSchema = tokenSchema.extend({
  climate: z.number().finite().int().min(0).max(100),
  operational: z.number().finite().int().min(0).max(100),
});

const saveRiskEngineV2Schema = tokenSchema
  .extend({
    mlWeight: z.number().finite().int().min(0).max(100),
    operationalRulesWeight: z.number().finite().int().min(0).max(100),
    expectedRevision: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => value.mlWeight + value.operationalRulesWeight === 100, {
    message: "Os pesos ML e Regras devem totalizar 100%.",
  });

export const getRiskConfiguration = createServerFn({ method: "POST" })
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => {
    const { readSession } = await import("../auth-session.server");
    const session = await readSession(data.token);
    if (!session) return { ok: false as const, error: "Sessão não autorizada." };

    const { getRiskConfiguration: readConfiguration } = await import("../risk-config.server");
    return { ok: true as const, configuration: readConfiguration() };
  });

export const saveRiskConfiguration = createServerFn({ method: "POST" })
  .inputValidator(saveSchema)
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/admin");
    if (!session || session.profile !== "admin") {
      return { ok: false as const, error: "Somente Admin/Sompo pode alterar os pesos." };
    }

    const { saveRiskConfiguration: writeConfiguration } = await import("../risk-config.server");
    try {
      return {
        ok: true as const,
        configuration: writeConfiguration({
          climate: data.climate,
          operational: data.operational,
        }),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível salvar os pesos.",
      };
    }
  });

export const getRiskEngineV2Configuration = createServerFn({ method: "POST" })
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => {
    const { readSession } = await import("../auth-session.server");
    const session = await readSession(data.token);
    if (!session) return { ok: false as const, error: "Sessão não autorizada." };

    const { getPersistedRiskEngineV2Configuration: readConfiguration } = await import(
      "../risk-config.server"
    );
    return { ok: true as const, configuration: await readConfiguration() };
  });

export const saveRiskEngineV2Configuration = createServerFn({ method: "POST" })
  .inputValidator(saveRiskEngineV2Schema)
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/admin");
    if (!session || session.profile !== "admin") {
      return { ok: false as const, error: "Somente Admin/Sompo pode alterar os pesos." };
    }

    const { saveRiskEngineV2Configuration: writeConfiguration } = await import(
      "../risk-config.server"
    );
    try {
      return {
        ok: true as const,
        configuration: await writeConfiguration(
          {
            mlWeight: data.mlWeight,
            operationalRulesWeight: data.operationalRulesWeight,
          },
          undefined,
          data.expectedRevision,
        ),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível salvar os pesos.",
      };
    }
  });
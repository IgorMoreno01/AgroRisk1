import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({
  token: z.string().min(1).max(2000),
});

const saveSchema = tokenSchema.extend({
  climate: z.number().finite().int().min(0).max(100),
  operational: z.number().finite().int().min(0).max(100),
});

const saveRiskEngineV2FieldsSchema = tokenSchema.extend({
    mlWeight: z.number().finite().int().min(0).max(100),
    operationalRulesWeight: z.number().finite().int().min(0).max(100),
    expectedRevision: z.number().int().positive().nullable().optional(),
  });

const saveRiskEngineV2Schema = saveRiskEngineV2FieldsSchema
  .refine((value) => value.mlWeight + value.operationalRulesWeight === 100, {
    message: "Os pesos ML e Regras devem totalizar 100%.",
  });

const riskWeightScopeSchema = tokenSchema.extend({
  clientId: z.string().trim().min(1).max(100).optional(),
});

const saveClientOverrideSchema = saveRiskEngineV2FieldsSchema
  .extend({ clientId: z.string().trim().min(1).max(100) })
  .refine((value) => value.mlWeight + value.operationalRulesWeight === 100, {
    message: "Os pesos ML e Regras devem totalizar 100%.",
  });

const deleteClientOverrideSchema = tokenSchema.extend({
  clientId: z.string().trim().min(1).max(100),
  expectedRevision: z.number().int().positive(),
});

async function requireRiskWeightAdmin(token: string) {
  const { authorize } = await import("../auth-session.server");
  const session = await authorize(token, "/admin");
  return session?.profile === "admin" && session.globalScope ? session : null;
}

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

export const getRiskEngineV2WeightConfiguration = createServerFn({ method: "POST" })
  .inputValidator(riskWeightScopeSchema)
  .handler(async ({ data }) => {
    const session = await requireRiskWeightAdmin(data.token);
    if (!session) {
      return { ok: false as const, error: "Somente Admin/Sompo pode consultar os pesos." };
    }
    try {
      const { getRiskWeightConfigurationScope } = await import("../risk-config.server");
      return {
        ok: true as const,
        configuration: await getRiskWeightConfigurationScope(data.clientId),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível carregar os pesos.",
      };
    }
  });

export const saveRiskEngineV2Configuration = createServerFn({ method: "POST" })
  .inputValidator(saveRiskEngineV2Schema)
  .handler(async ({ data }) => {
    const session = await requireRiskWeightAdmin(data.token);
    if (!session) {
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
      if (error instanceof Error && error.name === "RiskWeightConfigurationConflictError") {
        return {
          ok: false as const,
          code: "REVISION_CONFLICT" as const,
          error: "A configuração foi alterada por outro usuário. Recarregue os valores antes de salvar novamente.",
        };
      }
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível salvar os pesos.",
      };
    }
  });

export const saveRiskEngineV2ClientOverride = createServerFn({ method: "POST" })
  .inputValidator(saveClientOverrideSchema)
  .handler(async ({ data }) => {
    const session = await requireRiskWeightAdmin(data.token);
    if (!session) {
      return { ok: false as const, error: "Somente Admin/Sompo pode alterar os pesos." };
    }
    try {
      const {
        getRiskWeightConfigurationScope,
        saveClientRiskWeightOverride,
      } = await import("../risk-config.server");
      await saveClientRiskWeightOverride(
        data.clientId,
        {
          mlWeight: data.mlWeight,
          operationalRulesWeight: data.operationalRulesWeight,
        },
        {
          expectedRevision: data.expectedRevision ?? null,
          updatedBy: session.userId,
        },
      );
      return {
        ok: true as const,
        configuration: await getRiskWeightConfigurationScope(data.clientId),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "RiskWeightConfigurationConflictError") {
        return {
          ok: false as const,
          code: "REVISION_CONFLICT" as const,
          error: "A configuração foi alterada por outro usuário. Recarregue os valores antes de salvar novamente.",
        };
      }
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível salvar os pesos.",
      };
    }
  });

export const deleteRiskEngineV2ClientOverride = createServerFn({ method: "POST" })
  .inputValidator(deleteClientOverrideSchema)
  .handler(async ({ data }) => {
    const session = await requireRiskWeightAdmin(data.token);
    if (!session) {
      return { ok: false as const, error: "Somente Admin/Sompo pode alterar os pesos." };
    }
    try {
      const {
        deleteClientRiskWeightOverride,
        getRiskWeightConfigurationScope,
      } = await import("../risk-config.server");
      await deleteClientRiskWeightOverride(data.clientId, data.expectedRevision);
      return {
        ok: true as const,
        configuration: await getRiskWeightConfigurationScope(data.clientId),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "RiskWeightConfigurationConflictError") {
        return {
          ok: false as const,
          code: "REVISION_CONFLICT" as const,
          error: "A configuração foi alterada por outro usuário. Recarregue os valores antes de salvar novamente.",
        };
      }
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível remover a personalização.",
      };
    }
  });
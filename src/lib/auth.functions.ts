import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const signIn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      profile: z.string().min(1).max(32),
      email: z.string().email().max(320),
      password: z.string().min(1).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const { createSession } = await import("./auth-session.server");
    const result = await createSession(data.profile, data.email, data.password);
    if (!result.ok) {
      const messages = {
        INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
        PROFILE_MISMATCH: "O perfil selecionado não corresponde a esta conta.",
        INACTIVE_ACCOUNT: "Esta conta está inativa.",
        INVALID_SCOPE: "A conta não possui um escopo de acesso válido.",
      } as const;
      return { ok: false as const, error: messages[result.reason] };
    }
    return {
      ok: true as const,
      token: result.token,
      profile: result.session.profile,
      allowedRoutes: result.session.allowedRoutes,
    };
  });

export const verifySession = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(2000) }))
  .handler(async ({ data }) => {
    const { readSession } = await import("./auth-session.server");
    const session = await readSession(data.token);
    if (!session) return { ok: false as const };
    return {
      ok: true as const,
      profile: session.profile,
      email: session.email,
      allowedRoutes: session.allowedRoutes,
    };
  });

export const authorizePath = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token: z.string().min(1).max(2000), path: z.string().min(1).max(200) }),
  )
  .handler(async ({ data }) => {
    const { authorize } = await import("./auth-session.server");
    const session = await authorize(data.token, data.path);
    if (!session) return { allowed: false as const };
    return { allowed: true as const, profile: session.profile };
  });

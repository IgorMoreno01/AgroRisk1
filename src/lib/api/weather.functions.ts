// ============================================================
// AgroRisk · Server function — Clima (Open-Meteo)
// Frontend → esta função (server-side) → ClimateAdapter → API externa
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export const getWeather = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1).max(2000),
      municipality: z.string().min(1).max(120),
      state: z.string().min(2).max(60),
    }),
  )
  .handler(async ({ data }) => {
    const { authorize } = await import("../auth-session.server");
    const session = await authorize(data.token, "/operador");
    if (!session || session.profile !== "operador") {
      return { ok: false as const };
    }
    const [{ geocodeMunicipality }, { getCurrentClimate }] = await Promise.all([
      import("../adapters/location.server"),
      import("../adapters/climate.server"),
    ]);
    const location = await geocodeMunicipality(data.municipality, data.state);
    if (!location) return { ok: false as const };
    try {
      return {
        ok: true as const,
        weather: await getCurrentClimate(location.latitude, location.longitude),
      };
    } catch {
      return { ok: false as const };
    }
  });

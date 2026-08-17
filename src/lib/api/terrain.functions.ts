// ============================================================
// AgroRisk · Server function — Terreno / Elevação (OpenTopography)
// A chave OPENTOPO_API_KEY é lida exclusivamente no lado do servidor.
// Frontend → esta função (server-side) → TerrainAdapter → API externa
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getTerrain } from "../adapters/terrain.server";

export const getElevation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
  )
  .handler(async ({ data }) => {
    return getTerrain(data.lat, data.lon);
  });

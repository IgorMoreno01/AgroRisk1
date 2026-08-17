// ============================================================
// AgroRisk · Server function — Rotas (openrouteservice)
// A chave ORS_API_KEY é lida exclusivamente no lado do servidor.
// Frontend → esta função (server-side) → RoutingAdapter → API externa
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRoute } from "../adapters/routing.server";

export const getRouting = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      originLat: z.number().min(-90).max(90),
      originLon: z.number().min(-180).max(180),
      destLat: z.number().min(-90).max(90),
      destLon: z.number().min(-180).max(180),
    }),
  )
  .handler(async ({ data }) => {
    return getRoute(data.originLat, data.originLon, data.destLat, data.destLon);
  });

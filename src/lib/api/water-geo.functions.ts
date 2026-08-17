// ============================================================
// AgroRisk · Server function — Hidrografia (Overpass / OSM)
// Frontend → esta função (server-side) → WaterGeoAdapter → API externa
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getWaterGeo } from "../adapters/water-geo.server";

export const getWaterFeatures = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      radiusM: z.number().min(100).max(50_000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    return getWaterGeo(data.lat, data.lon, data.radiusM);
  });

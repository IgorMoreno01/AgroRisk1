// ============================================================
// AgroRisk · Server function — Clima (Open-Meteo)
// Frontend → esta função (server-side) → ClimateAdapter → API externa
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getClimate } from "../adapters/climate.server";

export const getWeather = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
  )
  .handler(async ({ data }) => {
    return getClimate(data.lat, data.lon);
  });

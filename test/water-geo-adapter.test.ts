import { describe, expect, test } from "bun:test";
import {
  distanceToWaterGeometryM,
  parseOverpassWaterFeatures,
} from "../src/lib/adapters/water-geo.server";

describe("WaterGeoAdapter · distância até geometria", () => {
  test("mede até o segmento mais próximo, não até o centro da feição", () => {
    const distance = distanceToWaterGeometryM(
      { lat: 0, lon: 0 },
      [[{ lat: -1, lon: 0.001 }, { lat: 1, lon: 0.001 }]],
    );
    expect(distance).not.toBeNull();
    expect(distance!).toBeGreaterThan(110);
    expect(distance!).toBeLessThan(112);
  });

  test("retorna zero quando o ponto está dentro de um corpo d'água fechado", () => {
    expect(distanceToWaterGeometryM(
      { lat: 0, lon: 0 },
      [[
        { lat: -0.01, lon: -0.01 },
        { lat: -0.01, lon: 0.01 },
        { lat: 0.01, lon: 0.01 },
        { lat: 0.01, lon: -0.01 },
        { lat: -0.01, lon: -0.01 },
      ]],
    )).toBe(0);
  });

  test("não inventa distância para feição sem geometria", () => {
    expect(distanceToWaterGeometryM({ lat: 0, lon: 0 }, [])).toBeNull();
    expect(parseOverpassWaterFeatures([
      {
        id: 1,
        type: "way",
        center: { lat: 0, lon: 0.001 },
        tags: { natural: "water", name: "Feição incompleta" },
      },
    ], 0, 0)).toEqual([]);
  });
});
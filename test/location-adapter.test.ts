import { describe, expect, test } from "bun:test";
import { selectGeocodedLocation } from "../src/lib/adapters/location.server";

describe("LocationAdapter município + UF", () => {
  test("seleciona o município homônimo somente no estado solicitado", () => {
    const payload = {
      results: [
        { name: "Bom Jesus", latitude: -9, longitude: -44, country_code: "BR", admin1: "Piauí" },
        { name: "Bom Jesus", latitude: -28, longitude: -50, country_code: "BR", admin1: "Rio Grande do Sul" },
      ],
    };
    const result = selectGeocodedLocation(payload, "Bom Jesus", "RS");
    expect(result?.latitude).toBe(-28);
    expect(result?.state).toBe("Rio Grande do Sul");
  });

  test("não usa coordenada de outro estado como fallback", () => {
    const result = selectGeocodedLocation({
      results: [
        { name: "Bom Jesus", latitude: -9, longitude: -44, country_code: "BR", admin1: "Piauí" },
      ],
    }, "Bom Jesus", "RS");
    expect(result).toBeNull();
  });
});
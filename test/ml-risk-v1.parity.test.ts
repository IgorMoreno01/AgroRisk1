import { describe, expect, test } from "bun:test";
import { evaluateMlRiskModelV1 } from "../src/lib/ml-risk/model-v1";
import type { MlRiskInput } from "../src/lib/ml-risk/types";

const GOLDEN_VECTORS_PATH = new URL(
  "../attached_assets/agrorisk_golden_vectors_v1_1789008155364.csv",
  import.meta.url,
);

const PROBABILITY_TOLERANCE = 1e-12;
const RELATIVE_SCORE_TOLERANCE = 1e-10;

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
};

const nullableNumber = (value: string): number | null =>
  value === "" ? null : Number(value);

interface GoldenVector {
  input: MlRiskInput;
  expectedProbability: number;
  expectedRelativeScore: number;
}

const loadGoldenVectors = async (): Promise<GoldenVector[]> => {
  const content = await Bun.file(GOLDEN_VECTORS_PATH).text();
  const lines = content.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index]]),
    );

    return {
      input: {
        DT_REFERENCIA: row.DT_REFERENCIA,
        COD_MOD: row.COD_MOD || null,
        UF: row.UF || null,
        PRECIPITACAO_D1_MM: nullableNumber(row.PRECIPITACAO_D1_MM),
        CHUVA_7D_MM: nullableNumber(row.CHUVA_7D_MM),
        CHUVA_30D_MM: nullableNumber(row.CHUVA_30D_MM),
        TEMP_MEDIA_D1_C: nullableNumber(row.TEMP_MEDIA_D1_C),
        TEMP_MAX_D1_C: nullableNumber(row.TEMP_MAX_D1_C),
        TEMP_MIN_D1_C: nullableNumber(row.TEMP_MIN_D1_C),
        UMIDADE_D1_PCT: nullableNumber(row.UMIDADE_D1_PCT),
        VENTO_D1_MS: nullableNumber(row.VENTO_D1_MS),
        ALTITUDE_ML_M: nullableNumber(row.ALTITUDE_ML_M),
        HIST_ITEM_SAFE_N_TOTAL: nullableNumber(
          row.HIST_ITEM_SAFE_N_TOTAL,
        ),
        HIST_ITEM_SAFE_TEM_ANT: nullableNumber(
          row.HIST_ITEM_SAFE_TEM_ANT,
        ),
        HIST_ITEM_SAFE_DIAS_DESDE_ULT: nullableNumber(
          row.HIST_ITEM_SAFE_DIAS_DESDE_ULT,
        ),
        HIST_ITEM_SAFE_N_90D: nullableNumber(row.HIST_ITEM_SAFE_N_90D),
        HIST_ITEM_SAFE_N_365D: nullableNumber(row.HIST_ITEM_SAFE_N_365D),
      },
      expectedProbability: Number(row.PROBA_ESPERADA),
      expectedRelativeScore: Number(row.SCORE_RELATIVO_ESPERADO),
    };
  });
};

describe("ML Risk V1 · paridade TypeScript × Golden Vectors Python", () => {
  test("reproduz probabilidade amostral e score relativo nos 25 vetores", async () => {
    const vectors = await loadGoldenVectors();
    expect(vectors).toHaveLength(25);

    vectors.forEach((vector, index) => {
      const result = evaluateMlRiskModelV1(vector.input);
      const probabilityDifference = Math.abs(
        result.sampleProbabilityInternal - vector.expectedProbability,
      );
      const scoreDifference = Math.abs(
        result.mlRelativeScore - vector.expectedRelativeScore,
      );

      if (
        probabilityDifference > PROBABILITY_TOLERANCE ||
        scoreDifference > RELATIVE_SCORE_TOLERANCE
      ) {
        throw new Error(
          JSON.stringify(
            {
              goldenVector: index + 1,
              input: vector.input,
              expectedProbability: vector.expectedProbability,
              typescriptProbability: result.sampleProbabilityInternal,
              probabilityDifference,
              expectedRelativeScore: vector.expectedRelativeScore,
              typescriptRelativeScore: result.mlRelativeScore,
              scoreDifference,
              logit: result.logit,
            },
            null,
            2,
          ),
        );
      }
    });
  });
});
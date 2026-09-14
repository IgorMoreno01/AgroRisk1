import portableModelV1Json from "../../../attached_assets/agrorisk_modelo_portatil_v1_1789008135524.json";

interface NumericFeatureConfig {
  imputer_median: number;
  scaler_mean: number;
  scaler_scale: number;
  coeficiente: number;
}

interface KnownCategoryConfig {
  coeficiente: number;
  onehot_column: string;
}

interface CategoricalFeatureConfig {
  missing_token: string;
  unknown_contribution: number;
  known_categories: Record<string, KnownCategoryConfig>;
  infrequent_categories: string[];
}

interface PortableModelV1Data {
  version: string;
  intercept: number;
  numeric_features: Record<string, NumericFeatureConfig>;
  categorical_features: Record<"COD_MOD" | "UF", CategoricalFeatureConfig>;
  score_reference_sorted: number[];
}

/**
 * Referência direta ao artefato portátil exportado pelo Colab.
 * Os valores, a ordem e a precisão permanecem definidos pelo JSON original.
 */
export const MODEL_V1_DATA =
  portableModelV1Json as PortableModelV1Data;
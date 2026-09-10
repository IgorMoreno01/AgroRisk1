import { MODEL_V1_DATA } from "./model-v1.data";
import type {
  MlRiskComponent,
  MlRiskComponentContribution,
  MlRiskInput,
  MlRiskModelV1Result,
} from "./types";

type NumericFeatureName =
  | "LOG1P_PRECIP_D1"
  | "LOG1P_CHUVA_7D"
  | "LOG1P_CHUVA_30D"
  | "TEMP_MEDIA_D1_C"
  | "TEMP_MEDIA_D1_C_SQ"
  | "TEMP_AMPLITUDE_D1_C"
  | "TEMP_AMPLITUDE_D1_C_SQ"
  | "UMIDADE_D1_PCT"
  | "UMIDADE_D1_PCT_SQ"
  | "VENTO_D1_MS"
  | "ALTITUDE_ML_M"
  | "DOY_SIN"
  | "DOY_COS"
  | "HIST_TEM_ANT"
  | "LOG1P_HIST_N_TOTAL"
  | "LOG1P_HIST_N_90D"
  | "LOG1P_HIST_N_365D"
  | "LOG1P_HIST_DIAS_DESDE_ULT";

const NUMERIC_FEATURE_FAMILY: Record<NumericFeatureName, MlRiskComponent> = {
  LOG1P_PRECIP_D1: "climate",
  LOG1P_CHUVA_7D: "climate",
  LOG1P_CHUVA_30D: "climate",
  TEMP_MEDIA_D1_C: "climate",
  TEMP_MEDIA_D1_C_SQ: "climate",
  TEMP_AMPLITUDE_D1_C: "climate",
  TEMP_AMPLITUDE_D1_C_SQ: "climate",
  UMIDADE_D1_PCT: "climate",
  UMIDADE_D1_PCT_SQ: "climate",
  VENTO_D1_MS: "climate",
  ALTITUDE_ML_M: "structure",
  DOY_SIN: "climate",
  DOY_COS: "climate",
  HIST_TEM_ANT: "history",
  LOG1P_HIST_N_TOTAL: "history",
  LOG1P_HIST_N_90D: "history",
  LOG1P_HIST_N_365D: "history",
  LOG1P_HIST_DIAS_DESDE_ULT: "history",
};

const COMPONENT_LABELS: Record<MlRiskComponent, string> = {
  climate: "Clima",
  structure: "Estrutura do risco",
  history: "Histórico",
};

const COMPONENT_ORDER: readonly MlRiskComponent[] = [
  "climate",
  "structure",
  "history",
];

const DIRECTION_TOLERANCE = 1e-12;

const componentDirection = (
  contribution: number,
): MlRiskComponentContribution["direction"] => {
  if (contribution > DIRECTION_TOLERANCE) return "increase";
  if (contribution < -DIRECTION_TOLERANCE) return "decrease";
  return "neutral";
};

const buildComponents = (
  contributions: Readonly<Record<MlRiskComponent, number>>,
): MlRiskComponentContribution[] =>
  COMPONENT_ORDER.map((component) => ({
    component,
    contribution: contributions[component],
    direction: componentDirection(contributions[component]),
    label: COMPONENT_LABELS[component],
  }));

const finiteOrNaN = (value: number | null): number =>
  value !== null && Number.isFinite(value) ? value : Number.NaN;

const log1pNonNegative = (value: number | null): number => {
  const numericValue = finiteOrNaN(value);
  return Number.isFinite(numericValue)
    ? Math.log1p(Math.max(numericValue, 0))
    : Number.NaN;
};

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/**
 * Interpreta YYYY-MM-DD como data civil, sem conversão de fuso horário.
 */
const dayOfYear = (date: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return Number.NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > monthLengths[month - 1]
  ) {
    return Number.NaN;
  }

  return (
    day +
    monthLengths
      .slice(0, month - 1)
      .reduce((total, daysInMonth) => total + daysInMonth, 0)
  );
};

const engineerNumericFeatures = (
  input: MlRiskInput,
): Record<NumericFeatureName, number> => {
  const temperatureMean = finiteOrNaN(input.TEMP_MEDIA_D1_C);
  const temperatureMax = finiteOrNaN(input.TEMP_MAX_D1_C);
  const temperatureMin = finiteOrNaN(input.TEMP_MIN_D1_C);
  const temperatureAmplitude = temperatureMax - temperatureMin;
  const humidity = finiteOrNaN(input.UMIDADE_D1_PCT);
  const referenceDay = dayOfYear(input.DT_REFERENCIA);
  const seasonalAngle = (2 * Math.PI * referenceDay) / 365.25;

  return {
    LOG1P_PRECIP_D1: log1pNonNegative(input.PRECIPITACAO_D1_MM),
    LOG1P_CHUVA_7D: log1pNonNegative(input.CHUVA_7D_MM),
    LOG1P_CHUVA_30D: log1pNonNegative(input.CHUVA_30D_MM),
    TEMP_MEDIA_D1_C: temperatureMean,
    TEMP_MEDIA_D1_C_SQ: temperatureMean ** 2,
    TEMP_AMPLITUDE_D1_C: temperatureAmplitude,
    TEMP_AMPLITUDE_D1_C_SQ: temperatureAmplitude ** 2,
    UMIDADE_D1_PCT: humidity,
    UMIDADE_D1_PCT_SQ: humidity ** 2,
    VENTO_D1_MS: finiteOrNaN(input.VENTO_D1_MS),
    ALTITUDE_ML_M: finiteOrNaN(input.ALTITUDE_ML_M),
    DOY_SIN: Math.sin(seasonalAngle),
    DOY_COS: Math.cos(seasonalAngle),
    HIST_TEM_ANT: finiteOrNaN(input.HIST_ITEM_SAFE_TEM_ANT),
    LOG1P_HIST_N_TOTAL: log1pNonNegative(input.HIST_ITEM_SAFE_N_TOTAL),
    LOG1P_HIST_N_90D: log1pNonNegative(input.HIST_ITEM_SAFE_N_90D),
    LOG1P_HIST_N_365D: log1pNonNegative(input.HIST_ITEM_SAFE_N_365D),
    LOG1P_HIST_DIAS_DESDE_ULT: log1pNonNegative(
      input.HIST_ITEM_SAFE_DIAS_DESDE_ULT,
    ),
  };
};

const categoricalContribution = (
  feature: "COD_MOD" | "UF",
  value: string | null,
): number => {
  const config = MODEL_V1_DATA.categorical_features[feature];
  const category = value ?? config.missing_token;
  return (
    config.known_categories[category]?.coeficiente ??
    config.unknown_contribution
  );
};

const stableSigmoid = (logit: number): number => {
  if (logit >= 0) {
    const inverseExponent = Math.exp(-logit);
    return 1 / (1 + inverseExponent);
  }

  const exponent = Math.exp(logit);
  return exponent / (1 + exponent);
};

/**
 * Retorna a posição após o último valor menor ou igual ao alvo.
 */
const upperBound = (sortedValues: readonly number[], target: number): number => {
  let low = 0;
  let high = sortedValues.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (sortedValues[middle] <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
};

export const evaluateMlRiskModelV1 = (
  input: MlRiskInput,
): MlRiskModelV1Result => {
  const engineered = engineerNumericFeatures(input);
  let logit = MODEL_V1_DATA.intercept;
  const familyContributions: Record<MlRiskComponent, number> = {
    climate: 0,
    structure: 0,
    history: 0,
  };

  for (const [name, config] of Object.entries(
    MODEL_V1_DATA.numeric_features,
  )) {
    const featureName = name as NumericFeatureName;
    const engineeredValue = engineered[featureName];
    const imputedValue = Number.isFinite(engineeredValue)
      ? engineeredValue
      : config.imputer_median;
    const scaledValue =
      (imputedValue - config.scaler_mean) / config.scaler_scale;
    const featureContribution = scaledValue * config.coeficiente;
    logit += featureContribution;
    familyContributions[NUMERIC_FEATURE_FAMILY[featureName]] +=
      featureContribution;
  }

  const codModContribution = categoricalContribution("COD_MOD", input.COD_MOD);
  logit += codModContribution;
  familyContributions.structure += codModContribution;

  const ufContribution = categoricalContribution("UF", input.UF);
  logit += ufContribution;
  familyContributions.structure += ufContribution;

  const sampleProbabilityInternal = stableSigmoid(logit);
  const referencePosition = upperBound(
    MODEL_V1_DATA.score_reference_sorted,
    sampleProbabilityInternal,
  );
  const mlRelativeScore =
    (100 * referencePosition) / MODEL_V1_DATA.score_reference_sorted.length;

  return {
    modelVersion: MODEL_V1_DATA.version,
    logit,
    sampleProbabilityInternal,
    mlRelativeScore,
    components: buildComponents(familyContributions),
  };
};
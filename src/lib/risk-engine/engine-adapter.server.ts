import {
  evaluateRiskEngineV2,
  type RiskEngineV2EvaluationInput,
} from "../risk-engine-v2/evaluate";
import type { RiskEngineV2Result } from "../risk-engine-v2/types";
import type { RiskEngineMode } from "./engine-mode.server";

export interface RiskEngineV1ComparableResult {
  finalScore: number;
  level: string;
}

export interface RiskEngineAdapterInput<
  TV1Input,
  TV1Result extends RiskEngineV1ComparableResult,
> {
  mode: RiskEngineMode;
  v1Input: TV1Input;
  evaluateV1: (input: TV1Input) => TV1Result;
  v2Input?: RiskEngineV2EvaluationInput;
  shadow?: boolean;
}

export interface RiskEngineShadowComparison {
  v1FinalScore: number;
  v2FinalScore: number;
  /** Diferença diagnóstica v2FinalScore - v1FinalScore. */
  difference: number;
  v1Level: string;
  v2Level: RiskEngineV2Result["level"];
}

export type RiskEngineShadowResult =
  | {
      status: "available";
      comparison: RiskEngineShadowComparison;
    }
  | {
      status: "not_available";
    };

export type RiskEngineAdapterResult<
  TV1Result extends RiskEngineV1ComparableResult,
> =
  | {
      mode: "v1";
      official: {
        engine: "v1";
        result: TV1Result;
      };
      shadow?: RiskEngineShadowResult;
    }
  | {
      mode: "v2";
      official: {
        engine: "v2";
        result: RiskEngineV2Result;
      };
    };

export const evaluateWithRiskEngineAdapter = <
  TV1Input,
  TV1Result extends RiskEngineV1ComparableResult,
>(
  input: RiskEngineAdapterInput<TV1Input, TV1Result>,
): RiskEngineAdapterResult<TV1Result> => {
  if (input.mode === "v2") {
    if (!input.v2Input) {
      throw new Error(
        "Risk Engine V2 requer v2Input explicitamente preparado.",
      );
    }

    return {
      mode: "v2",
      official: {
        engine: "v2",
        result: evaluateRiskEngineV2(input.v2Input),
      },
    };
  }

  const v1Result = input.evaluateV1(input.v1Input);

  if (!input.shadow) {
    return {
      mode: "v1",
      official: {
        engine: "v1",
        result: v1Result,
      },
    };
  }

  if (!input.v2Input) {
    return {
      mode: "v1",
      official: {
        engine: "v1",
        result: v1Result,
      },
      shadow: {
        status: "not_available",
      },
    };
  }

  const v2Result = evaluateRiskEngineV2(input.v2Input);

  return {
    mode: "v1",
    official: {
      engine: "v1",
      result: v1Result,
    },
    shadow: {
      status: "available",
      comparison: {
        v1FinalScore: v1Result.finalScore,
        v2FinalScore: v2Result.finalScore,
        difference: v2Result.finalScore - v1Result.finalScore,
        v1Level: v1Result.level,
        v2Level: v2Result.level,
      },
    },
  };
};
import { describe, expect, test } from "bun:test";
import { calculateSafeItemHistoryFeatures } from "../src/lib/insurance-risk/history-features";
import type {
  InsuranceClaimEvent,
  InsuranceItemIdentity,
} from "../src/lib/insurance-risk/types";

const IDENTITY: InsuranceItemIdentity = {
  codApo: "APO-001",
  codItem: "ITEM-01",
  codMod: "50",
  uf: "SP",
};

const event = (
  occurredOn: string,
  identity: InsuranceItemIdentity = IDENTITY,
): InsuranceClaimEvent => ({
  identity,
  occurredOn,
  eventCode: `EVENT-${occurredOn}`,
});

describe("Histórico seguro por item", () => {
  test("representa corretamente a ausência de evento anterior", () => {
    expect(
      calculateSafeItemHistoryFeatures(
        IDENTITY,
        "2024-06-15",
        [],
      ),
    ).toEqual({
      HIST_ITEM_SAFE_N_TOTAL: 0,
      HIST_ITEM_SAFE_TEM_ANT: 0,
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: null,
      HIST_ITEM_SAFE_N_90D: 0,
      HIST_ITEM_SAFE_N_365D: 0,
    });
  });

  test("calcula um evento ocorrido um dia antes", () => {
    expect(
      calculateSafeItemHistoryFeatures(
        IDENTITY,
        "2024-06-15",
        [event("2024-06-14")],
      ),
    ).toEqual({
      HIST_ITEM_SAFE_N_TOTAL: 1,
      HIST_ITEM_SAFE_TEM_ANT: 1,
      HIST_ITEM_SAFE_DIAS_DESDE_ULT: 1,
      HIST_ITEM_SAFE_N_90D: 1,
      HIST_ITEM_SAFE_N_365D: 1,
    });
  });

  test("conta múltiplos eventos anteriores", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [
        event("2024-06-14"),
        event("2024-05-01"),
        event("2023-01-01"),
      ],
    );

    expect(result.HIST_ITEM_SAFE_N_TOTAL).toBe(3);
    expect(result.HIST_ITEM_SAFE_TEM_ANT).toBe(1);
  });

  test("exclui evento ocorrido na própria data de referência", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2024-06-15")],
    );

    expect(result.HIST_ITEM_SAFE_N_TOTAL).toBe(0);
    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBeNull();
  });

  test("exclui evento futuro", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2024-06-16")],
    );

    expect(result.HIST_ITEM_SAFE_N_TOTAL).toBe(0);
  });

  test("inclui eventos dentro da janela de 90 dias", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2024-03-18")],
    );

    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBe(89);
    expect(result.HIST_ITEM_SAFE_N_90D).toBe(1);
  });

  test("inclui o limite exato de 90 dias", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2024-03-17")],
    );

    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBe(90);
    expect(result.HIST_ITEM_SAFE_N_90D).toBe(1);
  });

  test("exclui 91 dias da janela de 90 dias", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2024-03-16")],
    );

    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBe(91);
    expect(result.HIST_ITEM_SAFE_N_90D).toBe(0);
    expect(result.HIST_ITEM_SAFE_N_365D).toBe(1);
  });

  test("inclui o limite exato de 365 dias", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2023-06-16")],
    );

    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBe(365);
    expect(result.HIST_ITEM_SAFE_N_365D).toBe(1);
  });

  test("exclui 366 dias da janela de 365 dias", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2023-06-15")],
    );

    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBe(366);
    expect(result.HIST_ITEM_SAFE_N_365D).toBe(0);
  });

  test("usa o evento anterior mais recente para dias desde o último", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [
        event("2023-06-16"),
        event("2024-06-14"),
        event("2024-03-17"),
      ],
    );

    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBe(1);
  });

  test("ignora eventos de outra chave securitária", () => {
    const otherIdentity: InsuranceItemIdentity = {
      ...IDENTITY,
      codItem: "ITEM-02",
    };
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [event("2024-06-14", otherIdentity)],
    );

    expect(result.HIST_ITEM_SAFE_N_TOTAL).toBe(0);
  });

  test("calcula corretamente a diferença durante ano bissexto", () => {
    const result = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-03-01",
      [event("2024-02-28")],
    );

    expect(result.HIST_ITEM_SAFE_DIAS_DESDE_ULT).toBe(2);
  });

  test("a ordem dos eventos não altera o resultado", () => {
    const events = [
      event("2024-06-14"),
      event("2024-03-17"),
      event("2023-06-16"),
    ];

    const forward = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      events,
    );
    const reversed = calculateSafeItemHistoryFeatures(
      IDENTITY,
      "2024-06-15",
      [...events].reverse(),
    );

    expect(reversed).toEqual(forward);
  });
});
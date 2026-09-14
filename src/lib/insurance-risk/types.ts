/**
 * Chave securitária histórica de origem SUSEP.
 *
 * Estes códigos não devem ser derivados de IDs internos, tipo de máquina ou
 * tipo de operação sem uma fonte securitária semanticamente equivalente.
 */
export interface InsuranceItemIdentity {
  /** Código da apólice (COD_APO). */
  codApo: string;
  /** Código do item segurado (COD_ITEM). */
  codItem: string;
  /** Código de modalidade SUSEP (COD_MOD). */
  codMod: string;
  /** Unidade federativa associada ao item no histórico SUSEP (UF). */
  uf: string;
}

/**
 * Evento seguro histórico em data civil YYYY-MM-DD.
 */
export interface InsuranceClaimEvent {
  identity: InsuranceItemIdentity;
  occurredOn: string;
  eventCode?: string;
  eventType?: string;
}

/**
 * Features históricas esperadas pelo modelo portátil.
 */
export interface SafeItemHistoryFeatures {
  HIST_ITEM_SAFE_N_TOTAL: number;
  HIST_ITEM_SAFE_TEM_ANT: 0 | 1;
  HIST_ITEM_SAFE_DIAS_DESDE_ULT: number | null;
  HIST_ITEM_SAFE_N_90D: number;
  HIST_ITEM_SAFE_N_365D: number;
}
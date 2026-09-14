import type {
  InsuranceClaimEvent,
  InsuranceItemIdentity,
} from "./types";

/**
 * Contrato de leitura para uma futura fonte securitária real.
 *
 * TIdentitySource é definido pela integração concreta. Isso evita presumir
 * que IDs internos de máquina ou operação equivalem a códigos SUSEP.
 */
export interface InsuranceHistoryRepository<TIdentitySource> {
  resolveIdentity(
    source: TIdentitySource,
  ): Promise<InsuranceItemIdentity | undefined>;

  /**
   * Deve retornar somente eventos da mesma identidade cuja data civil
   * satisfaça occurredOn < referenceDate.
   */
  listEventsBefore(
    identity: InsuranceItemIdentity,
    referenceDate: string,
  ): Promise<InsuranceClaimEvent[]>;
}
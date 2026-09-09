import { mockRepository } from "./mock-repository.server";
import { postgresRepository } from "./postgres-repository.server";
import type { AgroRiskDataSource, AgroRiskRepository } from "./repository";

export type { AgroRiskDataSource, AgroRiskRepository } from "./repository";

export function getAgroRiskRepository(
  source: AgroRiskDataSource = "mock",
): AgroRiskRepository {
  return source === "postgres" ? postgresRepository : mockRepository;
}
import { listOperationRiskContexts, upsertOperationRiskInputSnapshot, closePostgresRepository } from "../src/lib/data/postgres-repository.server";
import {
  buildPreparedOperationRiskInput,
  prepareOperationRiskExternalPayload,
  summarizePreparationCoverage,
} from "../src/lib/risk-engine-v2/prepare-operation-input.server";
import type { PreparedOperationRiskInput } from "../src/lib/risk-engine-v2/prepared-input";

type Summary = {
  totalOperations: number;
  snapshotsGenerated: number;
  snapshotsWithRealClimate: number;
  snapshotsWithRealAltitude: number;
  snapshotsWithRealWater: number;
  snapshotsWithValidatedTerrain: number;
  imputedFields: number;
  syntheticFields: number;
  failures: Array<{ operationId: string; error: string }>;
};

async function main() {
  const requestedIds = process.argv.slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .flatMap((arg) => arg.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const contexts = await listOperationRiskContexts({
    operationIds: requestedIds.length > 0 ? requestedIds : undefined,
  });
  const summary: Summary = {
    totalOperations: contexts.length,
    snapshotsGenerated: 0,
    snapshotsWithRealClimate: 0,
    snapshotsWithRealAltitude: 0,
    snapshotsWithRealWater: 0,
    snapshotsWithValidatedTerrain: 0,
    imputedFields: 0,
    syntheticFields: 0,
    failures: [],
  };
  const externalPayloadByFarmLocationDate = new Map<
    string,
    ReturnType<typeof prepareOperationRiskExternalPayload>
  >();

  // The adapters' cache, in-flight deduplication and circuit breakers are
  // process-local and shared by this whole pass. There is intentionally no
  // preparation call from a dashboard/request handler.
  for (const context of contexts) {
    try {
      // This key deliberately excludes operationId. Provider inputs are
      // shared for the same farm/location/reference date while the returned
      // record receives each operation's identity and operation type below.
      const key = [
        context.farm.id,
        context.farm.municipality.trim().toLocaleLowerCase("pt-BR"),
        context.farm.state.trim().toUpperCase(),
        context.operation.scheduledAt.slice(0, 10),
      ].join("|");
      let payload = externalPayloadByFarmLocationDate.get(key);
      if (!payload) {
        payload = prepareOperationRiskExternalPayload(context);
        externalPayloadByFarmLocationDate.set(key, payload);
      }
      // Only provider payload is shared. Terrain, operation type, provenance,
      // operation identity and timestamps are rebuilt for each context.
      const snapshot: PreparedOperationRiskInput = buildPreparedOperationRiskInput(
        context,
        await payload,
      );
      await upsertOperationRiskInputSnapshot(snapshot);
      const coverage = summarizePreparationCoverage(snapshot);
      summary.snapshotsGenerated++;
      if (coverage.climateReal) summary.snapshotsWithRealClimate++;
      if (coverage.altitudeReal) summary.snapshotsWithRealAltitude++;
      if (coverage.waterReal) summary.snapshotsWithRealWater++;
      if (coverage.terrainValidated) summary.snapshotsWithValidatedTerrain++;
      summary.imputedFields += coverage.missingFields;
      summary.syntheticFields += coverage.syntheticFields;
    } catch (error) {
      summary.failures.push({
        operationId: context.operation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} finally {
  await closePostgresRepository();
}
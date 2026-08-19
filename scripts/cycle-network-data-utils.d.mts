export const CYCLE_NETWORK_CHUNK_ZOOM: number;
export const CYCLE_NETWORK_SCHEMA_VERSION: number;

export function createCycleNetworkManifestReleaseId(input: {
  chunks: Record<string, { byteLength: number; count: number; path: string }>;
  recordCount: number;
}): string;

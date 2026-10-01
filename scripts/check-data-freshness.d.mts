import type { GeofabrikOptions } from './geofabrik-download.mjs';
export function checkDataFreshness(
  freshness: {
    osmInputsMatch: boolean;
    datasets: {
      id: string;
      oldestSourceAt: string | null;
      complete: boolean;
      mixedAge: boolean;
      releaseId: string;
      inputs: {
        id: string;
        sourceUrl: string;
        sourceTimestamp: string;
        retrievedAt?: string;
      }[];
    }[];
  },
  options?: GeofabrikOptions & { checkUpstream?: boolean },
): Promise<{
  checkedAt: string;
  osmInputsMatch: boolean;
  datasets: {
    id: string;
    ageDays: number | null;
    stale: boolean;
    complete: boolean;
    mixedAge: boolean;
    releaseId: string;
  }[];
  upstream: {
    id: string;
    error?: string;
    sourceTimestamp?: string;
    newerPublication?: boolean;
    downloadUrl?: string;
    fallback?: boolean;
  }[];
}>;

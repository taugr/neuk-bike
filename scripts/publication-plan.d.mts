import type {
  GeofabrikOptions,
  GeofabrikSource,
} from './geofabrik-download.mjs';
type Input = { id: string; url: string };
export type PublicationPlan = {
  schemaVersion: number;
  invocationId: string;
  codeRevision: string;
  createdAt: string;
  expiresAt: string;
  sources: (GeofabrikSource & { id: string; validatedAt: string })[];
};
export type PlanContext = {
  invocationId: string;
  codeRevision: string;
  digest: string;
};
export function planDigest(plan: PublicationPlan): string;
export function validatePublicationPlan(
  plan: PublicationPlan,
  context: PlanContext,
  now?: number,
  inputs?: Input[],
): PublicationPlan;
export function createPublicationPlan(
  codeRevision: string,
  options?: GeofabrikOptions,
  inputs?: Input[],
): Promise<{ plan: PublicationPlan; context: PlanContext }>;
export function openPublicationPlan(
  env?: Record<string, string | undefined>,
  options?: GeofabrikOptions,
  inputs?: Input[],
): Promise<null | {
  context: PlanContext;
  load(): Promise<PublicationPlan>;
  receipts(): Promise<{
    planDigest: string;
    inputs: Record<string, { sha256: string }>;
  }>;
  download(input: {
    url: string;
    outputPath: string;
    forceDownload?: boolean;
    label?: string;
  }): Promise<
    GeofabrikSource & {
      sha256: string;
      cached: boolean;
      publicationPlanId: string;
    }
  >;
  assertRelease(
    freshness: {
      datasets: {
        id: string;
        inputs: {
          id: string;
          sourceUrl: string;
          downloadUrl?: string;
          sourceTimestamp: string;
          publicationPlanId?: string;
          publicationValidatedAt?: string;
          publishedAt?: string;
          sha256: string;
        }[];
      }[];
    },
    selected: string[],
  ): Promise<PublicationPlan>;
}>;

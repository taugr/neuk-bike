export type GeofabrikOptions = {
  now?: number;
  fetcher?: typeof fetch;
  log?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  preferDated?: boolean;
};
export type GeofabrikPublication = {
  latestUrl: string;
  datedUrl: string;
  sourceTimestamp: string;
  bytes: number;
  publishedAt: string;
};
export type GeofabrikSource = GeofabrikPublication & {
  downloadUrl: string;
  lastModified: string | null;
  etag: string | null;
  fallback: boolean;
};
export const maximumSourceAgeDays: number;
export function describeDownloadError(error: unknown): string;
export function validateSourceTimestamp(
  timestamp: string | undefined,
  now?: number,
): string;
export function parsePublication(
  html: string,
  latestUrl: string,
  now?: number,
): GeofabrikPublication;
export function validatePbfFile(
  path: string,
  expectedTimestamp?: string,
  now?: number,
): Promise<string>;
export function resolveGeofabrikExtract(
  latestUrl: string,
  options?: GeofabrikOptions,
): Promise<GeofabrikSource>;
export function downloadGeofabrikExtract(
  input: {
    url: string;
    outputPath: string;
    forceDownload?: boolean;
    label?: string;
  },
  options?: GeofabrikOptions,
): Promise<
  | { sourceTimestamp: string; cached: true }
  | (GeofabrikSource & { sha256: string; cached: false })
>;

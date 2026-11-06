export type SourceReadinessStatus = {
  state: string;
  attempt: number;
  startedAt: string;
  deadlineAt: string;
  checkedAt: string;
  sourceId?: string | null;
  error?: string;
  retryable?: boolean;
  timedOut?: boolean;
  nextCheckAt?: string;
};
export function waitForSources<T>(
  check: () => Promise<T>,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    onStatus?: (status: SourceReadinessStatus) => Promise<void>;
    log?: (message: string) => void;
  },
): Promise<T>;

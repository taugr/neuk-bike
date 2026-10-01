export function promoteStagedPaths(
  stagingRoot: string,
  destinationRoot: string,
  paths: string[],
  move?: (from: string, to: string) => Promise<void>,
): Promise<void>;
export const maximumSourceAgeDays: number;
export function assertFreshOsmRelease(
  datasets: {
    id: string;
    oldestSourceAt: string | null;
    complete: boolean;
    mixedAge: boolean;
  }[],
  now?: number,
): void;
export function summarizeSourceDates(
  inputs: { id: string; sourceTimestamp: string | null }[],
  expectedIds: string[],
): {
  oldestSourceAt: string | null;
  newestSourceAt: string | null;
  inputCount: number;
  expectedInputCount: number;
  missingInputs: string[];
  unknownTimestampInputs: string[];
  mixedAge: boolean;
  complete: boolean;
};

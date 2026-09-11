export function promoteStagedPaths(
  stagingRoot: string,
  destinationRoot: string,
  paths: string[],
  move?: (from: string, to: string) => Promise<void>,
): Promise<void>;
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

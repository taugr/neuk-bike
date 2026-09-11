import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Promote a verified set on one filesystem, restoring every previous path on failure. */
export async function promoteStagedPaths(
  stagingRoot,
  destinationRoot,
  paths,
  move = rename,
) {
  const completed = [];
  try {
    for (const path of paths) {
      const destination = resolve(destinationRoot, path);
      const staged = resolve(stagingRoot, path);
      const previous = resolve(stagingRoot, '.previous', path);
      await mkdir(dirname(destination), { recursive: true });
      await mkdir(dirname(previous), { recursive: true });
      const entry = {
        destination,
        staged,
        previous,
        backedUp: false,
        installed: false,
      };
      completed.push(entry);
      if (await exists(destination)) {
        await move(destination, previous);
        entry.backedUp = true;
      }
      await move(staged, destination);
      entry.installed = true;
    }
  } catch (error) {
    for (const entry of completed.reverse()) {
      if (entry.installed) await rename(entry.destination, entry.staged);
      if (entry.backedUp) await rename(entry.previous, entry.destination);
    }
    throw error;
  }
}

export function summarizeSourceDates(inputs, expectedIds) {
  const ids = new Set(inputs.map((input) => input.id));
  const missingInputs = expectedIds.filter((id) => !ids.has(id));
  const unknownTimestampInputs = inputs
    .filter((input) => !Number.isFinite(Date.parse(input.sourceTimestamp)))
    .map((input) => input.id);
  const dates = inputs
    .map((input) => input.sourceTimestamp)
    .filter((date) => Number.isFinite(Date.parse(date)))
    .sort();
  const oldestSourceAt = dates[0] ?? null;
  const newestSourceAt = dates.at(-1) ?? null;
  return {
    oldestSourceAt,
    newestSourceAt,
    inputCount: inputs.length,
    expectedInputCount: expectedIds.length,
    missingInputs,
    unknownTimestampInputs,
    mixedAge:
      oldestSourceAt !== null &&
      newestSourceAt !== null &&
      Date.parse(newestSourceAt) - Date.parse(oldestSourceAt) > 2 * 86_400_000,
    complete:
      missingInputs.length === 0 &&
      unknownTimestampInputs.length === 0 &&
      ids.size === expectedIds.length &&
      inputs.length === ids.size,
  };
}

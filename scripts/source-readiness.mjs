import { describeDownloadError } from './geofabrik-download.mjs';

// Poll before pinning a release. Never return an incomplete check or reuse a
// partially resolved plan from an earlier attempt.
export async function waitForSources(
  check,
  {
    timeoutMs = 4 * 60 * 60_000,
    intervalMs = 15 * 60_000,
    now = Date.now,
    sleep = (ms) => new Promise((accept) => setTimeout(accept, ms)),
    onStatus = async () => {},
    log = console.log,
  } = {},
) {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0
  )
    throw new Error('Source wait timeout and interval must be positive');
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    let result;
    let failure;
    try {
      result = await check();
    } catch (error) {
      failure = error;
    }
    const checkedAt = now();
    const retry = failure?.retryable === true && checkedAt < deadline;
    const status = {
      state: failure ? (retry ? 'waiting' : 'failed') : 'ready',
      attempt,
      startedAt: new Date(startedAt).toISOString(),
      deadlineAt: new Date(deadline).toISOString(),
      checkedAt: new Date(checkedAt).toISOString(),
      ...(failure
        ? {
            sourceId: failure.sourceId ?? null,
            error: describeDownloadError(failure),
            retryable: failure.retryable === true,
            timedOut: failure.retryable === true && !retry,
          }
        : {}),
      ...(retry
        ? {
            nextCheckAt: new Date(
              Math.min(deadline, checkedAt + intervalMs),
            ).toISOString(),
          }
        : {}),
    };
    await onStatus(status);
    if (!failure) return result;
    if (!retry) throw failure;
    log(
      `Waiting for sources (${status.sourceId ?? 'upstream'}): ${status.error}. Next check: ${status.nextCheckAt}`,
    );
    await sleep(Math.min(intervalMs, deadline - checkedAt));
    if (now() >= deadline) {
      await onStatus({
        ...status,
        state: 'failed',
        checkedAt: new Date(now()).toISOString(),
        nextCheckAt: undefined,
        timedOut: true,
      });
      throw failure;
    }
  }
}

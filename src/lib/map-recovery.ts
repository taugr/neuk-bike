const retryDelays = [2_000, 5_000, 15_000];

/** Bounded retries: a provider outage must not become an endless tile reload. */
export function createMapRecovery({
  canRecover,
  recover,
}: {
  canRecover: () => boolean;
  recover: (signal: AbortSignal) => Promise<void>;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let pending = false;
  let running = false;

  const schedule = () => {
    if (
      controller.signal.aborted ||
      timer !== undefined ||
      running ||
      !pending ||
      !canRecover() ||
      attempts >= retryDelays.length
    )
      return;

    const retry = async () => {
      timer = undefined;
      if (!canRecover() || controller.signal.aborted) return;
      attempts += 1;
      pending = false;
      running = true;
      try {
        await recover(controller.signal);
      } catch {
        pending = true;
      } finally {
        running = false;
        schedule();
      }
    };
    timer = setTimeout(() => {
      void retry();
    }, retryDelays[attempts]);
  };

  return {
    fail() {
      pending = true;
      schedule();
    },
    resume() {
      // Resuming a PWA need not produce an online event. Give outstanding
      // failures another bounded attempt when the page becomes usable again.
      if (!canRecover()) return;
      attempts = 0;
      schedule();
    },
    dispose() {
      controller.abort();
      clearTimeout(timer);
    },
  };
}

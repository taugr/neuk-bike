import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMapRecovery } from './map-recovery';

describe('map recovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces tile failures and bounds retries during a provider outage', async () => {
    const recover = vi.fn().mockRejectedValue(new Error('unreachable'));
    const recovery = createMapRecovery({ canRecover: () => true, recover });
    for (let i = 0; i < 20; i++) recovery.fail();
    await vi.runAllTimersAsync();
    expect(recover).toHaveBeenCalledTimes(3);
    recovery.resume();
    await vi.runAllTimersAsync();
    expect(recover).toHaveBeenCalledTimes(6);
    recovery.dispose();
  });

  it('waits for a visible online page and does not reload a healthy map on resume', async () => {
    let available = false;
    const recover = vi.fn().mockResolvedValue(undefined);
    const recovery = createMapRecovery({
      canRecover: () => available,
      recover,
    });
    recovery.fail();
    await vi.runAllTimersAsync();
    expect(recover).not.toHaveBeenCalled();
    available = true;
    recovery.resume();
    await vi.runAllTimersAsync();
    expect(recover).toHaveBeenCalledTimes(1);
    recovery.resume();
    await vi.runAllTimersAsync();
    expect(recover).toHaveBeenCalledTimes(1);
    recovery.dispose();
  });

  it('retains failures that arrive while a style recovery is running', async () => {
    let finish: () => void = () => {};
    const recover = vi.fn().mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const recovery = createMapRecovery({ canRecover: () => true, recover });
    recovery.fail();
    await vi.advanceTimersByTimeAsync(2_000);
    recovery.fail();
    recovery.resume();
    expect(recover).toHaveBeenCalledTimes(1);
    finish();
    await vi.runAllTimersAsync();
    expect(recover).toHaveBeenCalledTimes(2);
    recovery.dispose();
  });

  it('cancels scheduled retries and aborts an in-flight request on disposal', async () => {
    let signal: AbortSignal | undefined;
    const recover = vi.fn(async (value: AbortSignal) => {
      signal = value;
    });
    const recovery = createMapRecovery({ canRecover: () => true, recover });
    recovery.fail();
    await vi.runAllTimersAsync();
    recovery.fail();
    recovery.dispose();
    await vi.runAllTimersAsync();
    expect(signal?.aborted).toBe(true);
    expect(recover).toHaveBeenCalledTimes(1);
  });
});

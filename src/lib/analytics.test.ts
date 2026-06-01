import posthog from 'posthog-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureAnalyticsEvent, shouldEnableAnalytics } from '@/lib/analytics';

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}));

const posthogCapture = vi.mocked(posthog.capture);

describe('analytics enablement', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('disables analytics outside production', () => {
    expect(
      shouldEnableAnalytics({
        hostname: 'neuk.bike',
        nodeEnv: 'development',
        posthogKey: 'phc_test',
      }),
    ).toBe(false);
  });

  it('keeps production analytics enabled without a browser window', () => {
    expect(
      shouldEnableAnalytics({
        hostname: null,
        nodeEnv: 'production',
        posthogKey: 'phc_test',
      }),
    ).toBe(true);
  });

  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])(
    'disables production analytics on %s',
    (hostname) => {
      expect(
        shouldEnableAnalytics({
          hostname,
          nodeEnv: 'production',
          posthogKey: 'phc_test',
        }),
      ).toBe(false);
    },
  );

  it('allows an explicit force-enable override on local hosts', () => {
    expect(
      shouldEnableAnalytics({
        forceEnable: 'true',
        hostname: 'localhost',
        nodeEnv: 'production',
        posthogKey: 'phc_test',
      }),
    ).toBe(true);
  });

  it('enables production analytics on deployed hosts', () => {
    expect(
      shouldEnableAnalytics({
        hostname: 'neuk.bike',
        nodeEnv: 'production',
        posthogKey: 'phc_test',
      }),
    ).toBe(true);
  });

  it('does not capture events when analytics are disabled', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
      },
    });

    captureAnalyticsEvent('location_requested');

    expect(posthogCapture).not.toHaveBeenCalled();
  });
});

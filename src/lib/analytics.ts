import posthog from 'posthog-js';

type AnalyticsRuntime = {
  forceEnable?: string;
  hostname?: string | null;
  nodeEnv?: string;
  posthogKey?: string;
};

function getBrowserHostname() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.hostname;
}

export function isLocalAnalyticsHost(hostname: string | null | undefined) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

export function shouldEnableAnalytics(runtime: AnalyticsRuntime = {}) {
  const nodeEnv = runtime.nodeEnv ?? process.env.NODE_ENV;
  const posthogKey = runtime.posthogKey ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const forceEnable =
    runtime.forceEnable ?? process.env.NEXT_PUBLIC_POSTHOG_FORCE_ENABLE;
  const hostname = runtime.hostname ?? getBrowserHostname();

  if (nodeEnv !== 'production' || !posthogKey) {
    return false;
  }

  if (forceEnable === 'true') {
    return true;
  }

  return !isLocalAnalyticsHost(hostname);
}

export function isAnalyticsEnabled() {
  return shouldEnableAnalytics();
}

export function captureAnalyticsEvent(
  eventName: string,
  properties?: Record<string, unknown>,
) {
  if (!isAnalyticsEnabled()) {
    return;
  }

  posthog.capture(eventName, properties);
}

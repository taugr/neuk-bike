import posthog from 'posthog-js';

export const isAnalyticsEnabled = process.env.NODE_ENV === 'production';

export function captureAnalyticsEvent(
  eventName: string,
  properties?: Record<string, unknown>,
) {
  if (!isAnalyticsEnabled) {
    return;
  }

  posthog.capture(eventName, properties);
}

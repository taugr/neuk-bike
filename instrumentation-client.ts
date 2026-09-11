import posthog from 'posthog-js';
import { isAnalyticsEnabled, isAnalyticsTestTraffic } from '@/lib/analytics';
import { redactAnalyticsUrl } from '@/lib/analytics-privacy';

const urlPropertyNames = [
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
] as const;

if (isAnalyticsEnabled()) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-01-30',
    cookieless_mode: 'always',
    autocapture: false,
    person_profiles: 'never',
    disable_session_recording: true,
    // Route failures are measured with bounded reason codes. Arbitrary error
    // messages/stack URLs can contain location-bearing request data.
    capture_exceptions: false,
    before_send: (event) => {
      if (!event) {
        return event;
      }
      if (event.event === '$exception') return null;
      event.properties.is_test = isAnalyticsTestTraffic();

      for (const propertyName of urlPropertyNames) {
        if (event.properties?.[propertyName]) {
          event.properties[propertyName] = redactAnalyticsUrl(
            event.properties[propertyName],
          );
        }
      }

      return event;
    },
  });
}

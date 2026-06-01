import posthog from 'posthog-js';
import { isAnalyticsEnabled } from '@/lib/analytics';

const urlPropertyNames = [
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
] as const;

const locationQueryParamNames = ['lat', 'lng'] as const;

function redactLocationQueryParams(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const url = new URL(value, window.location.origin);
    for (const paramName of locationQueryParamNames) {
      if (url.searchParams.has(paramName)) {
        url.searchParams.set(paramName, '0');
      }
    }

    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

if (isAnalyticsEnabled()) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-01-30',
    cookieless_mode: 'always',
    autocapture: false,
    capture_exceptions: true,
    before_send: (event) => {
      if (!event) {
        return event;
      }

      for (const propertyName of urlPropertyNames) {
        if (event.properties?.[propertyName]) {
          event.properties[propertyName] = redactLocationQueryParams(
            event.properties[propertyName],
          );
        }
      }

      return event;
    },
  });
}

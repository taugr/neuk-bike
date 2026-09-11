import { describe, expect, it } from 'vitest';
import {
  redactAnalyticsUrl,
  sanitizeAnalyticsProperties,
} from '@/lib/analytics-privacy';

describe('analytics privacy boundary', () => {
  it('drops location data, names, free text, nested data, and unknown fields', () => {
    expect(
      sanitizeAnalyticsProperties({
        parking_id: 'cec:1',
        parking_name: 'Home',
        place_name: 'Edinburgh',
        latitude: 55.95,
        longitude: -3.19,
        route: [[55, -3]],
        query: 'my address',
        source: 'private address',
        result_count: 3,
        error: false,
        nested: { lat: 55 },
      }),
    ).toEqual({ result_count: 3, error: false });
  });
  it('accepts bounded categories and ephemeral identifiers, rejecting malformed values', () => {
    expect(
      sanitizeAnalyticsProperties({
        journey_id: 'cec:1',
        attempt_id: 'eb89c88a-5cef-47fc-bbfe-727ee8c66bee',
        category: 'repair,water',
        stop_count: Infinity,
        plan_count: -1,
        result_rank: 1.2,
      }),
    ).toEqual({
      attempt_id: 'eb89c88a-5cef-47fc-bbfe-727ee8c66bee',
      category: 'repair,water',
    });
  });
  it.each([
    'https://neuk.bike/?lat=55&lng=-3&parking=cec:1',
    'https://neuk.bike/?route=encoded-private-route#secret',
    'https://neuk.bike/#route=private',
  ])('strips the entire location-bearing query and fragment from %s', (url) => {
    expect(redactAnalyticsUrl(url)).toBe('https://neuk.bike/');
  });
  it('fails closed for malformed URLs', () => {
    expect(redactAnalyticsUrl('private location')).toBe('');
  });
});

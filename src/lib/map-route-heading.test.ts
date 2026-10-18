import { expect, test } from 'vitest';
import { getScreenHeading } from './map-route-heading';

test('projects the heading through rotation and pitch without rotating the bike', () => {
  const flat = ([lng, lat]: [number, number]) => ({ x: lng, y: -lat });
  expect(getScreenHeading([0, 0], 0, flat)).toBeCloseTo(0);
  expect(getScreenHeading([0, 0], 90, flat)).toBeCloseTo(90);
  const eastUp = ([lng, lat]: [number, number]) => ({ x: -lat, y: -lng });
  expect(getScreenHeading([0, 0], 0, eastUp)).toBeCloseTo(-90);
  expect(getScreenHeading([0, 0], 90, eastUp)).toBeCloseTo(0);
  const tilted = ([lng, lat]: [number, number]) => ({ x: lng, y: -lat * 0.5 });
  expect(getScreenHeading([0, 0], 45, tilted)).toBeCloseTo(63.435, 2);
});

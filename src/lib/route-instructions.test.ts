import { describe, expect, it } from 'vitest';
import { getRouteInstructionManeuver } from '@/lib/route-instructions';

describe('getRouteInstructionManeuver', () => {
  it('classifies known route instruction turns', () => {
    expect(getRouteInstructionManeuver({ turn: 'start' })).toBe('start');
    expect(getRouteInstructionManeuver({ turn: 'arrive' })).toBe('arrive');
    expect(getRouteInstructionManeuver({ turn: 'Turn left' })).toBe('left');
    expect(getRouteInstructionManeuver({ turn: 'Bear right' })).toBe('right');
    expect(getRouteInstructionManeuver({ turn: 'Continue ahead' })).toBe(
      'straight',
    );
  });
});

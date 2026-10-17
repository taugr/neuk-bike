import type {
  CycleRoute,
  CycleRoutePlan,
  CycleRoutesByPlan,
} from '../../src/lib/cyclestreets';
import type { RouteDraft } from '../../src/lib/route-draft';

// Synthetic provider responses for automated wind checks. These are test
// lines, not streets or riding instructions.
export function windTestPoint(forward: number, side = 0): [number, number] {
  const a = (194 * Math.PI) / 180;
  const x = forward * Math.sin(a) + side * Math.cos(a);
  const y = forward * Math.cos(a) - side * Math.sin(a);
  return [
    55.9533 + y / 111194.9266,
    -3.1883 + x / (111194.9266 * Math.cos((55.9533 * Math.PI) / 180)),
  ];
}

export function createWindTestRoutes(): {
  draft: RouteDraft;
  routes: CycleRoutesByPlan;
} {
  const routes: CycleRoutesByPlan = {};
  for (const plan of ['quietest', 'balanced', 'fastest'] as CycleRoutePlan[]) {
    routes[plan] = {
      plan,
      source: 'cyclestreets',
      durationSeconds: plan === 'quietest' ? 1050 : 1000,
      distanceMeters: plan === 'quietest' ? 1077 : 1000,
      points:
        plan === 'quietest'
          ? [windTestPoint(0), windTestPoint(500, 200), windTestPoint(1000)]
          : [windTestPoint(0), windTestPoint(1000)],
      instructions: [],
    } satisfies CycleRoute;
  }
  return {
    routes,
    draft: {
      id: 'wind-demo',
      name: 'Wind comparison demo',
      plan: 'balanced',
      waypoints: [0, 1000].map((forward, index) => {
        const [latitude, longitude] = windTestPoint(forward);
        return {
          id: `wind-demo-${index}`,
          label: index ? 'Demo destination' : 'Demo start',
          latitude,
          longitude,
          source: 'map',
        };
      }),
    },
  };
}

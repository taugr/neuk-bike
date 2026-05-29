import type { CycleRouteInstruction } from '@/lib/cyclestreets';

export type RouteInstructionManeuver = 'start' | 'left' | 'right' | 'straight';

export function getRouteInstructionManeuver(
  instruction: Pick<CycleRouteInstruction, 'turn'>,
): RouteInstructionManeuver {
  const turn = instruction.turn.trim().toLowerCase();

  if (turn === 'start') {
    return 'start';
  }

  if (turn.includes('left')) {
    return 'left';
  }

  if (turn.includes('right')) {
    return 'right';
  }

  return 'straight';
}

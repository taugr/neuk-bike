/** Illustrative families, not surveyed fixture shapes or capacities.
 * Standard meanings: https://wiki.openstreetmap.org/wiki/Key:bicycle_parking
 * Only explicit aliases are accepted; access/capacity-only and unknown tags stay pins.
 */
export const parkingModelCatalog = [
  {
    kind: 'stands',
    title: 'Sheffield stands',
    description: 'Rounded U-shaped frame supports.',
    aliases: [
      'stands',
      'stand',
      'wide_stands',
      'staple',
      'hoop',
      'hoops',
      'cycle_hoops',
      'sheffield',
      'sheffield_stands',
      'sheffield_stand',
      'sheff',
      'u_rack',
      'stanbds',
      'sta',
      'stands_child',
      'half_sheffield',
      'toast_rack',
      'wall_mounted_sheffield_like',
      'stand_(supports_bicycle_frame)q',
      'bicycle_shape',
      'artistic',
      'm_stand',
      'double_hoop',
      'frame',
      'sheffield;tall_sheffield',
      'sheffield;high_sheffield',
    ],
  },
  {
    kind: 'post-hoop',
    title: 'Post hoops',
    description: 'Circular locking rings fixed to upright posts.',
    aliases: ['post_hoop', 'cyclehoop', 'ring', 'fence_hoop'],
  },
  {
    kind: 'loops',
    title: 'Wheel loops',
    description: 'Narrow loops supporting a wheel.',
    aliases: [
      'wall_loops',
      'wall_hoops',
      'loops',
      'loop',
      'wheel_loops',
      'front_wheel',
      'front_wheel_only',
      'wheelbenders',
      'wheel_benders',
      'butterfly_clips',
      'wide_loops',
      'ground_hoops',
      'loopular',
    ],
  },
  {
    kind: 'safe-loops',
    title: 'Supported wheel loops',
    description: 'Wheel slots with a taller frame-locking support.',
    aliases: ['safe_loops'],
  },
  {
    kind: 'racks',
    title: 'Wheel racks',
    description: 'A row of wheel hoops joined by base rails.',
    aliases: ['rack', 'racks', 'cycle_rack_(tennis_court)'],
  },
  {
    kind: 'two-tier',
    title: 'Two-tier racks',
    description: 'Two levels of wheel channels with pull handles.',
    aliases: [
      'two_tier',
      'double_decker',
      'double_deck_stands',
      'double_stacker',
      'stackers',
      'double_rack',
    ],
  },
  {
    kind: 'vertical',
    title: 'Upright racks',
    description: 'Tall wheel channels with upper hanging hooks.',
    aliases: [
      'upright_stands',
      'vertical_stand',
      'vertical_stands',
      'hooks',
      'wall_mount',
      'semi_upright',
    ],
  },
  {
    kind: 'wave',
    title: 'Wave racks',
    description: 'One continuous tube bent into repeated waves.',
    aliases: ['wave'],
  },
  {
    kind: 'anchors',
    title: 'Locking anchors',
    description: 'Small locking rings on low mounting plates.',
    aliases: ['anchors', 'anclatge'],
  },
  {
    kind: 'ground-slots',
    title: 'Ground slots',
    description: 'Wheel channels set into low ground blocks.',
    aliases: ['ground_slots', 'slot', 'slots'],
  },
  {
    kind: 'handlebar',
    title: 'Handlebar holders',
    description: 'High paired cradles supporting the handlebars.',
    aliases: ['handlebar_holder'],
  },
  {
    kind: 'saddle',
    title: 'Saddle rails',
    description: 'A high horizontal rail for hanging bicycles by the saddle.',
    aliases: ['saddle_holder', 'saddle_rail', 'event_racking', 'event_stand'],
  },
  {
    kind: 'rail',
    title: 'Railings',
    description: 'Horizontal rails between upright posts.',
    aliases: [
      'railing',
      'railings',
      'rail',
      'fence',
      'gates',
      'crossbar',
      'lean_and_stick',
    ],
  },
  {
    kind: 'a-frame',
    title: 'A-frame stands',
    description: 'Triangular supports joined by a top rail.',
    aliases: ['a_frame'],
  },
  {
    kind: 'scissor',
    title: 'Scissor racks',
    description: 'Crossed arms that cradle a bicycle wheel.',
    aliases: ['scissor', 'scissors'],
  },
  {
    kind: 'lockers',
    title: 'Bicycle lockers',
    description: 'Individual enclosed compartments with doors.',
    aliases: ['lockers', 'locker', 'plantlocker', 'plantlockers'],
  },
  {
    kind: 'streetpod',
    title: 'Streetpods',
    description: 'Rounded wheel enclosures with an exposed frame-locking bar.',
    aliases: ['streetpod', 'streetpods'],
  },
  {
    kind: 'shed',
    title: 'Sheds and buildings',
    description: 'An enclosed communal bicycle store.',
    aliases: ['shed', 'sheds', 'building', 'room', 'cycle_hangar'],
  },
  {
    kind: 'shelter',
    title: 'Open shelters',
    description: 'A curved roof with no assumed fixture underneath.',
    aliases: ['open_shelter', 'shelter', 'covered_shelter', 'covered'],
  },
  {
    kind: 'bollard',
    title: 'Locking bollards',
    description: 'Stout posts with short locking arms.',
    aliases: ['bollard', 'post', 'posts', 't'],
  },
  {
    kind: 'floor',
    title: 'Marked floor parking',
    description: 'Parking bays without a fabricated rack.',
    aliases: ['floor'],
  },
  {
    kind: 'tree',
    title: 'Tree parking',
    description: 'A trunk and branches used as a locking point.',
    aliases: ['tree', 'tree_trunk'],
  },
  {
    kind: 'log',
    title: 'Slotted logs',
    description: 'A timber beam with narrow wheel slots.',
    aliases: ['log_with_slots', 'log_slots'],
  },
  {
    kind: 'planter',
    title: 'Planter parking',
    description: 'A planted container used as a locking point.',
    aliases: ['planter', 'flower_pots'],
  },
  {
    kind: 'bench',
    title: 'Bench hoops',
    description: 'A bench with attached locking hoops.',
    aliases: ['hoops_on_benches'],
  },
  {
    kind: 'lamp',
    title: 'Lamp-post parking',
    description: 'A street-light column used as a locking point.',
    aliases: ['street_lamp'],
  },
  {
    kind: 'dock',
    title: 'Bicycle docks',
    description: 'Short docking posts with a wheel guide.',
    aliases: ['bike_dock'],
  },
] as const;
export type ModelKind = (typeof parkingModelCatalog)[number]['kind'];
const aliases = new Map<string, ModelKind>(
  parkingModelCatalog.flatMap((model) =>
    model.aliases.map((alias) => [alias, model.kind] as const),
  ),
);
export function normalizeParkingModelType(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}
export function resolveParkingModelType(value: unknown): ModelKind | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeParkingModelType(value);
  if (normalized === 'covered_staple') return 'stands';
  const direct = aliases.get(normalized);
  if (direct) return direct;
  // Multiple synonymous values are safe; mixed fixtures keep their ordinary pin.
  const parts = normalized
    .split(';')
    .map((part) => aliases.get(part.trim().replace(/^_+|_+$/g, '')));
  return parts.length > 1 &&
    parts[0] &&
    parts.every((kind) => kind === parts[0])
    ? parts[0]
    : null;
}
export function parkingModelHasCover(type: unknown, covered: unknown) {
  const cover = typeof covered === 'string' ? covered.trim().toLowerCase() : '';
  if (cover === 'no') return false;
  return (
    cover === 'yes' ||
    (typeof type === 'string' &&
      normalizeParkingModelType(type) === 'covered_staple')
  );
}

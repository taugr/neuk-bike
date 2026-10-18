import type {
  ExpressionSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';

type LineStyle = Pick<LineLayerSpecification, 'id' | 'filter' | 'paint'>;
type Paint = NonNullable<LineLayerSpecification['paint']>;

const width = (near: number, far: number): Paint['line-width'] => [
  'interpolate',
  ['linear'],
  ['zoom'],
  10,
  near,
  15,
  far,
];

/** Stronger separation from textured imagery and foreshortened terrain. */
export function getCycleNetworkLineStyles({
  theme,
  highContrast,
  isDirectionsMode,
  selectedRouteKey,
}: {
  theme: 'light' | 'dark';
  highContrast: boolean;
  isDirectionsMode: boolean;
  selectedRouteKey: string | null;
}): LineStyle[] {
  const dark = theme === 'dark';
  const selected: ExpressionSpecification = [
    '==',
    ['get', 'routeKey'],
    selectedRouteKey ?? '__no-selected-cycle-network-route__',
  ];
  const selectedOpacity = isDirectionsMode ? 0.3 : 1;
  const otherOpacity = isDirectionsMode
    ? 0.12
    : selectedRouteKey
      ? 0.24
      : highContrast
        ? 1
        : 0.86;
  const lineOpacity: Paint['line-opacity'] = selectedRouteKey
    ? ['case', selected, selectedOpacity, otherOpacity]
    : otherOpacity;
  const casingOpacity = isDirectionsMode
    ? 0.16
    : selectedRouteKey
      ? 0.28
      : highContrast
        ? 0.95
        : 0.68;
  const styles: LineStyle[] = [
    {
      id: 'cycle-network-outline',
      paint: {
        'line-color': '#102d29',
        'line-opacity': highContrast
          ? isDirectionsMode
            ? 0.12
            : selectedRouteKey
              ? 0.26
              : 0.9
          : 0,
        'line-width': width(8.4, 10.8),
      },
    },
    {
      id: 'cycle-network-casing',
      paint: {
        'line-color': highContrast ? '#f8fafc' : dark ? '#020617' : '#ffffff',
        'line-opacity': casingOpacity,
        'line-width': highContrast ? width(6.2, 8.2) : width(5.2, 7),
      },
    },
    {
      id: 'cycle-network-selected-casing',
      filter: [
        '==',
        ['get', 'routeKey'],
        selectedRouteKey ?? '__no-selected-cycle-network-route__',
      ],
      paint: {
        'line-color': dark ? '#f8fafc' : '#ffffff',
        'line-opacity': isDirectionsMode ? 0.3 : 0.98,
        'line-width': highContrast ? width(8.2, 10.4) : width(7.2, 9.4),
      },
    },
  ];
  for (const route of [
    {
      id: 'traffic-free',
      kind: 'traffic-free',
      color: highContrast ? '#36d99a' : dark ? '#42d6a4' : '#087f5b',
      width: 3.4,
    },
    {
      id: 'on-road',
      kind: 'on-road',
      color: highContrast ? '#a99aff' : dark ? '#a5b4fc' : '#4f46a5',
      width: 2.4,
      dash: [2, 1.4],
    },
    {
      id: 'ferry',
      kind: 'ferry',
      color: highContrast || dark ? '#67e8f9' : '#08799c',
      width: 2.6,
      dash: [0.4, 2],
    },
    {
      id: 'other',
      kind: 'unknown',
      color: highContrast || dark ? '#cbd5e1' : '#64748b',
      width: 2,
      dash: [1, 1.5],
    },
  ]) {
    const extra = highContrast ? 1 : 0;
    styles.push({
      id: `cycle-network-${route.id}`,
      filter: ['==', ['get', 'kind'], route.kind],
      paint: {
        'line-color': route.color,
        'line-opacity': lineOpacity,
        'line-width': width(route.width + extra, route.width + extra + 1.2),
        ...(route.dash ? { 'line-dasharray': route.dash } : {}),
      },
    });
  }
  styles.push({
    id: 'cycle-network-temporary-closure',
    filter: ['==', ['get', 'openStatus'], 'temporary-closure'],
    paint: {
      'line-color': highContrast || dark ? '#fb923c' : '#c2410c',
      'line-dasharray': [0.8, 1.2],
      'line-opacity': isDirectionsMode ? 0.3 : 1,
      'line-width': highContrast ? 6 : 5,
    },
  });
  return styles;
}

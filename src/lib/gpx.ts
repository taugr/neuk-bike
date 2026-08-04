import type { CycleRoute, CycleRouteWaypoint } from '@/lib/cyclestreets';

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function routeNameToGpxFilename(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${slug || 'neuk-route'}.gpx`;
}

export function serializeRouteToGpx({
  exportedAt = new Date(),
  name,
  route,
  waypoints,
}: {
  exportedAt?: Date;
  name: string;
  route: CycleRoute;
  waypoints: CycleRouteWaypoint[];
}) {
  if (route.points.length < 2) {
    throw new Error('A GPX export needs at least two route points.');
  }

  const escapedName = escapeXml(name.trim() || 'Neuk route');
  const waypointXml = waypoints
    .map(
      (waypoint) =>
        `  <wpt lat="${waypoint.latitude}" lon="${waypoint.longitude}"><name>${escapeXml(waypoint.label)}</name></wpt>`,
    )
    .join('\n');
  const trackXml = route.points
    .map(
      ([latitude, longitude]) =>
        `      <trkpt lat="${latitude}" lon="${longitude}"></trkpt>`,
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Neuk Bike" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${escapedName}</name>`,
    `    <time>${exportedAt.toISOString()}</time>`,
    '  </metadata>',
    waypointXml,
    '  <trk>',
    `    <name>${escapedName}</name>`,
    '    <trkseg>',
    trackXml,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

export function downloadRouteGpx({
  name,
  route,
  waypoints,
}: {
  name: string;
  route: CycleRoute;
  waypoints: CycleRouteWaypoint[];
}) {
  const xml = serializeRouteToGpx({ name, route, waypoints });
  const url = URL.createObjectURL(
    new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.download = routeNameToGpxFilename(name);
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

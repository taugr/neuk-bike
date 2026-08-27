import type {
  CycleRoute,
  CycleRoutePoint,
  CycleRouteWaypoint,
} from '@/lib/cyclestreets';
import { distanceMeters } from '@/lib/geo';

export const MAX_GPX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_GPX_POINTS = 50_000;

export type ParsedGpx = {
  name: string;
  fileName: string;
  points: CycleRoutePoint[];
  segments: CycleRoutePoint[][];
  waypoints: CycleRouteWaypoint[];
  distanceMeters: number;
  durationSeconds: number | null;
};

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

function serializeTrackSegment(points: CycleRoutePoint[]) {
  return [
    '    <trkseg>',
    ...points.map(
      ([latitude, longitude]) =>
        `      <trkpt lat="${latitude}" lon="${longitude}"></trkpt>`,
    ),
    '    </trkseg>',
  ].join('\n');
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
  const waypointXml = waypoints.map(
    (waypoint) =>
      `  <wpt lat="${waypoint.latitude}" lon="${waypoint.longitude}"><name>${escapeXml(waypoint.label)}</name></wpt>`,
  );
  const segments = (route.segments ?? [route.points]).filter(
    (segment) => segment.length >= 2,
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Neuk Bike" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${escapedName}</name>`,
    `    <time>${exportedAt.toISOString()}</time>`,
    '  </metadata>',
    ...waypointXml,
    '  <trk>',
    `    <name>${escapedName}</name>`,
    ...segments.map(serializeTrackSegment),
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}

export function createRouteGpxFile({
  name,
  route,
  waypoints,
}: {
  name: string;
  route: CycleRoute;
  waypoints: CycleRouteWaypoint[];
}) {
  return new File(
    [serializeRouteToGpx({ name, route, waypoints })],
    routeNameToGpxFilename(name),
    { type: 'application/gpx+xml' },
  );
}

export function downloadGpxFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.download = file.name;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
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
  downloadGpxFile(createRouteGpxFile({ name, route, waypoints }));
}

function elementsByLocalName(root: ParentNode, name: string) {
  return Array.from(root.querySelectorAll('*')).filter(
    (element) => element.localName === name,
  );
}

function childText(element: Element, name: string) {
  return (
    Array.from(element.children)
      .find((child) => child.localName === name)
      ?.textContent?.trim() ?? ''
  );
}

function parsePoint(element: Element): CycleRoutePoint | null {
  const latitude = Number(element.getAttribute('lat'));
  const longitude = Number(element.getAttribute('lon'));
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
    ? [latitude, longitude]
    : null;
}

function fileNameWithoutExtension(fileName: string) {
  return fileName.replace(/\.gpx$/i, '').trim() || 'Imported route';
}

function measureSegments(segments: CycleRoutePoint[][]) {
  return segments.reduce(
    (total, segment) =>
      total +
      segment.slice(1).reduce((distance, point, index) => {
        const previous = segment[index]!;
        return (
          distance +
          distanceMeters(
            { latitude: previous[0], longitude: previous[1] },
            { latitude: point[0], longitude: point[1] },
          )
        );
      }, 0),
    0,
  );
}

function parseDurationSeconds(pointElements: Element[]) {
  const timestamps = pointElements
    .map((element) => Date.parse(childText(element, 'time')))
    .filter(Number.isFinite);
  if (timestamps.length < 2) {
    return null;
  }
  const durationSeconds = Math.round(
    (timestamps[timestamps.length - 1]! - timestamps[0]!) / 1000,
  );
  return durationSeconds >= 0 ? durationSeconds : null;
}

export function parseGpxText(xml: string, fileName: string): ParsedGpx {
  if (typeof DOMParser === 'undefined') {
    throw new Error('GPX import is unavailable in this browser.');
  }
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (
    document.documentElement.localName !== 'gpx' ||
    document.querySelector('parsererror')
  ) {
    throw new Error('This file is not valid GPX.');
  }

  const trackSegments = elementsByLocalName(document, 'trkseg')
    .map((segment) =>
      elementsByLocalName(segment, 'trkpt')
        .map(parsePoint)
        .filter((point): point is CycleRoutePoint => point !== null),
    )
    .filter((segment) => segment.length >= 2);
  const routePointElements = elementsByLocalName(document, 'rtept');
  const routePoints = routePointElements
    .map(parsePoint)
    .filter((point): point is CycleRoutePoint => point !== null);
  const waypointElements = elementsByLocalName(document, 'wpt');
  const waypointPoints = waypointElements
    .map(parsePoint)
    .filter((point): point is CycleRoutePoint => point !== null);
  const segments =
    trackSegments.length > 0
      ? trackSegments
      : routePoints.length >= 2
        ? [routePoints]
        : waypointPoints.length >= 2
          ? [waypointPoints]
          : [];
  const points = segments.flat();
  if (points.length < 2) {
    throw new Error('This GPX file does not contain a usable route.');
  }
  if (points.length > MAX_GPX_POINTS) {
    throw new Error(
      `GPX routes can contain up to ${MAX_GPX_POINTS.toLocaleString()} points.`,
    );
  }

  const explicitWaypoints = waypointElements
    .map((element, index): CycleRouteWaypoint | null => {
      const point = parsePoint(element);
      if (!point) {
        return null;
      }
      const [latitude, longitude] = point;
      return {
        id: `gpx-${index + 1}`,
        label: childText(element, 'name') || `Stop ${index + 1}`,
        latitude,
        longitude,
        source: 'gpx',
      };
    })
    .filter((waypoint): waypoint is CycleRouteWaypoint => waypoint !== null);
  const endpoints: CycleRouteWaypoint[] = [
    {
      id: 'gpx-start',
      label: 'Start',
      latitude: points[0]![0],
      longitude: points[0]![1],
      source: 'gpx',
    },
    {
      id: 'gpx-finish',
      label: 'Finish',
      latitude: points[points.length - 1]![0],
      longitude: points[points.length - 1]![1],
      source: 'gpx',
    },
  ];

  const metadata = elementsByLocalName(document, 'metadata')[0];
  const track = elementsByLocalName(document, 'trk')[0];
  const route = elementsByLocalName(document, 'rte')[0];
  const name =
    (metadata ? childText(metadata, 'name') : '') ||
    (track ? childText(track, 'name') : '') ||
    (route ? childText(route, 'name') : '') ||
    fileNameWithoutExtension(fileName);
  const timeElements =
    trackSegments.length > 0
      ? elementsByLocalName(document, 'trkpt')
      : routePointElements;

  return {
    name,
    fileName,
    points,
    segments,
    waypoints: explicitWaypoints.length >= 2 ? explicitWaypoints : endpoints,
    distanceMeters: Math.round(measureSegments(segments)),
    durationSeconds: parseDurationSeconds(timeElements),
  };
}

export async function parseGpxFile(file: File) {
  if (file.size > MAX_GPX_FILE_BYTES) {
    throw new Error('GPX files can be up to 10 MB.');
  }
  return parseGpxText(await file.text(), file.name);
}

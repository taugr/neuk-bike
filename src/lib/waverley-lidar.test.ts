import { readFileSync } from 'node:fs';
import { MercatorCoordinate } from 'maplibre-gl';
import { expect, it, vi } from 'vitest';
import {
  getLidarTerrainTile,
  lidarProtocol,
  loadLidarTerrainTile,
} from './waverley-lidar';
import {
  decodeRoofSurvey,
  fitRoofProfile,
  isInWaverleySurvey,
  subdivideRoof,
} from './waverley-roof-profile';

it('addresses only the generated higher-resolution ground tiles', () => {
  expect(getLidarTerrainTile(17, 64374, 40844)).toBe(
    '/data/waverley-lidar/dem/17/64374/40844.png',
  );
  expect(getLidarTerrainTile(16, 32185, 20422)).toBeUndefined();
  expect(getLidarTerrainTile(14, 8046, 5105)).toBeUndefined();
});

it('retries a dropped local tile and falls back to its parent if the retry fails', async () => {
  const request = { url: `${lidarProtocol}://17/64374/40844` };
  const controller = new AbortController();
  const origin = 'https://elevation.example';
  const fetchTile = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('Connection reset'))
    .mockResolvedValueOnce(new Response('demo'));
  const result = await loadLidarTerrainTile(
    request,
    controller,
    origin,
    fetchTile,
  );
  expect(new TextDecoder().decode(result.data)).toBe('demo');
  expect(fetchTile).toHaveBeenCalledTimes(2);

  fetchTile.mockReset().mockRejectedValue(new TypeError('Connection reset'));
  await expect(
    loadLidarTerrainTile(request, controller, origin, fetchTile),
  ).rejects.toMatchObject({ status: 404 });
  expect(fetchTile).toHaveBeenCalledTimes(2);
  fetchTile.mockReset().mockResolvedValue(new Response(null, { status: 503 }));
  await expect(
    loadLidarTerrainTile(
      { url: `${lidarProtocol}://14/8046/5105` },
      controller,
      origin,
      fetchTile,
    ),
  ).rejects.toMatchObject({ status: 503 });
});

it('keeps the roof survey above the measured ground at the station', () => {
  const bytes = readFileSync('public/data/waverley-lidar/surface.bin');
  const surfaceAt = decodeRoofSurvey(Uint8Array.from(bytes).buffer);
  const station = MercatorCoordinate.fromLngLat([-3.1883, 55.95262]);
  const street = MercatorCoordinate.fromLngLat([-3.1883, 55.9533]);
  const stationSample = surfaceAt(station)!;
  const streetSample = surfaceAt(street)!;
  expect(isInWaverleySurvey(station.toLngLat())).toBe(true);
  expect(stationSample.roof - stationSample.ground).toBeGreaterThan(6);
  expect(streetSample.ground - stationSample.ground).toBeGreaterThan(10);
  expect(surfaceAt(MercatorCoordinate.fromLngLat([-3, 55]))).toBeUndefined();
});

it('fits a variable roof from in-footprint samples and skips street returns', () => {
  const center = MercatorCoordinate.fromLngLat([-3.1883, 55.95262]);
  const extent = 15 * center.meterInMercatorCoordinateUnits();
  const ring = [
    { x: center.x - extent, y: center.y - extent },
    { x: center.x + extent, y: center.y - extent },
    { x: center.x + extent, y: center.y + extent },
    { x: center.x - extent, y: center.y + extent },
  ];
  const profile = fitRoofProfile(
    [ring],
    ({ x, y }) => ({
      ground: 50,
      roof: Math.abs(y - center.y) > extent * 0.8 ? 50 : x < center.x ? 63 : 71,
    }),
    80,
  );
  expect(profile.measured).toBe(true);
  expect(
    profile.elevationAt({ x: center.x - extent, y: center.y }),
  ).toBeCloseTo(63.12);
  expect(
    profile.elevationAt({ x: center.x + extent, y: center.y }),
  ).toBeCloseTo(71.12);
  expect(
    fitRoofProfile([ring], () => ({ ground: 50, roof: 51 }), 80).elevationAt(
      center,
    ),
  ).toBe(80);
});

it('uses the half-metre survey for roof features inside the Princes Street crop', () => {
  const bytes = readFileSync('public/data/waverley-lidar/princes-roofs.bin');
  const detail = decodeRoofSurvey(Uint8Array.from(bytes).buffer, true);
  const center = MercatorCoordinate.fromLngLat([-3.19015, 55.95345]);
  const extent = 5 * center.meterInMercatorCoordinateUnits();
  const ring = [
    { x: center.x - extent, y: center.y - extent },
    { x: center.x + extent, y: center.y - extent },
    { x: center.x + extent, y: center.y + extent },
    { x: center.x - extent, y: center.y + extent },
  ];
  const detailSample = detail(center);
  expect(detailSample).toBeDefined();
  expect(detailSample!.roof - detailSample!.ground).toBeGreaterThan(10);
  const coarse = () => ({ ground: 66, roof: 86 });
  const profile = fitRoofProfile([ring], coarse, 86, detail);
  expect(profile.fine).toBe(true);
  expect(profile.elevationAt(center)).toBeCloseTo(detailSample!.roof, 0);
  expect(profile.elevationAt(ring[0])).toBeCloseTo(86.12);
  expect(fitRoofProfile([ring], coarse, 86, () => undefined).fine).toBe(false);
});

it('subdivides a triangle without changing its area or spilling past its bounds', () => {
  const mesh = subdivideRoof(
    [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 2, y: 4 },
    ],
    1,
  );
  const area = mesh.reduce(
    (sum, [a, b, c]) =>
      sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2,
    0,
  );
  expect(area).toBeCloseTo(10);
  for (const face of mesh) {
    const xs = face.map(({ x }) => x);
    const ys = face.map(({ y }) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
  }
});

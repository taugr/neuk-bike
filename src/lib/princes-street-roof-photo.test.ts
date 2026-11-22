import { MercatorCoordinate } from 'maplibre-gl';
import { expect, it } from 'vitest';
import { wallOriginTile } from './map-aerial-roof-geometry';
import {
  princesStreetFlatRoofCenter,
  princesStreetRoofPhotoBounds,
  princesStreetRoofPlane,
  princesStreetRoofPhotoRect,
} from './princes-street-roof-photo';

it('places the atlas on the same roof corners as the survey mesh', () => {
  const [left, top, scaleX, scaleY] =
    princesStreetRoofPhotoRect(wallOriginTile);
  const scale = 2 ** wallOriginTile.z;
  const uv = ({ x, y }: MercatorCoordinate) => [
    (x * scale - wallOriginTile.x - left) * scaleX,
    (y * scale - wallOriginTile.y - top) * scaleY,
  ];
  const northwest = uv(
    MercatorCoordinate.fromLngLat(princesStreetRoofPhotoBounds.getNorthWest()),
  );
  const southeast = uv(
    MercatorCoordinate.fromLngLat(princesStreetRoofPhotoBounds.getSouthEast()),
  );
  expect(northwest).toEqual([0, 0]);
  expect(southeast[0]).toBeCloseTo(1);
  expect(southeast[1]).toBeCloseTo(1);
});

it('levels the surveyed main roof while preserving the courtyard and exterior', () => {
  const west = MercatorCoordinate.fromLngLat([-3.1905091, 55.9532095]);
  const east = MercatorCoordinate.fromLngLat([-3.1898224, 55.9533267]);
  const length = Math.hypot(east.x - west.x, east.y - west.y);
  const unit = west.meterInMercatorCoordinateUnits();
  const ux = (east.x - west.x) / length;
  const uy = (east.y - west.y) / length;
  const roofPoint = (along: number, inward: number) => ({
    x: west.x + (along * ux + inward * uy) * unit,
    y: west.y + (along * uy - inward * ux) * unit,
  });
  expect(princesStreetRoofPlane(princesStreetFlatRoofCenter, 88.0)).toBeCloseTo(
    89.7,
  );
  expect(princesStreetRoofPlane(roofPoint(11, 18), 77.5)).toBe(77.5);
  expect(princesStreetRoofPlane(roofPoint(28, 18), 78.5)).toBe(78.5);
  expect(princesStreetRoofPlane(roofPoint(25, 0), 83.4)).toBe(83.4);
  expect(princesStreetRoofPlane(roofPoint(11, 18), 77.5, true)).toBeCloseTo(
    90.35,
  );
  expect(princesStreetRoofPlane(roofPoint(28, 18), 78.5, true)).toBeCloseTo(
    90.35,
  );
  expect(princesStreetRoofPlane(roofPoint(25, 0), 83.4, true)).toBe(83.4);
});

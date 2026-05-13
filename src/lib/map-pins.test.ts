import { describe, expect, it } from "vitest";
import { getRenderableParkingPoints, type ParkingMapBounds } from "@/lib/map-pins";
import type { ParkingPoint } from "@/lib/types";

const edinburghBounds: ParkingMapBounds = {
  east: -3.15,
  north: 55.98,
  south: 55.92,
  west: -3.25,
};
const pannedBounds: ParkingMapBounds = {
  east: -3.02,
  north: 55.98,
  south: 55.92,
  west: -3.12,
};

function point(id: string, latitude: number, longitude: number): ParkingPoint {
  return {
    id,
    name: `Point ${id}`,
    latitude,
    longitude,
    properties: {},
  };
}

function gridPoints(count: number) {
  return Array.from({ length: count }, (_, index) =>
    point(String(index), 55.94 + (index % 10) * 0.002, -3.23 + Math.floor(index / 10) * 0.002),
  );
}

describe("map pin rendering", () => {
  it("renders fewer points at low zoom than high zoom", () => {
    const points = gridPoints(40);
    const lowZoomPoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      points,
      zoom: 11,
    });
    const highZoomPoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      points,
      zoom: 17,
    });

    expect(lowZoomPoints.length).toBeLessThan(highZoomPoints.length);
  });

  it("allows progressively more surrounding points at mid and high zoom", () => {
    const points = gridPoints(100);
    const lowZoomPoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      pinnedPoints: [],
      points,
      zoom: 12,
    });
    const midZoomPoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      pinnedPoints: [],
      points,
      zoom: 14,
    });
    const highZoomPoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      pinnedPoints: [],
      points,
      zoom: 15,
    });

    expect(lowZoomPoints.length).toBeLessThanOrEqual(24);
    expect(midZoomPoints.length).toBeGreaterThan(lowZoomPoints.length);
    expect(highZoomPoints.length).toBeGreaterThan(midZoomPoints.length);
  });

  it("shows broader sparse coverage for city-wide views", () => {
    const points = Array.from({ length: 80 }, (_, index) =>
      point(
        `city-${index}`,
        55.925 + (index % 10) * 0.005,
        -3.245 + Math.floor(index / 10) * 0.012,
      ),
    );

    const renderablePoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      pinnedPoints: [],
      points,
      zoom: 12,
    });

    expect(renderablePoints.length).toBeGreaterThan(12);
    expect(renderablePoints.length).toBeLessThanOrEqual(24);
  });

  it("shows a sparse spread of pins in panned city areas at mid zoom", () => {
    const pannedPoints = Array.from({ length: 30 }, (_, index) =>
      point(`panned-${index}`, 55.93 + (index % 6) * 0.003, -3.11 + Math.floor(index / 6) * 0.003),
    );

    const renderablePoints = getRenderableParkingPoints({
      bounds: pannedBounds,
      pinnedPoints: [],
      points: pannedPoints,
      zoom: 13,
    });

    expect(renderablePoints.length).toBeGreaterThan(8);
    expect(renderablePoints.length).toBeLessThanOrEqual(24);
  });

  it("renders all visible points at high zoom", () => {
    const visiblePoints = gridPoints(12);
    const outsidePoint = point("outside", 56.1, -3.2);
    const renderablePoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      pinnedPoints: [],
      points: [...visiblePoints, outsidePoint],
      zoom: 17,
    });

    expect(renderablePoints.map((renderablePoint) => renderablePoint.id)).toEqual(
      visiblePoints.map((visiblePoint) => visiblePoint.id),
    );
  });

  it("retains the selected point outside the sampled subset", () => {
    const points = gridPoints(20);
    const selectedPoint = point("selected", 56.1, -3.2);
    const renderablePoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      pinnedPoints: [],
      points,
      selectedPoint,
      zoom: 11,
    });

    expect(renderablePoints.map((renderablePoint) => renderablePoint.id)).toContain("selected");
  });

  it("retains top ranked points", () => {
    const points = gridPoints(30);
    const renderablePoints = getRenderableParkingPoints({
      bounds: edinburghBounds,
      pinnedPoints: points,
      points,
      zoom: 11,
    });

    expect(renderablePoints.map((renderablePoint) => renderablePoint.id)).toEqual(
      expect.arrayContaining(["0", "1", "2", "3", "4", "5", "6", "7"]),
    );
  });

  it("samples visible panned-area points before appending offscreen ranked points", () => {
    const offscreenPinnedPoints = [
      point("pinned-0", 55.95, -3.22),
      point("pinned-1", 55.951, -3.22),
      point("pinned-2", 55.952, -3.22),
      point("pinned-3", 55.953, -3.22),
      point("pinned-4", 55.954, -3.22),
      point("pinned-5", 55.955, -3.22),
      point("pinned-6", 55.956, -3.22),
      point("pinned-7", 55.957, -3.22),
    ];
    const pannedPoints = Array.from({ length: 20 }, (_, index) =>
      point(`panned-${index}`, 55.94 + (index % 5) * 0.004, -3.1 + Math.floor(index / 5) * 0.004),
    );

    const renderablePoints = getRenderableParkingPoints({
      bounds: pannedBounds,
      pinnedPoints: offscreenPinnedPoints,
      points: [...offscreenPinnedPoints, ...pannedPoints],
      zoom: 14,
    });

    const renderableIds = renderablePoints.map((renderablePoint) => renderablePoint.id);

    expect(renderableIds.filter((id) => id.startsWith("panned-"))).toHaveLength(20);
    expect(renderableIds).toEqual(
      expect.arrayContaining([
        "pinned-0",
        "pinned-1",
        "pinned-2",
        "pinned-3",
        "pinned-4",
        "pinned-5",
        "pinned-6",
        "pinned-7",
      ]),
    );
  });

  it("retains the selected point after sampling panned-area points", () => {
    const selectedPoint = point("selected", 55.95, -3.22);
    const pannedPoints = Array.from({ length: 20 }, (_, index) =>
      point(`panned-${index}`, 55.94 + (index % 5) * 0.004, -3.1 + Math.floor(index / 5) * 0.004),
    );

    const renderablePoints = getRenderableParkingPoints({
      bounds: pannedBounds,
      pinnedPoints: [],
      points: [selectedPoint, ...pannedPoints],
      selectedPoint,
      zoom: 14,
    });

    expect(renderablePoints.map((renderablePoint) => renderablePoint.id)).toEqual(
      expect.arrayContaining([
        "selected",
        "panned-0",
        "panned-1",
        "panned-2",
        "panned-3",
        "panned-4",
        "panned-5",
        "panned-6",
        "panned-7",
        "panned-8",
        "panned-9",
        "panned-10",
        "panned-11",
        "panned-12",
        "panned-13",
        "panned-14",
        "panned-15",
        "panned-16",
        "panned-17",
        "panned-18",
        "panned-19",
      ]),
    );
  });

  it("returns deterministic output for the same input", () => {
    const points = gridPoints(40);
    const firstRun = getRenderableParkingPoints({
      bounds: edinburghBounds,
      points,
      zoom: 13,
    });
    const secondRun = getRenderableParkingPoints({
      bounds: edinburghBounds,
      points,
      zoom: 13,
    });

    expect(secondRun).toEqual(firstRun);
  });
});

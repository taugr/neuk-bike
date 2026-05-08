import { describe, expect, it } from "vitest";
import { distanceMeters, formatDistance, sortByDistance } from "@/lib/geo";
import type { ParkingPoint } from "@/lib/types";

const points: ParkingPoint[] = [
  {
    id: "far",
    name: "Far point",
    latitude: 55.9605,
    longitude: -3.21,
    properties: {},
  },
  {
    id: "near",
    name: "Near point",
    latitude: 55.9534,
    longitude: -3.1884,
    properties: {},
  },
];

describe("geo utilities", () => {
  it("calculates approximate distance in metres", () => {
    const distance = distanceMeters(
      { latitude: 55.9533, longitude: -3.1883 },
      { latitude: 55.9534, longitude: -3.1884 },
    );

    expect(distance).toBeGreaterThan(10);
    expect(distance).toBeLessThan(15);
  });

  it("sorts points by nearest distance", () => {
    const sorted = sortByDistance(points, { latitude: 55.9533, longitude: -3.1883 });

    expect(sorted.map((point) => point.id)).toEqual(["near", "far"]);
    expect(sorted[0]?.distanceMeters).toBeLessThan(sorted[1]?.distanceMeters ?? 0);
  });

  it("handles empty point lists", () => {
    expect(sortByDistance([], { latitude: 55.9533, longitude: -3.1883 })).toEqual([]);
  });

  it("formats metres and kilometres", () => {
    expect(formatDistance(42.4)).toBe("42 m");
    expect(formatDistance(1_250)).toBe("1.3 km");
  });
});

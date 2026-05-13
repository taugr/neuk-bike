import { describe, expect, it } from "vitest";
import {
  buildCycleStreetsDirectionsRequest,
  describeCycleRouteInstruction,
  formatCycleRouteDuration,
  parseCycleStreetsRoute,
} from "@/lib/cyclestreets";
import type { ParkingPoint } from "@/lib/types";

const destination: ParkingPoint = {
  id: "parking-1",
  name: "Cycle parking 1",
  latitude: 55.944,
  longitude: -3.205,
  properties: {},
};

const cycleStreetsFixture = {
  type: "FeatureCollection",
  properties: {
    start: "Princes Street",
    finish: "Service road",
  },
  features: [
    {
      type: "Feature",
      properties: {
        path: "waypoint/1",
        number: 1,
        markerTag: "start",
        name: "Princes Street",
      },
      geometry: {
        type: "Point",
        coordinates: [-3.18852, 55.9534],
      },
    },
    {
      type: "Feature",
      properties: {
        path: "plan/balanced",
        plan: "balanced",
        lengthMetres: 1966,
        timeSeconds: 811,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-3.18852, 55.9534],
          [-3.18854, 55.95338],
          [-3.205, 55.94401],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        path: "plan/balanced/street/1",
        number: 1,
        name: "Princes Street",
        lengthMetres: 39,
        timeSeconds: 24,
        travelMode: "cycling",
        turnPrevText: "start",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-3.18852, 55.9534],
          [-3.18908, 55.9533],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        path: "plan/balanced/street/2",
        number: 2,
        name: "North Bridge, A7",
        lengthMetres: 362,
        timeSeconds: 221,
        travelMode: "cycling",
        turnPrevText: "turn left",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-3.18908, 55.9533],
          [-3.18841, 55.95195],
        ],
      },
    },
  ],
};

describe("CycleStreets utilities", () => {
  it("builds browser-compatible v2 journey requests", () => {
    const request = buildCycleStreetsDirectionsRequest({
      apiKey: "public-test-key",
      origin: { latitude: 55.9533, longitude: -3.1883 },
      destination,
    });

    const url = new URL(request.url);

    expect(`${url.origin}${url.pathname}`).toBe("https://api.cyclestreets.net/v2/journey.plan");
    expect(url.searchParams.get("key")).toBe("public-test-key");
    expect(url.searchParams.get("plans")).toBe("balanced");
    expect(url.searchParams.get("speedKmph")).toBe("16");
    expect(url.searchParams.get("waypoints")).toBe(
      "-3.18830,55.95330,Start|-3.20500,55.94400,Cycle parking 1",
    );
    expect(request.headers).toEqual({
      Accept: "application/json",
    });
  });

  it("parses v2 GeoJSON routes into Leaflet latitude and longitude order", () => {
    const route = parseCycleStreetsRoute(cycleStreetsFixture);

    expect(route.distanceMeters).toBe(1966);
    expect(route.durationSeconds).toBe(811);
    expect(route.points).toEqual([
      [55.9534, -3.18852],
      [55.95338, -3.18854],
      [55.94401, -3.205],
    ]);
  });

  it("parses and describes route instructions", () => {
    const route = parseCycleStreetsRoute(cycleStreetsFixture);

    expect(route.instructions).toEqual([
      {
        id: "plan/balanced/street/1",
        streetName: "Princes Street",
        turn: "start",
        distanceMeters: 39,
        durationSeconds: 24,
        travelMode: "cycling",
      },
      {
        id: "plan/balanced/street/2",
        streetName: "North Bridge, A7",
        turn: "turn left",
        distanceMeters: 362,
        durationSeconds: 221,
        travelMode: "cycling",
      },
    ]);
    expect(describeCycleRouteInstruction(route.instructions[0]!)).toBe("Start on Princes Street");
    expect(describeCycleRouteInstruction(route.instructions[1]!)).toBe(
      "turn left onto North Bridge, A7",
    );
  });

  it("formats route duration in minutes", () => {
    expect(formatCycleRouteDuration(811)).toBe("14 min");
    expect(formatCycleRouteDuration(15)).toBe("1 min");
  });

  it("throws useful errors for CycleStreets errors and malformed responses", () => {
    expect(() => parseCycleStreetsRoute({ error: "No routes to plan" })).toThrow(
      "No routes to plan",
    );
    expect(() => parseCycleStreetsRoute({ type: "FeatureCollection", features: [] })).toThrow(
      "CycleStreets did not return a usable route.",
    );
  });
});

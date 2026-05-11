"use client";

import dynamic from "next/dynamic";
import { Bike, Crosshair, LocateFixed, MapPin, Navigation, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import cycleParkingDataset from "@/data/cycle-parking.json";
import {
  buildPlaceSearchUrl,
  parsePlaceSearchResults,
  type PlaceSearchResult,
} from "@/lib/geocoder";
import type { ParkingPoint, UserLocation } from "@/lib/types";
import {
  EDINBURGH_FALLBACK_LOCATION,
  formatDistance,
  isFarFromNearestParking,
  isResolvedLocation,
  sortByDistance,
} from "@/lib/geo";
import { describeParkingPoint } from "@/lib/parking";

const CycleParkingMap = dynamic(() => import("@/components/cycle-parking-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>,
});

const parkingPoints = cycleParkingDataset.points as ParkingPoint[];
const maxPlaceSearchCacheEntries = 12;
const closestParkingResultCount = 12;

type LocationState =
  | { status: "fallback"; location: UserLocation }
  | { status: "locating"; location: UserLocation }
  | { status: "located"; location: UserLocation }
  | { status: "searched"; location: UserLocation; label: string }
  | { status: "too-far"; location: UserLocation }
  | { status: "denied"; location: UserLocation }
  | { status: "unavailable"; location: UserLocation };

function getUrlLocation() {
  const params = new URLSearchParams(window.location.search);
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lng"));

  const location = { latitude, longitude };

  if (!isResolvedLocation(location)) {
    return null;
  }

  return location;
}

function getLocationLabel(locationState: LocationState) {
  if (locationState.status === "located") {
    return "you";
  }

  if (locationState.status === "searched") {
    return locationState.label;
  }

  return "central Edinburgh";
}

export default function CycleParkingFinder() {
  const [locationState, setLocationState] = useState<LocationState>({
    status: "fallback",
    location: EDINBURGH_FALLBACK_LOCATION,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(null);
  const [isPlaceSearching, setIsPlaceSearching] = useState(false);
  const [hasUsedPlaceSearch, setHasUsedPlaceSearch] = useState(false);
  const placeSearchCache = useRef(new Map<string, PlaceSearchResult[]>());
  const placeSearchInFlight = useRef(false);

  useEffect(() => {
    const urlLocation = getUrlLocation();
    if (urlLocation) {
      applyReferenceLocation(urlLocation, "located");
      return;
    }

    requestLocation();
  }, []);

  const nearbyPoints = useMemo(
    () => sortByDistance(parkingPoints, locationState.location),
    [locationState.location],
  );

  const closestPoints = useMemo(
    () => nearbyPoints.slice(0, closestParkingResultCount),
    [nearbyPoints],
  );

  const nearestPoint = nearbyPoints[0] ?? null;
  const nearestHighlightedPoints = nearbyPoints.slice(0, 3);
  const explicitSelectedPoint =
    selectedId !== null ? (nearbyPoints.find((point) => point.id === selectedId) ?? null) : null;
  const selectedPoint = explicitSelectedPoint ?? nearestPoint;
  const locationLabel = getLocationLabel(locationState);

  function applyReferenceLocation(
    location: UserLocation,
    status: Extract<LocationState["status"], "located" | "searched">,
    label?: string,
  ) {
    setSelectedId(null);

    if (status === "located" && isFarFromNearestParking(parkingPoints, location)) {
      setLocationState({
        status: "too-far",
        location: EDINBURGH_FALLBACK_LOCATION,
      });
      return;
    }

    setLocationState(
      status === "searched"
        ? {
            status,
            location,
            label: label ?? "selected place",
          }
        : {
            status,
            location,
          },
    );
  }

  function requestLocation() {
    setSelectedId(null);

    if (!("geolocation" in navigator)) {
      setLocationState({
        status: "unavailable",
        location: EDINBURGH_FALLBACK_LOCATION,
      });
      return;
    }

    setLocationState((current) => ({
      status: "locating",
      location: current.location,
    }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (!isResolvedLocation(location)) {
          setLocationState({
            status: "unavailable",
            location: EDINBURGH_FALLBACK_LOCATION,
          });
          return;
        }

        applyReferenceLocation(location, "located");
      },
      (error) => {
        setLocationState({
          status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
          location: EDINBURGH_FALLBACK_LOCATION,
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  }

  async function searchForPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = placeQuery.trim();
    if (trimmedQuery.length === 0 || placeSearchInFlight.current) {
      return;
    }

    const cacheKey = trimmedQuery.toLowerCase();
    const cachedResults = placeSearchCache.current.get(cacheKey);

    if (cachedResults) {
      setPlaceResults(cachedResults);
      setPlaceSearchMessage(
        cachedResults.length === 0 ? "No matching Edinburgh places found." : null,
      );
      return;
    }

    placeSearchInFlight.current = true;
    setIsPlaceSearching(true);
    setPlaceSearchMessage(null);

    try {
      const response = await fetch(buildPlaceSearchUrl(trimmedQuery), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Place search failed");
      }

      const results = parsePlaceSearchResults(await response.json());
      placeSearchCache.current.set(cacheKey, results);
      if (placeSearchCache.current.size > maxPlaceSearchCacheEntries) {
        const oldestKey = placeSearchCache.current.keys().next().value;
        if (oldestKey) {
          placeSearchCache.current.delete(oldestKey);
        }
      }
      setPlaceResults(results);
      setPlaceSearchMessage(results.length === 0 ? "No matching Edinburgh places found." : null);
      setHasUsedPlaceSearch(true);
    } catch {
      setPlaceResults([]);
      setPlaceSearchMessage("Place search is unavailable right now.");
    } finally {
      placeSearchInFlight.current = false;
      setIsPlaceSearching(false);
    }
  }

  function selectPlace(result: PlaceSearchResult) {
    setPlaceResults([]);
    setPlaceSearchMessage(null);
    setPlaceQuery(result.name.split(",")[0] ?? result.name);
    setHasUsedPlaceSearch(true);
    applyReferenceLocation(result.location, "searched", result.name.split(",")[0] ?? result.name);
  }

  return (
    <main className="app-shell">
      <section className="map-pane" aria-label="Cycle parking map">
        <CycleParkingMap
          points={nearbyPoints}
          userLocation={locationState.location}
          selectedPoint={explicitSelectedPoint}
          nearestPoint={nearestPoint}
          nearestHighlightedPoints={nearestHighlightedPoints}
          onSelectPoint={setSelectedId}
        />
      </section>

      <aside className="control-pane" aria-label="Nearest cycle parking">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true">
            <Bike size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h1>Edinburgh Cycle Parking</h1>
            <p>{cycleParkingDataset.metadata.recordCount} cycle parking locations</p>
          </div>
        </header>

        <section className="nearest-panel" aria-live="polite">
          <div className="nearest-copy">
            <span className="section-label">
              <Navigation size={15} aria-hidden="true" />
              Nearest space
            </span>
            <h2>{nearestPoint?.name ?? "No parking found"}</h2>
            <p>
              {nearestPoint
                ? `${formatDistance(nearestPoint.distanceMeters)} from ${locationLabel} - ${describeParkingPoint(nearestPoint)}`
                : "Refresh the dataset and try again."}
            </p>
            {locationState.status === "too-far" ? (
              <div className="status-message unavailable" role="status">
                You're very far away from a bike space, showing bike parking in central edinburgh
              </div>
            ) : null}
          </div>
        </section>

        <section className="reference-panel" aria-label="Search from">
          <span className="section-label">
            <MapPin size={15} aria-hidden="true" />
            Search from
          </span>
          <div className="reference-controls">
            <form
              className="place-search-form"
              onSubmit={(event) => {
                void searchForPlace(event);
              }}
            >
              <label className="search-box">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">Search from a place</span>
                <input
                  type="search"
                  value={placeQuery}
                  placeholder="Street, postcode, or place"
                  onChange={(event) => setPlaceQuery(event.target.value)}
                />
              </label>
              <button type="submit" disabled={isPlaceSearching || placeQuery.trim().length === 0}>
                {isPlaceSearching ? "Searching" : "Search"}
              </button>
            </form>

            <button
              className="secondary-location-button"
              type="button"
              onClick={requestLocation}
              disabled={locationState.status === "locating"}
            >
              {locationState.status === "locating" ? (
                <Crosshair size={18} aria-hidden="true" />
              ) : (
                <LocateFixed size={18} aria-hidden="true" />
              )}
              {locationState.status === "locating" ? "Locating" : "Use my location"}
            </button>
          </div>

          {placeResults.length > 0 ? (
            <ol className="place-results" aria-label="Place search results">
              {placeResults.map((result) => (
                <li key={result.id}>
                  <button type="button" onClick={() => selectPlace(result)}>
                    <MapPin size={16} aria-hidden="true" />
                    <span>{result.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          {placeSearchMessage ? (
            <div className="place-search-message" role="status">
              {placeSearchMessage}
            </div>
          ) : null}
        </section>

        <div className="list-heading">
          <h2>Nearby cycle parking</h2>
          <p>Showing {closestPoints.length} closest results</p>
        </div>

        <ol className="parking-list" aria-label="Nearby cycle parking locations">
          {closestPoints.map((point, index) => (
            <li key={point.id}>
              <button
                className={point.id === selectedPoint?.id ? "parking-row selected" : "parking-row"}
                type="button"
                onClick={() => setSelectedId(point.id)}
              >
                <span className="rank">{index + 1}</span>
                <span className="parking-row-copy">
                  <strong>{point.name}</strong>
                  <span>
                    {formatDistance(point.distanceMeters)} away - {describeParkingPoint(point)}
                  </span>
                </span>
                <MapPin size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>

        <footer className="attribution">
          <details>
            <summary>View attributions</summary>
            <div className="attribution-details">
              <span>{cycleParkingDataset.metadata.attribution}</span>
              <a href={cycleParkingDataset.metadata.licenceUrl}>Open Government Licence v3.0</a>
              {hasUsedPlaceSearch ? (
                <span>
                  Place search by <a href="https://nominatim.openstreetmap.org/">Nominatim</a> using
                  OpenStreetMap data.
                </span>
              ) : null}
            </div>
          </details>
        </footer>
      </aside>
    </main>
  );
}

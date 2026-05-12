"use client";

import dynamic from "next/dynamic";
import { Crosshair, LocateFixed, MapPin, Search, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
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
import { buildParkingShareUrl, findSharedParkingPoint, parseUrlLocation } from "@/lib/share-links";

const CycleParkingMap = dynamic(() => import("@/components/cycle-parking-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>,
});

const parkingPoints = cycleParkingDataset.points as ParkingPoint[];
const maxPlaceSearchCacheEntries = 12;
const closestParkingResultCount = 8;
const copiedMessageDurationMs = 1_800;

type LocationState =
  | { status: "fallback"; location: UserLocation }
  | { status: "locating"; location: UserLocation }
  | { status: "located"; location: UserLocation }
  | { status: "searched"; location: UserLocation; label: string }
  | { status: "too-far"; location: UserLocation }
  | { status: "denied"; location: UserLocation }
  | { status: "unavailable"; location: UserLocation };

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
  const [copiedParkingId, setCopiedParkingId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isPlaceSearching, setIsPlaceSearching] = useState(false);
  const [hasUsedPlaceSearch, setHasUsedPlaceSearch] = useState(false);
  const [isAttributionModalOpen, setIsAttributionModalOpen] = useState(false);
  const placeSearchCache = useRef(new Map<string, PlaceSearchResult[]>());
  const placeSearchInFlight = useRef(false);
  const copiedMessageTimeout = useRef<number | null>(null);
  const attributionDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const sharedParkingPoint = findSharedParkingPoint(window.location.search, parkingPoints);
    if (sharedParkingPoint) {
      applyReferenceLocation(
        {
          latitude: sharedParkingPoint.latitude,
          longitude: sharedParkingPoint.longitude,
        },
        "located",
        undefined,
        sharedParkingPoint.id,
      );
      return;
    }

    const urlLocation = parseUrlLocation(window.location.search);
    if (urlLocation) {
      applyReferenceLocation(urlLocation, "located");
      return;
    }

    requestLocation();
  }, []);

  useEffect(() => {
    return () => {
      if (copiedMessageTimeout.current !== null) {
        window.clearTimeout(copiedMessageTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    const dialog = attributionDialog.current;
    if (!dialog) {
      return;
    }

    if (isAttributionModalOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isAttributionModalOpen && dialog.open) {
      dialog.close();
    }
  }, [isAttributionModalOpen]);

  const nearbyPoints = useMemo(
    () => sortByDistance(parkingPoints, locationState.location),
    [locationState.location],
  );

  const closestPoints = useMemo(
    () => nearbyPoints.slice(0, closestParkingResultCount),
    [nearbyPoints],
  );

  const nearestPoint = nearbyPoints[0] ?? null;
  const explicitSelectedPoint =
    selectedId !== null ? (nearbyPoints.find((point) => point.id === selectedId) ?? null) : null;
  const selectedPoint = explicitSelectedPoint ?? nearestPoint;

  function applyReferenceLocation(
    location: UserLocation,
    status: Extract<LocationState["status"], "located" | "searched">,
    label?: string,
    selectedParkingId?: string,
  ) {
    setSelectedId(selectedParkingId ?? null);

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

  async function copyParkingLink(event: MouseEvent<HTMLButtonElement>, point: ParkingPoint) {
    event.stopPropagation();
    const link = buildParkingShareUrl(window.location.origin, window.location.pathname, point.id);

    if (await copyTextToClipboard(link)) {
      setShareError(null);
      setCopiedParkingId(point.id);
      if (copiedMessageTimeout.current !== null) {
        window.clearTimeout(copiedMessageTimeout.current);
      }
      copiedMessageTimeout.current = window.setTimeout(() => {
        setCopiedParkingId(null);
        copiedMessageTimeout.current = null;
      }, copiedMessageDurationMs);
      return;
    }

    setCopiedParkingId(null);
    setShareError("Could not copy link.");
  }

  return (
    <main className="app-shell">
      <section className="map-pane" aria-label="Cycle parking map">
        <CycleParkingMap
          points={nearbyPoints}
          userLocation={locationState.location}
          selectedPoint={explicitSelectedPoint}
          nearestPoint={nearestPoint}
          rankedPoints={closestPoints}
          onSelectPoint={setSelectedId}
        />
      </section>

      <aside className="control-pane" aria-label="Nearest cycle parking">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true">
            <img src="favicon.svg" alt="" />
          </div>
          <div>
            <h1>Edinburgh Cycle Parking</h1>
            <p>{cycleParkingDataset.metadata.recordCount} locations</p>
          </div>
        </header>

        <section className="reference-panel" aria-label="Search from">
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
            <button
              className="place-search-button"
              type="submit"
              disabled={isPlaceSearching || placeQuery.trim().length === 0}
            >
              {isPlaceSearching ? "Searching" : "Search"}
            </button>
          </form>

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
          <h2>
            Nearby cycle parking <span>· {closestPoints.length} closest</span>
          </h2>
        </div>

        {locationState.status === "too-far" ? (
          <div className="status-message unavailable" role="status">
            You're very far away from a bike space, showing bike parking in central Edinburgh.
          </div>
        ) : null}

        {shareError ? (
          <div className="parking-share-message" role="status">
            {shareError}
          </div>
        ) : null}

        <ol className="parking-list" aria-label="Nearby cycle parking locations">
          {closestPoints.map((point, index) => (
            <li className="parking-list-item" key={point.id}>
              <button
                className={[
                  "parking-row",
                  index === 0 ? "closest" : null,
                  point.id === explicitSelectedPoint?.id ? "selected" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                onClick={() => setSelectedId(point.id)}
              >
                <span className={`rank rank-${index + 1}`}>{index + 1}</span>
                <span className="parking-row-copy">
                  {index === 0 ? <span className="closest-label">Closest</span> : null}
                  <strong>{point.name}</strong>
                  <span>
                    {formatDistance(point.distanceMeters)} away - {describeParkingPoint(point)}
                  </span>
                </span>
              </button>
              <button
                aria-label={`Copy link to ${point.name}`}
                className="parking-share-button"
                type="button"
                onClick={(event) => {
                  void copyParkingLink(event, point);
                }}
              >
                <Share2 size={17} aria-hidden="true" />
                {copiedParkingId === point.id ? (
                  <span className="parking-share-tooltip" role="status">
                    Copied
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>

        <footer className="attribution">
          <button
            className="attribution-trigger"
            type="button"
            onClick={() => setIsAttributionModalOpen(true)}
          >
            View attributions
          </button>
          <dialog
            ref={attributionDialog}
            className="attribution-modal"
            aria-labelledby="attribution-modal-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setIsAttributionModalOpen(false);
              }
            }}
            onClose={() => setIsAttributionModalOpen(false)}
          >
            <div className="attribution-modal-content">
              <div className="attribution-modal-header">
                <h2 id="attribution-modal-title">Attributions</h2>
                <button
                  className="attribution-modal-close"
                  type="button"
                  onClick={() => setIsAttributionModalOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="attribution-details">
                <span>{cycleParkingDataset.metadata.attribution}</span>
                <a href={cycleParkingDataset.metadata.licenceUrl}>Open Government Licence v3.0</a>
                {hasUsedPlaceSearch ? (
                  <span>
                    Place search by <a href="https://nominatim.openstreetmap.org/">Nominatim</a>{" "}
                    using OpenStreetMap data.
                  </span>
                ) : null}
              </div>
            </div>
          </dialog>
        </footer>
      </aside>
    </main>
  );
}

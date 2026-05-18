'use client';

import dynamic from 'next/dynamic';
import {
  Bike,
  Boxes,
  Building2,
  CircleHelp,
  CircleParking,
  Crosshair,
  Download,
  ExternalLink,
  LocateFixed,
  MapPin,
  Monitor,
  Moon,
  Navigation,
  Route,
  Search,
  Settings,
  Share2,
  Sun,
  Umbrella,
  UmbrellaOff,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import cycleParkingDataset from '@/data/cycle-parking.json';
import {
  buildShortCycleRoute,
  buildCycleRouteCacheKey,
  buildCycleStreetsDirectionsRequest,
  describeCycleRouteInstruction,
  fetchCycleStreetsDirections,
  formatCycleRouteDuration,
  parseCycleStreetsRoute,
  SHORT_CYCLE_ROUTE_THRESHOLD_METERS,
  type CycleRoute,
} from '@/lib/cyclestreets';
import {
  buildPlaceSearchUrl,
  parsePlaceSearchResults,
  type PlaceSearchResult,
} from '@/lib/geocoder';
import type { ParkingPoint, UserLocation } from '@/lib/types';
import {
  EDINBURGH_FALLBACK_LOCATION,
  formatDistance,
  distanceMeters,
  isFarFromNearestParking,
  isResolvedLocation,
  sortByDistance,
} from '@/lib/geo';
import { getParkingPopupDetails, type ParkingPopupIcon } from '@/lib/parking';
import { buildParkingShareUrl, parseShareLinkState } from '@/lib/share-links';
import { usePwaInstallPrompt } from '@/components/pwa-install-prompt';
import posthog from 'posthog-js';

const CycleParkingMap = dynamic(
  () => import('@/components/cycle-parking-map'),
  {
    ssr: false,
    loading: () => <div className="map-loading">Loading map...</div>,
  },
);

const parkingPoints = cycleParkingDataset.points as ParkingPoint[];
const maxPlaceSearchCacheEntries = 12;
const closestParkingResultCount = 8;
const copiedMessageDurationMs = 1_800;
const defaultLocale = 'en-GB';
const themeStorageKey = 'cycle-parking-theme';
const mobileSheetDragThresholdPx = 48;
const mobileSheetDragRangePx = 320;

const parkingListIconByName: Partial<Record<ParkingPopupIcon, LucideIcon>> = {
  building: Building2,
  covered: Umbrella,
  fixture: Boxes,
  'not-covered': UmbrellaOff,
  parking: CircleParking,
  stand: Bike,
  storage: Warehouse,
  unknown: CircleHelp,
};

function ParkingListDetailIcon({ icon }: { icon: ParkingPopupIcon }) {
  const Icon = parkingListIconByName[icon] ?? CircleHelp;

  return <Icon size={13} aria-hidden="true" />;
}

const parkingDetailLabels = new Set(['Spaces', 'Type', 'Cover']);

function ParkingDetailStrip({
  className,
  includeDistance,
  point,
}: {
  className?: string;
  includeDistance?: boolean;
  point: ParkingPoint;
}) {
  const parkingDetails = getParkingPopupDetails(point);
  const visibleDetails = parkingDetails.details.filter((detail) =>
    parkingDetailLabels.has(detail.label),
  );

  if (!includeDistance && visibleDetails.length === 0) {
    return null;
  }

  return (
    <span
      aria-label="Parking details"
      className={['parking-row-details', className].filter(Boolean).join(' ')}
    >
      {includeDistance
        ? parkingDetails.metrics.map((metric) => (
            <span className="parking-row-detail" key={metric.label}>
              <MapPin size={13} aria-hidden="true" />
              <span>{metric.value}</span>
            </span>
          ))
        : null}
      {visibleDetails.map((detail) => (
        <span className="parking-row-detail" key={detail.label}>
          <span className="parking-row-detail-icon">
            {detail.emphasis ?? <ParkingListDetailIcon icon={detail.icon} />}
          </span>
          <span>
            {detail.label === 'Spaces'
              ? detail.value.toLowerCase()
              : detail.value}
          </span>
        </span>
      ))}
    </span>
  );
}

type LocationState =
  | { status: 'fallback'; location: UserLocation }
  | { status: 'locating'; location: UserLocation }
  | { status: 'located'; location: UserLocation }
  | { status: 'searched'; location: UserLocation; label: string }
  | { status: 'too-far'; location: UserLocation }
  | { status: 'denied'; location: UserLocation }
  | { status: 'unavailable'; location: UserLocation };

type DirectionsState =
  | { status: 'idle' }
  | { status: 'missing-key'; parkingId: string }
  | { status: 'loading'; parkingId: string }
  | { status: 'loaded'; parkingId: string; route: CycleRoute }
  | { status: 'error'; parkingId: string; message: string };

type ShareSource = 'list' | 'popup';
type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';
type MobileSheetState = 'expanded' | 'collapsed';

type CopiedShareButton = {
  parkingId: string;
  source: ShareSource;
};

const themeOptions: {
  icon: typeof Monitor;
  label: string;
  mode: ThemeMode;
}[] = [
  { icon: Monitor, label: 'System', mode: 'system' },
  { icon: Sun, label: 'Light', mode: 'light' },
  { icon: Moon, label: 'Dark', mode: 'dark' },
];

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light';
  }

  return mode;
}

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
    status: 'fallback',
    location: EDINBURGH_FALLBACK_LOCATION,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(
    null,
  );
  const [copiedShareButton, setCopiedShareButton] =
    useState<CopiedShareButton | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [directionsState, setDirectionsState] = useState<DirectionsState>({
    status: 'idle',
  });
  const [isPlaceSearching, setIsPlaceSearching] = useState(false);
  const [hasUsedPlaceSearch, setHasUsedPlaceSearch] = useState(false);
  const [isAttributionModalOpen, setIsAttributionModalOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [numberLocale, setNumberLocale] = useState(defaultLocale);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [mobileSheetState, setMobileSheetState] =
    useState<MobileSheetState>('expanded');
  const [mobileSheetDragOffset, setMobileSheetDragOffset] = useState(0);
  const [mobileSheetDragProgress, setMobileSheetDragProgress] = useState(0);
  const { canInstall, installApp } = usePwaInstallPrompt();
  const placeSearchCache = useRef(new Map<string, PlaceSearchResult[]>());
  const directionsCache = useRef(new Map<string, CycleRoute>());
  const placeSearchInFlight = useRef(false);
  const directionsRequestId = useRef(0);
  const copiedMessageTimeout = useRef<number | null>(null);
  const attributionDialog = useRef<HTMLDialogElement>(null);
  const settingsMenu = useRef<HTMLDivElement>(null);
  const mobileSheetDrag = useRef<{
    currentY: number;
    pointerId: number;
    startY: number;
  } | null>(null);
  const ignoreNextSheetGripClick = useRef(false);

  useEffect(() => {
    setNumberLocale(navigator.language || defaultLocale);

    const { referenceLocation, selectedParkingId } = parseShareLinkState(
      window.location.search,
      parkingPoints,
    );

    if (referenceLocation) {
      applyReferenceLocation(
        referenceLocation,
        'located',
        undefined,
        selectedParkingId ?? undefined,
      );
      return;
    }

    if (selectedParkingId) {
      requestLocation(selectedParkingId);
      return;
    }

    requestLocation();
  }, []);

  useEffect(() => {
    const storedThemeMode = window.localStorage.getItem(themeStorageKey);

    if (isThemeMode(storedThemeMode)) {
      setThemeMode(storedThemeMode);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function updateResolvedTheme() {
      setResolvedTheme(resolveTheme(themeMode, mediaQuery.matches));
    }

    updateResolvedTheme();

    if (themeMode !== 'system') {
      return;
    }

    mediaQuery.addEventListener('change', updateResolvedTheme);

    return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  useEffect(() => {
    return () => {
      if (copiedMessageTimeout.current !== null) {
        window.clearTimeout(copiedMessageTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSettingsMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!settingsMenu.current?.contains(event.target as Node)) {
        setIsSettingsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsSettingsMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsMenuOpen]);

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
  const formattedParkingLocationCount = useMemo(
    () => cycleParkingDataset.metadata.recordCount.toLocaleString(numberLocale),
    [numberLocale],
  );

  const nearestPoint = nearbyPoints[0] ?? null;
  const explicitSelectedPoint =
    selectedId !== null
      ? (nearbyPoints.find((point) => point.id === selectedId) ?? null)
      : null;
  const directionsParkingPoint =
    directionsState.status !== 'idle'
      ? (nearbyPoints.find((point) => point.id === directionsState.parkingId) ??
        null)
      : null;
  const activeRoute =
    directionsState.status === 'loaded' ? directionsState.route : null;
  const isDirectionsMode =
    directionsState.status !== 'idle' && directionsParkingPoint !== null;

  useEffect(() => {
    if (isDirectionsMode) {
      setMobileSheetState('expanded');
    }
  }, [isDirectionsMode]);

  function toggleMobileSheet() {
    if (isDirectionsMode) {
      return;
    }

    setMobileSheetState((current) =>
      current === 'expanded' ? 'collapsed' : 'expanded',
    );
  }

  function snapMobileSheetFromDrag(deltaY: number) {
    if (Math.abs(deltaY) < mobileSheetDragThresholdPx) {
      setMobileSheetDragOffset(0);
      setMobileSheetDragProgress(mobileSheetState === 'expanded' ? 1 : 0);
      return;
    }

    ignoreNextSheetGripClick.current = true;
    setMobileSheetState(deltaY > 0 ? 'collapsed' : 'expanded');
    setMobileSheetDragOffset(0);
    setMobileSheetDragProgress(deltaY > 0 ? 0 : 1);
  }

  function handleSheetGripPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (isDirectionsMode) {
      return;
    }

    mobileSheetDrag.current = {
      currentY: event.clientY,
      pointerId: event.pointerId,
      startY: event.clientY,
    };
    setMobileSheetDragOffset(0);
    setMobileSheetDragProgress(mobileSheetState === 'expanded' ? 1 : 0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSheetGripPointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = mobileSheetDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    drag.currentY = event.clientY;
    const rawDeltaY = event.clientY - drag.startY;
    const dragDistance =
      mobileSheetState === 'expanded'
        ? Math.max(0, rawDeltaY)
        : Math.max(0, -rawDeltaY);
    const dragProgress =
      mobileSheetState === 'expanded'
        ? 1 - Math.min(dragDistance / mobileSheetDragRangePx, 1)
        : Math.min(dragDistance / mobileSheetDragRangePx, 1);
    const nextOffset =
      mobileSheetState === 'expanded'
        ? Math.min(rawDeltaY, mobileSheetDragRangePx)
        : Math.max(rawDeltaY, -mobileSheetDragRangePx);
    setMobileSheetDragOffset(nextOffset);
    setMobileSheetDragProgress(dragProgress);
  }

  function handleSheetGripPointerEnd(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = mobileSheetDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    mobileSheetDrag.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    snapMobileSheetFromDrag(drag.currentY - drag.startY);
  }

  function handleSheetGripClick() {
    if (ignoreNextSheetGripClick.current) {
      ignoreNextSheetGripClick.current = false;
      return;
    }

    toggleMobileSheet();
  }

  function handleSheetGripPointerCancel(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    mobileSheetDrag.current = null;
    setMobileSheetDragOffset(0);
    setMobileSheetDragProgress(mobileSheetState === 'expanded' ? 1 : 0);
  }

  const controlPaneStyle = {
    '--mobile-sheet-drag-progress':
      mobileSheetDrag.current !== null
        ? mobileSheetDragProgress
        : mobileSheetState === 'expanded'
          ? 1
          : 0,
  } as CSSProperties;

  function clearDirections() {
    directionsRequestId.current += 1;
    setDirectionsState({ status: 'idle' });
  }

  function applyReferenceLocation(
    location: UserLocation,
    status: Extract<LocationState['status'], 'located' | 'searched'>,
    label?: string,
    selectedParkingId?: string,
  ) {
    setSelectedId(selectedParkingId ?? null);
    clearDirections();

    if (
      status === 'located' &&
      isFarFromNearestParking(parkingPoints, location)
    ) {
      setLocationState({
        status: 'too-far',
        location: EDINBURGH_FALLBACK_LOCATION,
      });
      return;
    }

    setLocationState(
      status === 'searched'
        ? {
            status,
            location,
            label: label ?? 'selected place',
          }
        : {
            status,
            location,
          },
    );
  }

  function requestLocation(selectedParkingId?: string) {
    setSelectedId(selectedParkingId ?? null);
    clearDirections();

    if (!('geolocation' in navigator)) {
      setLocationState({
        status: 'unavailable',
        location: EDINBURGH_FALLBACK_LOCATION,
      });
      return;
    }

    setLocationState((current) => ({
      status: 'locating',
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
            status: 'unavailable',
            location: EDINBURGH_FALLBACK_LOCATION,
          });
          return;
        }

        posthog.capture('location_granted');
        applyReferenceLocation(
          location,
          'located',
          undefined,
          selectedParkingId,
        );
      },
      (error) => {
        const status =
          error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable';
        posthog.capture('location_denied', { reason: status });
        setLocationState({
          status,
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
        cachedResults.length === 0
          ? 'No matching Edinburgh places found.'
          : null,
      );
      return;
    }

    placeSearchInFlight.current = true;
    setIsPlaceSearching(true);
    setPlaceSearchMessage(null);

    try {
      const response = await fetch(buildPlaceSearchUrl(trimmedQuery), {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Place search failed');
      }

      const results = parsePlaceSearchResults(await response.json());
      placeSearchCache.current.set(cacheKey, results);
      if (placeSearchCache.current.size > maxPlaceSearchCacheEntries) {
        const oldestKey = placeSearchCache.current.keys().next().value;
        if (oldestKey) {
          placeSearchCache.current.delete(oldestKey);
        }
      }
      posthog.capture('place_searched', {
        query: trimmedQuery,
        result_count: results.length,
      });
      setPlaceResults(results);
      setPlaceSearchMessage(
        results.length === 0 ? 'No matching Edinburgh places found.' : null,
      );
      setHasUsedPlaceSearch(true);
    } catch {
      posthog.capture('place_searched', { query: trimmedQuery, error: true });
      setPlaceResults([]);
      setPlaceSearchMessage('Place search is unavailable right now.');
    } finally {
      placeSearchInFlight.current = false;
      setIsPlaceSearching(false);
    }
  }

  function selectPlace(result: PlaceSearchResult) {
    posthog.capture('place_selected', { place_name: result.name });
    setPlaceResults([]);
    setPlaceSearchMessage(null);
    setPlaceQuery(result.name.split(',')[0] ?? result.name);
    setHasUsedPlaceSearch(true);
    applyReferenceLocation(
      result.location,
      'searched',
      result.name.split(',')[0] ?? result.name,
    );
  }

  function selectParkingPoint(id: string) {
    posthog.capture('parking_selected', { parking_id: id });
    setSelectedId(id);
    clearDirections();
  }

  async function requestDirectionsToPoint(point: ParkingPoint) {
    posthog.capture('directions_requested', {
      parking_id: point.id,
      parking_name: point.name,
    });
    setSelectedId(point.id);

    const apiKey = process.env.NEXT_PUBLIC_CYCLESTREETS_API_KEY;

    if (!apiKey) {
      setDirectionsState({ status: 'missing-key', parkingId: point.id });
      return;
    }

    const cacheKey = buildCycleRouteCacheKey(locationState.location, point);
    const cachedRoute = directionsCache.current.get(cacheKey);

    if (cachedRoute) {
      setDirectionsState({
        status: 'loaded',
        parkingId: point.id,
        route: cachedRoute,
      });
      return;
    }

    if (
      distanceMeters(locationState.location, point) <=
      SHORT_CYCLE_ROUTE_THRESHOLD_METERS
    ) {
      const route = buildShortCycleRoute(locationState.location, point);
      directionsCache.current.set(cacheKey, route);
      setDirectionsState({ status: 'loaded', parkingId: point.id, route });
      return;
    }

    directionsRequestId.current += 1;
    const requestId = directionsRequestId.current;
    setDirectionsState({ status: 'loading', parkingId: point.id });

    try {
      const request = buildCycleStreetsDirectionsRequest({
        apiKey,
        origin: locationState.location,
        destination: point,
      });
      const route = parseCycleStreetsRoute(
        await fetchCycleStreetsDirections(request),
      );

      if (directionsRequestId.current !== requestId) {
        return;
      }

      directionsCache.current.set(cacheKey, route);
      posthog.capture('directions_loaded', {
        parking_id: point.id,
        parking_name: point.name,
        distance_meters: route.distanceMeters,
        duration_seconds: route.durationSeconds,
        route_source: route.source,
      });
      setDirectionsState({ status: 'loaded', parkingId: point.id, route });
    } catch (error) {
      if (directionsRequestId.current !== requestId) {
        return;
      }

      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Directions are unavailable right now.';
      posthog.capture('directions_error', {
        parking_id: point.id,
        parking_name: point.name,
        message,
      });
      setDirectionsState({
        status: 'error',
        parkingId: point.id,
        message,
      });
    }
  }

  async function requestDirections(
    event: MouseEvent<HTMLButtonElement>,
    point: ParkingPoint,
  ) {
    event.stopPropagation();
    await requestDirectionsToPoint(point);
  }

  async function copyParkingLinkForPoint(
    point: ParkingPoint,
    source: ShareSource,
  ) {
    const link = buildParkingShareUrl(
      window.location.origin,
      window.location.pathname,
      point.id,
    );

    if (await copyTextToClipboard(link)) {
      posthog.capture('parking_link_copied', {
        parking_id: point.id,
        parking_name: point.name,
        source,
      });
      setShareError(null);
      setCopiedShareButton({ parkingId: point.id, source });
      if (copiedMessageTimeout.current !== null) {
        window.clearTimeout(copiedMessageTimeout.current);
      }
      copiedMessageTimeout.current = window.setTimeout(() => {
        setCopiedShareButton(null);
        copiedMessageTimeout.current = null;
      }, copiedMessageDurationMs);
      return;
    }

    setCopiedShareButton(null);
    setShareError('Could not copy link.');
  }

  async function copyParkingLink(
    event: MouseEvent<HTMLButtonElement>,
    point: ParkingPoint,
  ) {
    event.stopPropagation();
    await copyParkingLinkForPoint(point, 'list');
  }

  function chooseThemeMode(mode: ThemeMode) {
    posthog.capture('theme_changed', { theme: mode });
    setThemeMode(mode);
    setIsSettingsMenuOpen(false);
  }

  function installPwa() {
    posthog.capture('pwa_install_triggered');
    setIsSettingsMenuOpen(false);
    void installApp();
  }

  function renderThemeSettings() {
    return (
      <div className="settings-menu" ref={settingsMenu}>
        <button
          aria-expanded={isSettingsMenuOpen}
          aria-label="Theme settings"
          className="settings-trigger"
          type="button"
          onClick={() => setIsSettingsMenuOpen((isOpen) => !isOpen)}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
        {isSettingsMenuOpen ? (
          <div className="settings-popover" role="menu" aria-label="Settings">
            <span className="settings-label">Theme</span>
            <div className="theme-options" role="group" aria-label="Theme">
              {themeOptions.map(({ icon: Icon, label, mode }) => (
                <button
                  aria-pressed={themeMode === mode}
                  className={themeMode === mode ? 'selected' : undefined}
                  key={mode}
                  type="button"
                  onClick={() => chooseThemeMode(mode)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            {canInstall ? (
              <>
                <span className="settings-label">App</span>
                <button
                  className="settings-action-button"
                  type="button"
                  onClick={installPwa}
                >
                  <Download size={15} aria-hidden="true" />
                  Install app
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderAttributionFooter(className = '') {
    return (
      <footer className={['attribution', className].filter(Boolean).join(' ')}>
        <button
          className="attribution-trigger"
          type="button"
          onClick={() => setIsAttributionModalOpen(true)}
        >
          Attributions
        </button>
        <span className="built-by-credit">
          Built by <a href="https://tau.gr">taugr</a>
        </span>
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
            </div>
            <div className="attribution-details">
              <span>{cycleParkingDataset.metadata.attribution}</span>
              <a href={cycleParkingDataset.metadata.licenceUrl}>
                Open Government Licence v3.0
              </a>
              <span>
                Map interface by <a href="https://leafletjs.com/">Leaflet</a>.
              </span>
              {hasUsedPlaceSearch ? (
                <span>
                  Place search by{' '}
                  <a href="https://nominatim.openstreetmap.org/">Nominatim</a>{' '}
                  using OpenStreetMap data.
                </span>
              ) : null}
              <span>
                Cycle directions by{' '}
                <a href="https://www.cyclestreets.net/">CycleStreets</a>
                {'.'}
              </span>
            </div>
            <div className="attribution-modal-footer">
              <button
                className="attribution-modal-close"
                type="button"
                onClick={() => setIsAttributionModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </dialog>
      </footer>
    );
  }

  return (
    <main className="app-shell" data-theme={resolvedTheme}>
      <section className="map-pane" aria-label="Cycle parking map">
        <CycleParkingMap
          points={nearbyPoints}
          userLocation={locationState.location}
          selectedPoint={explicitSelectedPoint}
          nearestPoint={nearestPoint}
          rankedPoints={nearbyPoints}
          route={activeRoute}
          isDirectionsMode={isDirectionsMode}
          mobileSheetState={isDirectionsMode ? 'expanded' : mobileSheetState}
          copiedShareButton={copiedShareButton}
          theme={resolvedTheme}
          onSelectPoint={selectParkingPoint}
          onRequestDirections={(point) => {
            void requestDirectionsToPoint(point);
          }}
          onCopyParkingLink={(point) => {
            void copyParkingLinkForPoint(point, 'popup');
          }}
        />
      </section>

      <aside
        className="control-pane"
        aria-label="Nearest cycle parking"
        data-mobile-sheet-dragging={
          mobileSheetDragOffset !== 0 ? 'true' : undefined
        }
        data-mobile-sheet-state={
          isDirectionsMode ? 'expanded' : mobileSheetState
        }
        style={controlPaneStyle}
      >
        {!isDirectionsMode ? (
          <button
            aria-expanded={mobileSheetState === 'expanded'}
            aria-label={
              mobileSheetState === 'expanded'
                ? 'Collapse results panel'
                : 'Expand results panel'
            }
            className="mobile-sheet-grip"
            type="button"
            onClick={handleSheetGripClick}
            onPointerCancel={handleSheetGripPointerCancel}
            onPointerDown={handleSheetGripPointerDown}
            onPointerMove={handleSheetGripPointerMove}
            onPointerUp={handleSheetGripPointerEnd}
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
        {isDirectionsMode ? (
          <section className="directions-mode" aria-label="Cycle directions">
            <div className="directions-mode-header">
              <div className="directions-title">
                <div className="brand-mark directions-mark" aria-hidden="true">
                  <Route size={24} />
                </div>
                <div>
                  <h1>{directionsParkingPoint?.name ?? 'Directions'}</h1>
                  {directionsParkingPoint ? (
                    <ParkingDetailStrip
                      className="directions-parking-details"
                      point={directionsParkingPoint}
                    />
                  ) : (
                    <p>Cycle route</p>
                  )}
                </div>
              </div>
              <button type="button" onClick={clearDirections}>
                <X size={16} aria-hidden="true" />
                Exit directions
              </button>
            </div>

            {directionsState.status === 'loading' ? (
              <p className="directions-message">Finding a cycle route...</p>
            ) : null}

            {directionsState.status === 'missing-key' ? (
              <p className="directions-message">
                Directions need a CycleStreets API key.
              </p>
            ) : null}

            {directionsState.status === 'error' ? (
              <p className="directions-message">{directionsState.message}</p>
            ) : null}

            {directionsState.status === 'loaded' ? (
              <>
                <div className="directions-summary">
                  <div
                    className="directions-metrics"
                    aria-label="Route summary"
                  >
                    <span>
                      <Navigation size={16} aria-hidden="true" />
                      {formatDistance(directionsState.route.distanceMeters)}
                    </span>
                    <span>
                      <Bike size={16} aria-hidden="true" />
                      {formatCycleRouteDuration(
                        directionsState.route.durationSeconds,
                      )}
                    </span>
                  </div>
                </div>
                {directionsState.route.instructions.length > 0 ? (
                  <ol className="directions-list">
                    {directionsState.route.instructions
                      .slice(0, 8)
                      .map((instruction, index) => (
                        <li key={instruction.id}>
                          <span
                            className="directions-step-number"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <span className="directions-step-text">
                            {describeCycleRouteInstruction(instruction)}
                          </span>
                          <small className="directions-step-distance">
                            {formatDistance(instruction.distanceMeters)}
                          </small>
                        </li>
                      ))}
                  </ol>
                ) : null}
                {directionsState.route.source === 'cyclestreets' ? (
                  <p className="directions-attribution">
                    <Bike size={18} aria-hidden="true" />
                    <span>Route by</span>
                    {directionsState.route.routeUrl ? (
                      <a href={directionsState.route.routeUrl}>
                        CycleStreets
                        <ExternalLink size={16} aria-hidden="true" />
                      </a>
                    ) : (
                      <a href="https://www.cyclestreets.net/">
                        CycleStreets
                        <ExternalLink size={16} aria-hidden="true" />
                      </a>
                    )}
                  </p>
                ) : null}
              </>
            ) : null}
            {renderAttributionFooter('directions-footer')}
          </section>
        ) : (
          <>
            <header className="app-header">
              <div className="brand-mark" aria-hidden="true">
                <img src="favicon.svg" alt="" />
              </div>
              <div>
                <h1>Bike Neuks</h1>
                <p>
                  {formattedParkingLocationCount} cycle parking spots in
                  Edinburgh
                </p>
              </div>
              {renderThemeSettings()}
            </header>

            <div className="mobile-sheet-body">
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
                      id="place-search"
                      name="place-search"
                      type="search"
                      value={placeQuery}
                      placeholder="Place or postcode"
                      onChange={(event) => setPlaceQuery(event.target.value)}
                    />
                  </label>
                  <button
                    aria-label={
                      locationState.status === 'locating'
                        ? 'Locating'
                        : 'Use current location'
                    }
                    className="secondary-location-button"
                    title={
                      locationState.status === 'locating'
                        ? 'Locating'
                        : 'Use current location'
                    }
                    type="button"
                    onClick={() => {
                      posthog.capture('location_requested');
                      requestLocation();
                    }}
                    disabled={locationState.status === 'locating'}
                  >
                    {locationState.status === 'locating' ? (
                      <Crosshair size={18} aria-hidden="true" />
                    ) : (
                      <LocateFixed size={18} aria-hidden="true" />
                    )}
                    <span className="sr-only">
                      {locationState.status === 'locating'
                        ? 'Locating'
                        : 'Near me'}
                    </span>
                  </button>
                  <button
                    className="place-search-button"
                    type="submit"
                    disabled={
                      isPlaceSearching || placeQuery.trim().length === 0
                    }
                  >
                    <Search size={18} aria-hidden="true" />
                    <span className="mobile-action-label">
                      {isPlaceSearching ? 'Searching' : 'Search'}
                    </span>
                  </button>
                </form>

                {placeResults.length > 0 ? (
                  <ol
                    className="place-results"
                    aria-label="Place search results"
                  >
                    {placeResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => selectPlace(result)}
                        >
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
                  Nearby cycle parking{' '}
                  <span>· {closestPoints.length} closest</span>
                </h2>
              </div>

              {shareError ? (
                <div className="parking-share-message" role="status">
                  {shareError}
                </div>
              ) : null}

              <div className="parking-list-scroll">
                {locationState.status === 'too-far' ? (
                  <div className="parking-list-context" role="status">
                    You're very far away from a bike space, showing bike parking
                    in central Edinburgh.
                  </div>
                ) : null}

                <ol
                  className="parking-list"
                  aria-label="Nearby cycle parking locations"
                >
                  {closestPoints.map((point, index) => {
                    return (
                      <li className="parking-list-item" key={point.id}>
                        <button
                          className={[
                            'parking-row',
                            index === 0 ? 'closest' : null,
                            point.id === explicitSelectedPoint?.id
                              ? 'selected'
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          type="button"
                          onClick={() => selectParkingPoint(point.id)}
                        >
                          <span className={`rank rank-${index + 1}`}>
                            {index + 1}
                          </span>
                          <span className="parking-row-copy">
                            <strong>{point.name}</strong>
                            <ParkingDetailStrip includeDistance point={point} />
                          </span>
                        </button>
                        <button
                          aria-label={`Show cycle directions to ${point.name}`}
                          className="parking-directions-button"
                          type="button"
                          onClick={(event) => {
                            void requestDirections(event, point);
                          }}
                        >
                          <Navigation size={17} aria-hidden="true" />
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
                          {copiedShareButton?.source === 'list' &&
                          copiedShareButton.parkingId === point.id ? (
                            <span
                              className="parking-share-tooltip"
                              role="status"
                            >
                              Copied
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {renderAttributionFooter()}
            </div>
          </>
        )}
      </aside>
    </main>
  );
}

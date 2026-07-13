'use client';

import dynamic from 'next/dynamic';
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  animate,
  motion,
  type MotionStyle,
  type TargetAndTransition,
  type Transition,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import {
  ArrowUp,
  Bike,
  Boxes,
  Building2,
  CircleHelp,
  CircleParking,
  CornerUpLeft,
  CornerUpRight,
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
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  type CycleRouteInstruction,
  type CycleRoutePoint,
} from '@/lib/cyclestreets';
import {
  buildPlaceSearchUrl,
  parsePlaceSearchResults,
  type PlaceSearchResult,
} from '@/lib/geocoder';
import {
  canUseGeolocation,
  clearWatch,
  getCurrentPosition,
  watchPosition,
} from '@/lib/geolocation';
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
import { getParkingDisplayName } from '@/lib/parking-names';
import {
  getBearingDegrees,
  getLiveRouteProgress,
  LIVE_ROUTE_MIN_HEADING_DISTANCE_METERS,
  type LiveRouteProgress,
} from '@/lib/route-progress';
import { getRouteInstructionManeuver } from '@/lib/route-instructions';
import { buildParkingShareUrl, parseShareLinkState } from '@/lib/share-links';
import { buildGoogleStreetViewEmbedUrl } from '@/lib/street-view';
import { usePwaInstallPrompt } from '@/components/pwa-install-prompt';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { copyTextToClipboard } from '@/lib/clipboard';

const CycleParkingMap = dynamic(
  () => import('@/components/cycle-parking-map'),
  {
    ssr: false,
    loading: () => <div className="map-loading">Loading map...</div>,
  },
);

const parkingPoints = (cycleParkingDataset.points as ParkingPoint[]).map(
  (point) => ({
    ...point,
    name: getParkingDisplayName(point),
  }),
);
const maxPlaceSearchCacheEntries = 12;
const closestParkingResultCount = 8;
const copiedMessageDurationMs = 1_800;
const defaultLocale = 'en-GB';
const themeStorageKey = 'cycle-parking-theme';
const mobileSheetCollapsedHeightRem = 5.4;
const mobileSheetDragIntentThresholdPx = 6;
const mobileSheetExpandedViewportRatio = 0.52;
const mobileSheetFlickVelocityPxPerMs = 0.45;
const googleStreetViewApiKey =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY?.trim() ?? '';
type PresenceMotion = {
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  initial: TargetAndTransition;
  transition: Transition;
};

function getRouteInstructionIcon(
  instruction: CycleRouteInstruction,
): LucideIcon {
  const maneuver = getRouteInstructionManeuver(instruction);

  if (maneuver === 'start') {
    return Route;
  }

  if (maneuver === 'arrive') {
    return MapPin;
  }

  if (maneuver === 'left') {
    return CornerUpLeft;
  }

  if (maneuver === 'right') {
    return CornerUpRight;
  }

  return ArrowUp;
}

const quickFadeTransition: Transition = { duration: 0.16, ease: 'easeOut' };
const smallRiseTransition: Transition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
};
const directionsRevealTransition: Transition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
};
const tooltipTransition: Transition = {
  type: 'spring',
  stiffness: 600,
  damping: 34,
  mass: 0.7,
};
const panelSlideTransition: Transition = {
  type: 'spring',
  stiffness: 360,
  damping: 40,
  mass: 0.9,
};
const rowLayoutTransition: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 42,
  mass: 0.8,
};
const buttonTap = { scale: 0.96 };

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

type LiveRouteTrackingState =
  | { status: 'idle' }
  | { status: 'starting' }
  | {
      status: 'tracking';
      accuracyMeters: number | null;
      headingDegrees: number | null;
      location: UserLocation;
      updatedAt: number;
    }
  | { status: 'denied' }
  | { status: 'too-far' }
  | { status: 'unavailable' };

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

export default function CycleParkingFinder() {
  const shouldReduceMotion = useReducedMotion();
  const [locationState, setLocationState] = useState<LocationState>({
    status: 'fallback',
    location: EDINBURGH_FALLBACK_LOCATION,
  });
  const [currentLocationFocusRequestId, setCurrentLocationFocusRequestId] =
    useState(0);
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
  const [liveRouteTracking, setLiveRouteTracking] =
    useState<LiveRouteTrackingState>({
      status: 'idle',
    });
  const [activeInstruction, setActiveInstruction] = useState<{
    id: string;
    requestId: number;
  } | null>(null);
  const [routeInstructionFocusRequest, setRouteInstructionFocusRequest] =
    useState<{
      id: string;
      requestId: number;
    } | null>(null);
  const [isPlaceSearching, setIsPlaceSearching] = useState(false);
  const [hasUsedPlaceSearch, setHasUsedPlaceSearch] = useState(false);
  const [isAttributionModalOpen, setIsAttributionModalOpen] = useState(false);
  const [streetViewPoint, setStreetViewPoint] = useState<ParkingPoint | null>(
    null,
  );
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [numberLocale, setNumberLocale] = useState(defaultLocale);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [isClientReady, setIsClientReady] = useState(false);
  const [mobileSheetState, setMobileSheetState] =
    useState<MobileSheetState>('expanded');
  const [isMobileSheetDragging, setIsMobileSheetDragging] = useState(false);
  const mobileSheetProgressValue = useMotionValue(1);
  const mobileSheetBodyOffset = useTransform(
    mobileSheetProgressValue,
    (progress) => `${((1 - progress) * 10).toFixed(2)}px`,
  );
  const mobileSheetBodyOpacity = useTransform(
    mobileSheetProgressValue,
    (progress) => Math.max(0, Math.min(1, (progress - 0.15) / 0.7)),
  );
  const mobileSheetSummaryOffset = useTransform(
    mobileSheetProgressValue,
    (progress) => `${(progress * -6).toFixed(2)}px`,
  );
  const mobileSheetSummaryOpacity = useTransform(
    mobileSheetProgressValue,
    (progress) => Math.max(0, Math.min(1, (0.4 - progress) / 0.4)),
  );
  const { canInstall, installApp } = usePwaInstallPrompt();
  const placeSearchCache = useRef(new Map<string, PlaceSearchResult[]>());
  const directionsCache = useRef(new Map<string, CycleRoute>());
  const placeSearchInFlight = useRef(false);
  const directionsRequestId = useRef(0);
  const liveRouteWatchId = useRef<number | null>(null);
  const previousLiveRouteMarkerPosition = useRef<CycleRoutePoint | null>(null);
  const copiedMessageTimeout = useRef<number | null>(null);
  const attributionDialog = useRef<HTMLDialogElement>(null);
  const streetViewDialog = useRef<HTMLDialogElement>(null);
  const parkingListItemRefs = useRef(new Map<string, HTMLLIElement>());
  const mobileSheetDrag = useRef<{
    currentY: number;
    lastTimestamp: number;
    lastY: number;
    pointerId: number;
    rangePx: number;
    startProgress: number;
    startY: number;
    velocityY: number;
  } | null>(null);
  const ignoreNextSheetGripClick = useRef(false);
  const subtleTap = shouldReduceMotion ? undefined : buttonTap;
  const fadePresence: PresenceMotion = {
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    initial: { opacity: 0 },
    transition: quickFadeTransition,
  };
  const risePresence: PresenceMotion = shouldReduceMotion
    ? fadePresence
    : {
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 6 },
        initial: { opacity: 0, y: 8 },
        transition: smallRiseTransition,
      };
  const directionsRevealPresence: PresenceMotion = shouldReduceMotion
    ? fadePresence
    : {
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 3 },
        initial: { opacity: 0, y: 4 },
        transition: directionsRevealTransition,
      };
  const panelSlideVariants = shouldReduceMotion
    ? {
        center: { opacity: 1 },
        enter: { opacity: 0 },
        exit: { opacity: 0 },
      }
    : {
        center: { opacity: 1, x: 0 },
        enter: (direction: number) => ({
          opacity: 1,
          x: direction > 0 ? '100%' : '-100%',
        }),
        exit: (direction: number) => ({
          opacity: 0,
          x: direction > 0 ? '-100%' : '100%',
        }),
      };
  const routeContentVariants = shouldReduceMotion
    ? {
        animate: { opacity: 1 },
        initial: { opacity: 0 },
      }
    : {
        animate: {
          opacity: 1,
          transition: {
            delayChildren: 0.04,
            staggerChildren: 0.026,
          },
          y: 0,
        },
        initial: { opacity: 0, y: 4 },
      };
  const routeStepVariants = shouldReduceMotion
    ? {
        animate: { opacity: 1 },
        initial: { opacity: 0 },
      }
    : {
        animate: {
          opacity: 1,
          transition: directionsRevealTransition,
          y: 0,
        },
        initial: { opacity: 0, y: 5 },
      };
  const popoverPresence: PresenceMotion = shouldReduceMotion
    ? fadePresence
    : {
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 6 },
        initial: { opacity: 0, scale: 0.98, y: 6 },
        transition: smallRiseTransition,
      };
  const tooltipPresence: PresenceMotion = shouldReduceMotion
    ? fadePresence
    : {
        animate: { opacity: 1, scale: 1, y: '-50%' },
        exit: { opacity: 0, scale: 0.96, y: '-50%' },
        initial: { opacity: 0, scale: 0.94, y: '-50%' },
        transition: tooltipTransition,
      };

  useEffect(() => {
    setIsClientReady(true);
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
      const target = event.target;

      if (!(target instanceof Element) || !target.closest('.settings-menu')) {
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
    }
  }, [isAttributionModalOpen]);

  useEffect(() => {
    const dialog = streetViewDialog.current;
    if (!dialog) {
      return;
    }

    if (streetViewPoint && !dialog.open) {
      dialog.showModal();
    }
  }, [streetViewPoint]);

  function closeAttributionDialog() {
    const dialog = attributionDialog.current;

    setIsAttributionModalOpen(false);

    if (dialog?.open) {
      dialog.close();
    }
  }

  function closeStreetViewDialogAfterExit() {
    const dialog = streetViewDialog.current;

    if (!streetViewPoint && dialog?.open) {
      dialog.close();
    }
  }

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
  const activeRouteInstruction =
    activeRoute && activeInstruction
      ? (activeRoute.instructions.find(
          (instruction) => instruction.id === activeInstruction.id,
        ) ?? null)
      : null;
  const isDirectionsMode =
    directionsState.status !== 'idle' && directionsParkingPoint !== null;
  const liveRouteProgress: LiveRouteProgress | null = useMemo(() => {
    if (liveRouteTracking.status !== 'tracking' || !activeRoute) {
      return null;
    }

    return getLiveRouteProgress({
      accuracyMeters: liveRouteTracking.accuracyMeters,
      headingDegrees: liveRouteTracking.headingDegrees,
      location: liveRouteTracking.location,
      route: activeRoute,
    });
  }, [activeRoute, liveRouteTracking]);
  const panelDirection = isDirectionsMode ? 1 : -1;

  useEffect(() => {
    if (
      selectedId === null ||
      !window.matchMedia('(max-width: 820px)').matches
    ) {
      return;
    }

    const selectedListItem = parkingListItemRefs.current.get(selectedId);

    if (!selectedListItem) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    selectedListItem.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [selectedId, closestPoints]);

  useEffect(() => {
    if (isDirectionsMode) {
      setMobileSheetState('expanded');
      animateMobileSheetTo('expanded');
    }
  }, [isDirectionsMode]);

  useEffect(() => {
    if (liveRouteTracking.status === 'idle') {
      return;
    }

    if (!activeRoute) {
      stopLiveRouteTracking();
    }
  }, [activeRoute, liveRouteTracking.status]);

  useEffect(() => {
    return () => {
      if (liveRouteWatchId.current !== null) {
        clearWatch(liveRouteWatchId.current);
        liveRouteWatchId.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const activeInstructionId = liveRouteProgress?.activeInstructionId;

    if (!activeInstructionId) {
      return;
    }

    setRouteInstructionFocusRequest(null);
    setActiveInstruction((current) =>
      current?.id === activeInstructionId
        ? current
        : {
            id: activeInstructionId,
            requestId: (current?.requestId ?? 0) + 1,
          },
    );
  }, [liveRouteProgress?.activeInstructionId]);

  function toggleMobileSheet() {
    const nextState =
      mobileSheetState === 'expanded' ? 'collapsed' : 'expanded';
    setMobileSheetState(nextState);
    animateMobileSheetTo(nextState);
  }

  function animateMobileSheetTo(nextState: MobileSheetState) {
    const targetProgress = nextState === 'expanded' ? 1 : 0;

    mobileSheetProgressValue.stop();
    if (shouldReduceMotion) {
      mobileSheetProgressValue.set(targetProgress);
      return;
    }

    animate(mobileSheetProgressValue, targetProgress, {
      duration: 0.26,
      ease: [0.22, 1, 0.36, 1],
    });
  }

  function snapMobileSheetFromDrag(
    drag: NonNullable<typeof mobileSheetDrag.current>,
    releaseTimestamp: number,
  ) {
    const deltaY = drag.currentY - drag.startY;
    if (Math.abs(deltaY) < mobileSheetDragIntentThresholdPx) {
      setIsMobileSheetDragging(false);
      animateMobileSheetTo(drag.startProgress === 1 ? 'expanded' : 'collapsed');
      return;
    }

    const finalProgress = Math.max(
      0,
      Math.min(1, drag.startProgress - deltaY / drag.rangePx),
    );
    const releaseVelocityY =
      releaseTimestamp - drag.lastTimestamp <= 80 ? drag.velocityY : 0;
    const nextState =
      Math.abs(releaseVelocityY) >= mobileSheetFlickVelocityPxPerMs
        ? releaseVelocityY < 0
          ? 'expanded'
          : 'collapsed'
        : finalProgress >= 0.5
          ? 'expanded'
          : 'collapsed';

    ignoreNextSheetGripClick.current = true;
    setMobileSheetState(nextState);
    setIsMobileSheetDragging(false);
    animateMobileSheetTo(nextState);
  }

  function handleSheetGripPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const rootFontSize = Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const collapsedHeight =
      (Number.isFinite(rootFontSize) ? rootFontSize : 16) *
      mobileSheetCollapsedHeightRem;
    const rangePx = Math.max(
      viewportHeight * mobileSheetExpandedViewportRatio - collapsedHeight,
      1,
    );
    const startProgress = mobileSheetState === 'expanded' ? 1 : 0;

    mobileSheetDrag.current = {
      currentY: event.clientY,
      lastTimestamp: event.timeStamp,
      lastY: event.clientY,
      pointerId: event.pointerId,
      rangePx,
      startProgress,
      startY: event.clientY,
      velocityY: 0,
    };
    mobileSheetProgressValue.stop();
    mobileSheetProgressValue.set(startProgress);
    setIsMobileSheetDragging(true);
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
    const elapsedMs = event.timeStamp - drag.lastTimestamp;
    if (elapsedMs > 0) {
      drag.velocityY = (event.clientY - drag.lastY) / elapsedMs;
    }
    drag.lastTimestamp = event.timeStamp;
    drag.lastY = event.clientY;

    const dragProgress = Math.max(
      0,
      Math.min(
        1,
        drag.startProgress - (event.clientY - drag.startY) / drag.rangePx,
      ),
    );
    mobileSheetProgressValue.set(dragProgress);
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

    snapMobileSheetFromDrag(drag, event.timeStamp);
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
    setIsMobileSheetDragging(false);
    animateMobileSheetTo(mobileSheetState);
  }

  const controlPaneStyle = {
    '--mobile-sheet-body-offset': mobileSheetBodyOffset,
    '--mobile-sheet-body-opacity': mobileSheetBodyOpacity,
    '--mobile-sheet-drag-progress': mobileSheetProgressValue,
    '--mobile-sheet-summary-offset': mobileSheetSummaryOffset,
    '--mobile-sheet-summary-opacity': mobileSheetSummaryOpacity,
  } as MotionStyle;

  function clearLiveRouteWatch() {
    if (liveRouteWatchId.current === null) {
      return;
    }

    clearWatch(liveRouteWatchId.current);
    liveRouteWatchId.current = null;
  }

  function stopLiveRouteTracking() {
    clearLiveRouteWatch();
    previousLiveRouteMarkerPosition.current = null;
    setLiveRouteTracking({ status: 'idle' });
  }

  function startLiveRouteTracking() {
    if (!activeRoute) {
      return;
    }

    if (!canUseGeolocation()) {
      setLiveRouteTracking({ status: 'unavailable' });
      return;
    }

    clearLiveRouteWatch();
    previousLiveRouteMarkerPosition.current = null;
    setLiveRouteTracking({ status: 'starting' });

    liveRouteWatchId.current = watchPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (!isResolvedLocation(location)) {
          clearLiveRouteWatch();
          previousLiveRouteMarkerPosition.current = null;
          setLiveRouteTracking({ status: 'unavailable' });
          return;
        }

        if (isFarFromNearestParking(parkingPoints, location)) {
          clearLiveRouteWatch();
          previousLiveRouteMarkerPosition.current = null;
          setLiveRouteTracking({ status: 'too-far' });
          return;
        }

        const accuracyMeters = Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null;
        const browserHeadingDegrees = Number.isFinite(position.coords.heading)
          ? position.coords.heading
          : null;
        const progressForMarkerPosition = getLiveRouteProgress({
          accuracyMeters,
          headingDegrees: browserHeadingDegrees,
          location,
          route: activeRoute,
        });
        const markerPosition =
          progressForMarkerPosition?.markerPosition ??
          ([location.latitude, location.longitude] satisfies CycleRoutePoint);
        const previousMarkerPosition = previousLiveRouteMarkerPosition.current;
        const inferredHeadingDegrees =
          browserHeadingDegrees === null &&
          previousMarkerPosition &&
          distanceMeters(
            {
              latitude: previousMarkerPosition[0],
              longitude: previousMarkerPosition[1],
            },
            { latitude: markerPosition[0], longitude: markerPosition[1] },
          ) >= LIVE_ROUTE_MIN_HEADING_DISTANCE_METERS
            ? getBearingDegrees(previousMarkerPosition, markerPosition)
            : null;

        previousLiveRouteMarkerPosition.current = markerPosition;
        setLiveRouteTracking({
          status: 'tracking',
          accuracyMeters,
          headingDegrees: browserHeadingDegrees ?? inferredHeadingDegrees,
          location,
          updatedAt: position.timestamp,
        });
      },
      (error) => {
        clearLiveRouteWatch();
        previousLiveRouteMarkerPosition.current = null;
        setLiveRouteTracking({
          status:
            error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 12_000,
      },
    );
  }

  function toggleLiveRouteTracking() {
    if (liveRouteTracking.status === 'tracking') {
      stopLiveRouteTracking();
      return;
    }

    startLiveRouteTracking();
  }

  function clearDirections() {
    directionsRequestId.current += 1;
    stopLiveRouteTracking();
    setDirectionsState({ status: 'idle' });
    setActiveInstruction(null);
    setRouteInstructionFocusRequest(null);
  }

  function selectRouteInstruction(id: string) {
    setActiveInstruction((current) => ({
      id,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setRouteInstructionFocusRequest((current) => ({
      id,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }

  function requestCurrentLocationFocus() {
    setCurrentLocationFocusRequestId((requestId) => requestId + 1);
  }

  function applyFallbackLocation(
    status: Extract<
      LocationState['status'],
      'denied' | 'too-far' | 'unavailable'
    >,
  ) {
    setLocationState({
      status,
      location: EDINBURGH_FALLBACK_LOCATION,
    });
    requestCurrentLocationFocus();
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
      applyFallbackLocation('too-far');
      return false;
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

    return true;
  }

  function requestLocation(selectedParkingId?: string) {
    setSelectedId(selectedParkingId ?? null);
    clearDirections();

    if (!canUseGeolocation()) {
      applyFallbackLocation('unavailable');
      return;
    }

    setLocationState((current) => ({
      status: 'locating',
      location: current.location,
    }));

    getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (!isResolvedLocation(location)) {
          applyFallbackLocation('unavailable');
          return;
        }

        const didApplyLocation = applyReferenceLocation(
          location,
          'located',
          undefined,
          selectedParkingId,
        );

        if (didApplyLocation) {
          captureAnalyticsEvent('location_granted');
          requestCurrentLocationFocus();
        } else {
          captureAnalyticsEvent('location_denied', { reason: 'too_far' });
        }
      },
      (error) => {
        const status =
          error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable';
        captureAnalyticsEvent('location_denied', { reason: status });
        applyFallbackLocation(status);
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
      captureAnalyticsEvent('place_searched', {
        result_count: results.length,
      });
      setPlaceResults(results);
      setPlaceSearchMessage(
        results.length === 0 ? 'No matching Edinburgh places found.' : null,
      );
      setHasUsedPlaceSearch(true);
    } catch {
      captureAnalyticsEvent('place_searched', { error: true });
      setPlaceResults([]);
      setPlaceSearchMessage('Place search is unavailable right now.');
    } finally {
      placeSearchInFlight.current = false;
      setIsPlaceSearching(false);
    }
  }

  function selectPlace(result: PlaceSearchResult) {
    captureAnalyticsEvent('place_selected', { place_name: result.name });
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
    captureAnalyticsEvent('parking_selected', { parking_id: id });
    setSelectedId(id);
    clearDirections();
  }

  function clearSelectedParkingPoint() {
    setSelectedId(null);
  }

  async function requestDirectionsToPoint(point: ParkingPoint) {
    if (!isClientReady) {
      return;
    }

    stopLiveRouteTracking();
    captureAnalyticsEvent('directions_requested', {
      parking_id: point.id,
      parking_name: point.name,
    });
    setSelectedId(point.id);
    setActiveInstruction(null);
    setRouteInstructionFocusRequest(null);

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
        point,
      );

      if (directionsRequestId.current !== requestId) {
        return;
      }

      directionsCache.current.set(cacheKey, route);
      captureAnalyticsEvent('directions_loaded', {
        parking_id: point.id,
        parking_name: point.name,
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
      captureAnalyticsEvent('directions_error', {
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
      captureAnalyticsEvent('parking_link_copied', {
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
    captureAnalyticsEvent('theme_changed', { theme: mode });
    setThemeMode(mode);
    setIsSettingsMenuOpen(false);
  }

  function installPwa() {
    captureAnalyticsEvent('pwa_install_triggered');
    setIsSettingsMenuOpen(false);
    void installApp();
  }

  function openAttributionsFromSettings() {
    setIsSettingsMenuOpen(false);
    setIsAttributionModalOpen(true);
  }

  function renderThemeSettings(
    className = '',
    triggerVariant: 'brand' | 'settings' = 'settings',
  ) {
    const isBrandTrigger = triggerVariant === 'brand';

    return (
      <div className={['settings-menu', className].filter(Boolean).join(' ')}>
        <motion.button
          aria-expanded={isSettingsMenuOpen}
          aria-label={isBrandTrigger ? 'Bike Neuks menu' : 'Theme settings'}
          className={[
            'settings-trigger',
            isBrandTrigger ? 'settings-trigger--brand' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          type="button"
          whileTap={subtleTap}
          onClick={() => setIsSettingsMenuOpen((isOpen) => !isOpen)}
        >
          {isBrandTrigger ? (
            <img src="favicon.svg" alt="" aria-hidden="true" />
          ) : (
            <Settings size={18} aria-hidden="true" />
          )}
        </motion.button>
        <AnimatePresence initial={false}>
          {isSettingsMenuOpen ? (
            <motion.div
              {...popoverPresence}
              className="settings-popover"
              role="menu"
              aria-label={isBrandTrigger ? 'Bike Neuks menu' : 'Settings'}
            >
              <span className="settings-label">Theme</span>
              <div className="theme-options" role="group" aria-label="Theme">
                {themeOptions.map(({ icon: Icon, label, mode }) => (
                  <motion.button
                    aria-pressed={themeMode === mode}
                    className={themeMode === mode ? 'selected' : undefined}
                    key={mode}
                    type="button"
                    whileTap={subtleTap}
                    onClick={() => chooseThemeMode(mode)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </motion.button>
                ))}
              </div>
              {canInstall ? (
                <Fragment key="install-app-action">
                  <span className="settings-label">App</span>
                  <motion.button
                    className="settings-action-button"
                    type="button"
                    whileTap={subtleTap}
                    onClick={installPwa}
                  >
                    <Download size={15} aria-hidden="true" />
                    Install app
                  </motion.button>
                </Fragment>
              ) : null}
              <span className="settings-label">About</span>
              <motion.button
                className="settings-action-button"
                type="button"
                whileTap={subtleTap}
                onClick={openAttributionsFromSettings}
              >
                <CircleHelp size={15} aria-hidden="true" />
                Attributions
              </motion.button>
              {isBrandTrigger ? (
                <p className="settings-credit">
                  Built by <a href="https://tau.gr">taugr</a>
                </p>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  function renderPlaceSearchPanel(surface: 'desktop' | 'mobile') {
    return (
      <section
        className={`reference-panel reference-panel--${surface}`}
        aria-label="Search from"
      >
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
              id={`place-search-${surface}`}
              name="place-search"
              type="search"
              value={placeQuery}
              placeholder="Place or postcode"
              onChange={(event) => setPlaceQuery(event.target.value)}
            />
          </label>
          <motion.button
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
              captureAnalyticsEvent('location_requested');
              requestLocation();
            }}
            disabled={locationState.status === 'locating'}
            whileTap={
              locationState.status === 'locating' ? undefined : subtleTap
            }
          >
            {locationState.status === 'locating' ? (
              <Crosshair size={18} aria-hidden="true" />
            ) : (
              <LocateFixed size={18} aria-hidden="true" />
            )}
            <span className="sr-only">
              {locationState.status === 'locating' ? 'Locating' : 'Near me'}
            </span>
          </motion.button>
          <motion.button
            className={[
              'place-search-button',
              surface === 'mobile' ? 'place-search-button--mobile' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="submit"
            disabled={isPlaceSearching || placeQuery.trim().length === 0}
            whileTap={
              isPlaceSearching || placeQuery.trim().length === 0
                ? undefined
                : subtleTap
            }
          >
            <Search size={18} aria-hidden="true" />
            <span className="mobile-action-label">
              {isPlaceSearching ? 'Searching' : 'Search'}
            </span>
          </motion.button>
        </form>

        <AnimatePresence initial={false}>
          {placeResults.length > 0 ? (
            <motion.ol
              {...risePresence}
              layout
              className="place-results"
              aria-label="Place search results"
            >
              {placeResults.map((result) => (
                <motion.li
                  layout
                  key={result.id}
                  transition={rowLayoutTransition}
                >
                  <motion.button
                    type="button"
                    whileTap={subtleTap}
                    onClick={() => selectPlace(result)}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{result.name}</span>
                  </motion.button>
                </motion.li>
              ))}
            </motion.ol>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {placeSearchMessage ? (
            <motion.div
              {...risePresence}
              key={placeSearchMessage}
              className="place-search-message"
              role="status"
            >
              {placeSearchMessage}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
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
      </footer>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="app-shell" data-theme={resolvedTheme}>
        <section className="map-pane" aria-label="Cycle parking map">
          <CycleParkingMap
            points={nearbyPoints}
            userLocation={locationState.location}
            currentLocationFocusRequestId={currentLocationFocusRequestId}
            selectedPoint={explicitSelectedPoint}
            nearestPoint={nearestPoint}
            rankedPoints={nearbyPoints}
            route={activeRoute}
            routeInstructionFocusRequest={routeInstructionFocusRequest}
            liveRouteMarker={
              liveRouteTracking.status === 'tracking' && liveRouteProgress
                ? {
                    isOffRoute: liveRouteProgress.isOffRoute,
                    headingDegrees: liveRouteProgress.headingDegrees,
                    position: liveRouteProgress.markerPosition,
                    updatedAt: liveRouteTracking.updatedAt,
                  }
                : null
            }
            shouldFollowLiveRoute={liveRouteTracking.status === 'tracking'}
            isDirectionsMode={isDirectionsMode}
            mobileSheetState={mobileSheetState}
            copiedShareButton={copiedShareButton}
            theme={resolvedTheme}
            canRequestDirections={isClientReady}
            canShowStreetView={googleStreetViewApiKey.length > 0}
            onClearSelection={clearSelectedParkingPoint}
            onSelectPoint={selectParkingPoint}
            onRequestDirections={(point) => {
              void requestDirectionsToPoint(point);
            }}
            onOpenStreetView={(point) => {
              setStreetViewPoint(point);
              captureAnalyticsEvent('street_view_opened', {
                parking_id: point.id,
                parking_name: point.name,
              });
            }}
            onCopyParkingLink={(point) => {
              void copyParkingLinkForPoint(point, 'popup');
            }}
          />
        </section>

        {!isDirectionsMode ? (
          <section
            className="mobile-map-toolbar"
            aria-label="Find nearby cycle parking"
          >
            <header className="app-header app-header--mobile">
              {renderThemeSettings('settings-menu--mobile', 'brand')}
              <h1 className="sr-only">Bike Neuks</h1>
              {renderPlaceSearchPanel('mobile')}
            </header>
          </section>
        ) : null}

        <motion.aside
          className="control-pane"
          aria-label="Nearest cycle parking"
          data-mobile-sheet-dragging={
            isMobileSheetDragging ? 'true' : undefined
          }
          data-mobile-sheet-state={mobileSheetState}
          initial={false}
          style={controlPaneStyle}
        >
          <motion.button
            aria-expanded={mobileSheetState === 'expanded'}
            aria-label={
              mobileSheetState === 'expanded'
                ? `Collapse ${isDirectionsMode ? 'directions' : 'results'} panel`
                : `Expand ${isDirectionsMode ? 'directions' : 'results'} panel`
            }
            className="mobile-sheet-grip"
            type="button"
            onClick={handleSheetGripClick}
            onPointerCancel={handleSheetGripPointerCancel}
            onPointerDown={handleSheetGripPointerDown}
            onPointerMove={handleSheetGripPointerMove}
            onPointerUp={handleSheetGripPointerEnd}
            whileTap={subtleTap}
          >
            <span aria-hidden="true" />
          </motion.button>
          <LayoutGroup>
            <AnimatePresence
              custom={panelDirection}
              initial={false}
              mode="popLayout"
            >
              {isDirectionsMode ? (
                <motion.section
                  animate="center"
                  custom={panelDirection}
                  exit="exit"
                  initial="enter"
                  key="directions"
                  className="directions-mode panel-view"
                  aria-label="Cycle directions"
                  transition={panelSlideTransition}
                  variants={panelSlideVariants}
                >
                  <motion.div
                    layout
                    className="directions-mode-header"
                    transition={rowLayoutTransition}
                  >
                    <motion.div
                      layout
                      className="directions-header-main"
                      transition={rowLayoutTransition}
                    >
                      <motion.div
                        layout
                        className="directions-title"
                        transition={rowLayoutTransition}
                      >
                        <motion.div
                          layout
                          className="brand-mark directions-mark"
                          aria-hidden="true"
                          transition={rowLayoutTransition}
                        >
                          <Route size={24} />
                        </motion.div>
                        <motion.div layout transition={rowLayoutTransition}>
                          <h1>
                            {directionsParkingPoint?.name ?? 'Directions'}
                          </h1>
                          <AnimatePresence initial={false} mode="wait">
                            {directionsParkingPoint ? (
                              <motion.div
                                {...risePresence}
                                key="directions-parking-details"
                              >
                                <ParkingDetailStrip
                                  className="directions-parking-details"
                                  point={directionsParkingPoint}
                                />
                              </motion.div>
                            ) : (
                              <motion.p {...risePresence} key="directions-copy">
                                Cycle route
                              </motion.p>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </motion.div>
                      <motion.div
                        layout
                        className="directions-header-actions"
                        transition={rowLayoutTransition}
                      >
                        {directionsState.status === 'loaded' ? (
                          <motion.button
                            className="directions-route-start-button"
                            disabled={liveRouteTracking.status === 'starting'}
                            type="button"
                            whileTap={subtleTap}
                            onClick={toggleLiveRouteTracking}
                          >
                            <Bike size={16} aria-hidden="true" />
                            {liveRouteTracking.status === 'tracking'
                              ? liveRouteProgress?.hasArrived
                                ? 'Done'
                                : 'Stop'
                              : liveRouteTracking.status === 'starting'
                                ? 'Starting...'
                                : 'Start route'}
                          </motion.button>
                        ) : null}
                        <motion.button
                          className="directions-exit-button"
                          type="button"
                          whileTap={subtleTap}
                          onClick={clearDirections}
                        >
                          <X size={16} aria-hidden="true" />
                          Exit directions
                        </motion.button>
                      </motion.div>
                    </motion.div>
                    {liveRouteProgress?.hasArrived ? (
                      <motion.p
                        {...directionsRevealPresence}
                        className="directions-live-status directions-live-status-arrived"
                        role="status"
                      >
                        Arrived at bike parking.
                      </motion.p>
                    ) : null}
                    {liveRouteTracking.status === 'denied' ||
                    liveRouteTracking.status === 'too-far' ||
                    liveRouteTracking.status === 'unavailable' ? (
                      <motion.p
                        {...directionsRevealPresence}
                        className="directions-live-status"
                        role="status"
                      >
                        {liveRouteTracking.status === 'denied'
                          ? 'Enable location permissions to start route.'
                          : liveRouteTracking.status === 'too-far'
                            ? 'Start route is only available near Edinburgh.'
                            : 'Live location is unavailable.'}
                      </motion.p>
                    ) : null}
                    {liveRouteTracking.status === 'tracking' &&
                    !liveRouteProgress?.hasArrived &&
                    activeRouteInstruction ? (
                      <motion.div
                        {...directionsRevealPresence}
                        className="directions-current-step"
                      >
                        <span
                          className="directions-step-icon directions-current-step-icon"
                          aria-hidden="true"
                        >
                          {(() => {
                            const CurrentStepIcon = getRouteInstructionIcon(
                              activeRouteInstruction,
                            );
                            return <CurrentStepIcon size={20} />;
                          })()}
                        </span>
                        <span className="directions-current-step-text">
                          {describeCycleRouteInstruction(
                            activeRouteInstruction,
                          )}
                        </span>
                        <small className="directions-step-distance directions-current-step-distance">
                          {formatDistance(
                            activeRouteInstruction.distanceMeters,
                          )}
                        </small>
                      </motion.div>
                    ) : null}
                    <AnimatePresence initial={false}>
                      {directionsState.status === 'loaded' ? (
                        <motion.div
                          {...directionsRevealPresence}
                          key="directions-summary"
                          className="directions-summary"
                        >
                          <div
                            className="directions-metrics"
                            aria-label="Route summary"
                          >
                            <span>
                              <Navigation size={16} aria-hidden="true" />
                              {formatDistance(
                                directionsState.route.distanceMeters,
                              )}
                            </span>
                            <span>
                              <Bike size={16} aria-hidden="true" />
                              {formatCycleRouteDuration(
                                directionsState.route.durationSeconds,
                              )}
                            </span>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>

                  <div className="directions-scroll">
                    <AnimatePresence initial={false} mode="wait">
                      {directionsState.status === 'loading' ? (
                        <motion.p
                          {...risePresence}
                          key="directions-loading"
                          className="directions-message"
                        >
                          Finding a cycle route...
                        </motion.p>
                      ) : null}

                      {directionsState.status === 'missing-key' ? (
                        <motion.p
                          {...risePresence}
                          key="directions-missing-key"
                          className="directions-message"
                        >
                          Directions need a CycleStreets API key.
                        </motion.p>
                      ) : null}

                      {directionsState.status === 'error' ? (
                        <motion.p
                          {...risePresence}
                          key="directions-error"
                          className="directions-message"
                        >
                          {directionsState.message}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>

                    {directionsState.status === 'loaded' ? (
                      <motion.div
                        animate="animate"
                        initial="initial"
                        key="directions-loaded"
                        className="directions-route-content"
                        variants={routeContentVariants}
                      >
                        {directionsState.route.instructions.length > 0 ? (
                          <motion.ol
                            layout="position"
                            className="directions-list"
                            data-testid="directions-list"
                            transition={rowLayoutTransition}
                          >
                            {directionsState.route.instructions.map(
                              (instruction) => {
                                const StepIcon =
                                  getRouteInstructionIcon(instruction);
                                const isActiveInstruction =
                                  activeInstruction?.id === instruction.id;
                                const isLiveActiveInstruction =
                                  liveRouteTracking.status === 'tracking' &&
                                  isActiveInstruction;
                                return (
                                  <motion.li
                                    layout="position"
                                    key={instruction.id}
                                    className={[
                                      'directions-list-item',
                                      isActiveInstruction
                                        ? 'directions-list-item-active'
                                        : '',
                                      isLiveActiveInstruction
                                        ? 'directions-list-item-live-active'
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    onClick={() =>
                                      selectRouteInstruction(instruction.id)
                                    }
                                    data-testid={`directions-step-${instruction.id}`}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === 'Enter' ||
                                        event.key === ' '
                                      ) {
                                        event.preventDefault();
                                        selectRouteInstruction(instruction.id);
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    transition={rowLayoutTransition}
                                    variants={routeStepVariants}
                                  >
                                    <span
                                      className="directions-step-icon"
                                      aria-hidden="true"
                                    >
                                      <StepIcon size={18} />
                                    </span>
                                    <span className="directions-step-text">
                                      {describeCycleRouteInstruction(
                                        instruction,
                                      )}
                                    </span>
                                    <small className="directions-step-distance">
                                      {formatDistance(
                                        instruction.distanceMeters,
                                      )}
                                    </small>
                                  </motion.li>
                                );
                              },
                            )}
                          </motion.ol>
                        ) : null}
                        {directionsState.route.source === 'cyclestreets' ? (
                          <motion.p
                            {...risePresence}
                            key="directions-attribution"
                            className="directions-attribution"
                          >
                            <Bike
                              key="directions-attribution-icon"
                              size={18}
                              aria-hidden="true"
                            />
                            <span key="directions-attribution-label">
                              Route by
                            </span>
                            <a
                              key="directions-attribution-link"
                              href={
                                directionsState.route.routeUrl ??
                                'https://www.cyclestreets.net/'
                              }
                            >
                              CycleStreets
                              <ExternalLink size={16} aria-hidden="true" />
                            </a>
                          </motion.p>
                        ) : null}
                      </motion.div>
                    ) : null}
                  </div>
                  {renderAttributionFooter('directions-footer')}
                </motion.section>
              ) : (
                <motion.div
                  animate="center"
                  custom={panelDirection}
                  exit="exit"
                  initial="enter"
                  key="finder"
                  className="finder-panel-content panel-view"
                  transition={panelSlideTransition}
                  variants={panelSlideVariants}
                >
                  <header
                    className="app-header app-header--desktop"
                    key="finder-header"
                  >
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
                    {renderThemeSettings('settings-menu--desktop')}
                  </header>

                  <div className="mobile-sheet-summary" aria-hidden="true">
                    <span>
                      <strong>Nearby bike neuks</strong>
                      <small>{closestPoints.length} closest</small>
                    </span>
                    <span className="mobile-sheet-summary-location">
                      {nearestPoint?.name}
                    </span>
                  </div>

                  <div className="mobile-sheet-body">
                    {renderPlaceSearchPanel('desktop')}

                    <div className="list-heading">
                      <h2>
                        Nearby bike neuks{' '}
                        <span>· {closestPoints.length} closest</span>
                      </h2>
                    </div>

                    <AnimatePresence initial={false}>
                      {shareError ? (
                        <motion.div
                          {...risePresence}
                          key={shareError}
                          className="parking-share-message"
                          role="status"
                        >
                          {shareError}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <div className="parking-list-scroll">
                      <AnimatePresence initial={false}>
                        {locationState.status === 'too-far' ? (
                          <motion.div
                            {...risePresence}
                            key="too-far"
                            className="parking-list-context"
                            role="status"
                          >
                            You're too far from Edinburgh, showing bike parking
                            in central Edinburgh.
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <motion.ol
                        layout="position"
                        className="parking-list"
                        data-testid="parking-list"
                        aria-label="Nearby bike neuks"
                      >
                        {closestPoints.map((point, index) => {
                          return (
                            <motion.li
                              layout="position"
                              className="parking-list-item"
                              key={point.id}
                              transition={rowLayoutTransition}
                              ref={(item) => {
                                if (item) {
                                  parkingListItemRefs.current.set(
                                    point.id,
                                    item,
                                  );
                                } else {
                                  parkingListItemRefs.current.delete(point.id);
                                }
                              }}
                            >
                              <motion.button
                                className={[
                                  'parking-row',
                                  index === 0 && !explicitSelectedPoint
                                    ? 'closest'
                                    : null,
                                  point.id === explicitSelectedPoint?.id
                                    ? 'selected'
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                type="button"
                                data-testid={`parking-row-${point.id}`}
                                whileTap={subtleTap}
                                onClick={() => selectParkingPoint(point.id)}
                              >
                                <span className={`rank rank-${index + 1}`}>
                                  {index + 1}
                                </span>
                                <span className="parking-row-copy">
                                  <strong>{point.name}</strong>
                                  <ParkingDetailStrip
                                    includeDistance
                                    point={point}
                                  />
                                </span>
                              </motion.button>
                              <motion.button
                                aria-label={`Show cycle directions to ${point.name}`}
                                className="parking-directions-button"
                                data-testid={`parking-directions-${point.id}`}
                                disabled={!isClientReady}
                                type="button"
                                whileTap={subtleTap}
                                onClick={(event) => {
                                  void requestDirections(event, point);
                                }}
                              >
                                <Navigation size={17} aria-hidden="true" />
                                <span className="parking-action-label">
                                  Directions
                                </span>
                              </motion.button>
                              <motion.button
                                aria-label={`Copy link to ${point.name}`}
                                className="parking-share-button"
                                type="button"
                                whileTap={subtleTap}
                                onClick={(event) => {
                                  void copyParkingLink(event, point);
                                }}
                              >
                                <Share2 size={17} aria-hidden="true" />
                                <AnimatePresence initial={false}>
                                  {copiedShareButton?.source === 'list' &&
                                  copiedShareButton.parkingId === point.id ? (
                                    <motion.span
                                      {...tooltipPresence}
                                      key="copied"
                                      className="parking-share-tooltip"
                                      role="status"
                                    >
                                      Copied
                                    </motion.span>
                                  ) : null}
                                </AnimatePresence>
                              </motion.button>
                            </motion.li>
                          );
                        })}
                      </motion.ol>
                    </div>

                    {renderAttributionFooter()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </LayoutGroup>
        </motion.aside>
        <dialog
          ref={attributionDialog}
          className="attribution-modal"
          aria-labelledby="attribution-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAttributionDialog();
            }
          }}
          onClose={() => setIsAttributionModalOpen(false)}
        >
          <AnimatePresence initial={false}>
            {isAttributionModalOpen ? (
              <motion.div
                {...popoverPresence}
                key="attribution-modal-content"
                className="attribution-modal-content"
              >
                <div className="attribution-modal-header">
                  <h2 id="attribution-modal-title">Attributions</h2>
                </div>
                <div className="attribution-details">
                  <span>{cycleParkingDataset.metadata.attribution}</span>
                  <a href={cycleParkingDataset.metadata.licenceUrl}>
                    Open Government Licence v3.0
                  </a>
                  <span>
                    Map interface by{' '}
                    <a href="https://maplibre.org/">MapLibre GL JS</a>.
                  </span>
                  {hasUsedPlaceSearch ? (
                    <span>
                      Place search by{' '}
                      <a href="https://nominatim.openstreetmap.org/">
                        Nominatim
                      </a>{' '}
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
                  <motion.button
                    className="attribution-modal-close"
                    type="button"
                    whileTap={subtleTap}
                    onClick={closeAttributionDialog}
                  >
                    Close
                  </motion.button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </dialog>
        <dialog
          ref={streetViewDialog}
          className="street-view-modal"
          aria-labelledby="street-view-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setStreetViewPoint(null);
            }
          }}
          onClose={() => setStreetViewPoint(null)}
        >
          <AnimatePresence
            initial={false}
            onExitComplete={closeStreetViewDialogAfterExit}
          >
            {streetViewPoint ? (
              <motion.div
                {...popoverPresence}
                key="street-view-modal-content"
                className="street-view-modal-content"
              >
                <div className="street-view-modal-header">
                  <h2 id="street-view-modal-title">{streetViewPoint.name}</h2>
                  <motion.button
                    aria-label="Close Street View"
                    className="street-view-modal-close"
                    type="button"
                    whileTap={subtleTap}
                    onClick={() => setStreetViewPoint(null)}
                  >
                    <X size={18} aria-hidden="true" />
                  </motion.button>
                </div>
                <iframe
                  allowFullScreen
                  className="street-view-frame"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={buildGoogleStreetViewEmbedUrl(
                    streetViewPoint,
                    googleStreetViewApiKey,
                  )}
                  title={`Street View for ${streetViewPoint.name}`}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </dialog>
      </main>
    </MotionConfig>
  );
}

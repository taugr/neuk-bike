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
  Bookmark,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleParking,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Download,
  EllipsisVertical,
  ExternalLink,
  LocateFixed,
  MapPin,
  Maximize2,
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
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
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
import type {
  ParkingDataManifest,
  ParkingPoint,
  UserLocation,
} from '@/lib/types';
import {
  EDINBURGH_FALLBACK_LOCATION,
  formatDistance,
  distanceMeters,
  isResolvedLocation,
  sortByDistance,
} from '@/lib/geo';
import {
  getParkingEssentialDetails,
  getParkingPopupDetails,
  type ParkingPopupIcon,
} from '@/lib/parking';
import { formatParkingDisplayName } from '@/lib/parking-names';
import {
  getBearingDegrees,
  getLiveRouteProgress,
  LIVE_ROUTE_MIN_HEADING_DISTANCE_METERS,
  type LiveRouteProgress,
} from '@/lib/route-progress';
import { getRouteInstructionManeuver } from '@/lib/route-instructions';
import { buildParkingShareUrl, parseShareLinkState } from '@/lib/share-links';
import {
  buildGoogleMapsLocationUrl,
  buildGoogleStreetViewEmbedUrl,
} from '@/lib/street-view';
import { usePwaInstallPrompt } from '@/components/pwa-install-prompt';
import { useLanguage } from '@/components/language-provider';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  getParkingDataBaseUrl,
  isLocationInParkingCoverage,
  ParkingDataClient,
} from '@/lib/parking-data';
import type { ParkingMapBounds } from '@/lib/map-pins';
import type { ParkingView } from '@/lib/map-pins';
import {
  initialParkingPanelState,
  reduceParkingPanel,
} from '@/lib/parking-panel';
import {
  addSavedNeuk,
  isNeukSaved,
  readSavedNeuks,
  removeSavedNeuk,
  subscribeToSavedNeuks,
  writeSavedNeuks,
  type SavedNeukRecord,
} from '@/lib/saved-neuks';
import {
  localeDetails,
  supportedLocales,
  type AppLocale,
} from '@/lib/i18n/locales';
import { translate, type MessageKey } from '@/lib/i18n/messages';

const CycleParkingMap = dynamic(
  () => import('@/components/cycle-parking-map'),
  {
    ssr: false,
    loading: () => <LocalizedMapLoading />,
  },
);

function LocalizedMapLoading() {
  const { t } = useLanguage();
  return <div className="map-loading">{t('loadingMap')}</div>;
}

const maxPlaceSearchCacheEntries = 12;
const placeSearchDebounceMs = 300;
const placeSearchMinimumCharacters = 3;
const closestParkingResultCount = 8;
const copiedMessageDurationMs = 1_800;
const themeStorageKey = 'cycle-parking-theme';
const mobileSheetCollapsedHeightRem = 5.4;
const mobileSheetDragIntentThresholdPx = 6;
const mobileSheetExpandedViewportRatio = 0.52;
const mobileDetailsSheetExpandedViewportRatio = 0.68;
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
const parkingViewSlideTransition: Transition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};
const panelReplaceTransition: Transition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
};
const rowLayoutTransition: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 42,
  mass: 0.8,
};
const buttonTap = { scale: 0.96 };

type PanelMotionContext = {
  direction: number;
  kind: 'navigate' | 'replace';
};

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

function ParkingDetailStrip({
  className,
  includeDistance,
  point,
  showAllDetails,
}: {
  className?: string;
  includeDistance?: boolean;
  point: ParkingPoint;
  showAllDetails?: boolean;
}) {
  const { locale, t } = useLanguage();
  const parkingDetails = getParkingPopupDetails(point, locale);
  const visibleDetails = showAllDetails
    ? parkingDetails.details
    : getParkingEssentialDetails(point, locale);

  if (!includeDistance && visibleDetails.length === 0) {
    return null;
  }

  return (
    <span
      aria-label={t('details')}
      className={[
        'parking-row-details',
        `parking-row-details-count-${visibleDetails.length + (includeDistance ? parkingDetails.metrics.length : 0)}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
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
        <span
          className={`parking-row-detail parking-row-detail-${detail.kind}`}
          key={detail.label}
        >
          <span className="parking-row-detail-icon">
            {detail.emphasis ?? <ParkingListDetailIcon icon={detail.icon} />}
          </span>
          <span>
            {detail.kind === 'spaces'
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

type ParkingActionSource = 'details' | 'list' | 'popup';
type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';
type MobileSheetState = 'expanded' | 'collapsed';
type ParkingDataStatus = 'loading' | 'ready' | 'error';
type SavedNeuksStatus = 'loading' | 'ready' | 'storage-error';

type ParkingMoreMenuPosition = {
  bottom?: number;
  right: number;
  top?: number;
};

type CopiedShareButton = {
  parkingId: string;
  source: ParkingActionSource;
};

const themeOptions: {
  icon: typeof Monitor;
  labelKey: MessageKey;
  mode: ThemeMode;
}[] = [
  { icon: Monitor, labelKey: 'system', mode: 'system' },
  { icon: Sun, labelKey: 'light', mode: 'light' },
  { icon: Moon, labelKey: 'dark', mode: 'dark' },
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

function prepareParkingPoints(points: ParkingPoint[], locale: AppLocale) {
  return points.map((point) => ({
    ...point,
    name: formatParkingDisplayName(point, locale),
  }));
}

function keepParkingPointsWhenUnchanged(
  current: ParkingPoint[],
  next: ParkingPoint[],
) {
  return current.length === next.length &&
    current.every((point, index) => point.id === next[index]?.id)
    ? current
    : next;
}

export default function CycleParkingFinder() {
  const { formattingLocale, locale, setLocale, t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [locationState, setLocationState] = useState<LocationState>({
    status: 'fallback',
    location: EDINBURGH_FALLBACK_LOCATION,
  });
  const [parkingPoints, setParkingPoints] = useState<ParkingPoint[]>([]);
  const [parkingManifest, setParkingManifest] =
    useState<ParkingDataManifest | null>(null);
  const [parkingDataStatus, setParkingDataStatus] =
    useState<ParkingDataStatus>('loading');
  const [parkingDataMessage, setParkingDataMessage] = useState<string | null>(
    null,
  );
  const [currentLocationFocusRequestId, setCurrentLocationFocusRequestId] =
    useState(0);
  const [parkingPanelState, dispatchParkingPanel] = useReducer(
    reduceParkingPanel,
    initialParkingPanelState,
  );
  const parkingView = parkingPanelState.listContext;
  const selectedId = parkingPanelState.selectedId;
  const [savedNeuksStatus, setSavedNeuksStatus] =
    useState<SavedNeuksStatus>('loading');
  const [savedNeuks, setSavedNeuks] = useState<SavedNeukRecord[]>([]);
  const [savedRawPoints, setSavedRawPoints] = useState<ParkingPoint[]>([]);
  const [missingSavedIds, setMissingSavedIds] = useState<string[]>([]);
  const [failedSavedIds, setFailedSavedIds] = useState<string[]>([]);
  const [isSavedPointsLoading, setIsSavedPointsLoading] = useState(false);
  const [savedPointsLoadRequestId, setSavedPointsLoadRequestId] = useState(0);
  const [savedNeuksMessage, setSavedNeuksMessage] = useState<string | null>(
    null,
  );
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [activePlaceResultIndex, setActivePlaceResultIndex] = useState(0);
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
  const [openParkingMoreMenuId, setOpenParkingMoreMenuId] = useState<
    string | null
  >(null);
  const [parkingMoreMenuPosition, setParkingMoreMenuPosition] =
    useState<ParkingMoreMenuPosition | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [isClientReady, setIsClientReady] = useState(false);
  const [mobileSheetState, setMobileSheetState] =
    useState<MobileSheetState>('expanded');
  const [isMobileSheetDragging, setIsMobileSheetDragging] = useState(false);
  const [
    mobileContentSheetExpandedHeightPx,
    setMobileContentSheetExpandedHeightPx,
  ] = useState<number | null>(null);
  const [isMobileContentSheetOverflowing, setIsMobileContentSheetOverflowing] =
    useState(false);
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
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const parkingDataClient = useRef<ParkingDataClient | null>(null);
  const directionsCache = useRef(new Map<string, CycleRoute>());
  const placeSearchAbortController = useRef<AbortController | null>(null);
  const placeSearchDebounceTimeout = useRef<number | null>(null);
  const placeSearchRequestId = useRef(0);
  const directionsRequestId = useRef(0);
  const liveRouteWatchId = useRef<number | null>(null);
  const previousLiveRouteMarkerPosition = useRef<CycleRoutePoint | null>(null);
  const copiedMessageTimeout = useRef<number | null>(null);
  const savedNeuksMessageTimeout = useRef<number | null>(null);
  const attributionDialog = useRef<HTMLDialogElement>(null);
  const streetViewDialog = useRef<HTMLDialogElement>(null);
  const controlPaneRef = useRef<HTMLElement | null>(null);
  const parkingListScroll = useRef<HTMLDivElement>(null);
  const savedHeadingRef = useRef<HTMLHeadingElement>(null);
  const parkingMoreButtonRef = useRef<HTMLButtonElement>(null);
  const parkingMoreMenuRef = useRef<HTMLDivElement>(null);
  const parkingListItemRefs = useRef(new Map<string, HTMLLIElement>());
  const savedResolutionRequestId = useRef(0);
  const parkingViewState = useRef<
    Record<ParkingView, { scrollTop: number; selectedId: string | null }>
  >({
    nearby: { scrollTop: 0, selectedId: null },
    saved: { scrollTop: 0, selectedId: null },
  });
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
  const panelMotionVariants = shouldReduceMotion
    ? {
        center: { opacity: 1, transition: quickFadeTransition },
        enter: { opacity: 0, transition: quickFadeTransition },
        exit: { opacity: 0, transition: quickFadeTransition },
      }
    : {
        center: ({ kind }: PanelMotionContext) => ({
          opacity: 1,
          scale: 1,
          transition:
            kind === 'replace' ? panelReplaceTransition : panelSlideTransition,
          x: 0,
          y: 0,
        }),
        enter: ({ direction, kind }: PanelMotionContext) => ({
          opacity: kind === 'replace' ? 0 : 1,
          scale: kind === 'replace' ? 0.99 : 1,
          transition:
            kind === 'replace' ? panelReplaceTransition : panelSlideTransition,
          x: kind === 'replace' ? 0 : direction > 0 ? '100%' : '-100%',
          y: kind === 'replace' ? 6 : 0,
        }),
        exit: ({ direction, kind }: PanelMotionContext) => ({
          opacity: 0,
          scale: kind === 'replace' ? 0.995 : 1,
          transition:
            kind === 'replace' ? panelReplaceTransition : panelSlideTransition,
          x: kind === 'replace' ? 0 : direction > 0 ? '-100%' : '100%',
          y: kind === 'replace' ? -3 : 0,
        }),
      };
  const parkingViewSlideVariants = shouldReduceMotion
    ? {
        center: { opacity: 1 },
        enter: { opacity: 0 },
        exit: { opacity: 0 },
      }
    : {
        center: { opacity: 1, x: 0 },
        enter: (direction: number) => ({
          opacity: 0,
          x: direction > 0 ? 22 : -22,
        }),
        exit: (direction: number) => ({
          opacity: 0,
          x: direction > 0 ? -14 : 14,
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
    let cancelled = false;

    async function initializeParkingData() {
      setIsClientReady(true);
      const client = new ParkingDataClient(
        getParkingDataBaseUrl(window.location.href),
      );
      parkingDataClient.current = client;

      try {
        const manifest = await client.initialize();
        const { referenceLocation, selectedParkingId } = parseShareLinkState(
          window.location.search,
        );
        await client.loadLocation(
          referenceLocation ?? EDINBURGH_FALLBACK_LOCATION,
        );
        const selectedPoint = selectedParkingId
          ? await client.loadPoint(selectedParkingId)
          : null;

        if (cancelled) {
          return;
        }

        setParkingManifest(manifest);
        setParkingPoints((current) =>
          keepParkingPointsWhenUnchanged(
            current,
            prepareParkingPoints(client.getLoadedPoints(), localeRef.current),
          ),
        );
        setParkingDataStatus('ready');
        setParkingDataMessage(
          selectedParkingId && !selectedPoint
            ? translate(localeRef.current, 'parkingLinkMissing')
            : null,
        );

        if (referenceLocation) {
          if (isLocationInParkingCoverage(referenceLocation, manifest)) {
            dispatchParkingPanel({
              selectedId: selectedPoint?.id ?? null,
              type: 'INITIALIZE_SELECTION',
            });
            setLocationState({
              status: 'located',
              location: referenceLocation,
            });
          } else {
            dispatchParkingPanel({
              selectedId: null,
              type: 'INITIALIZE_SELECTION',
            });
            setLocationState({
              status: 'too-far',
              location: EDINBURGH_FALLBACK_LOCATION,
            });
          }
          return;
        }

        if (selectedPoint) {
          dispatchParkingPanel({
            selectedId: selectedPoint.id,
            type: 'INITIALIZE_SELECTION',
          });
          setLocationState({
            status: 'located',
            location: {
              latitude: selectedPoint.latitude,
              longitude: selectedPoint.longitude,
            },
          });
          requestCurrentLocationFocus();
          return;
        }

        requestLocation();
      } catch {
        if (cancelled) {
          return;
        }
        setParkingDataStatus('error');
        setParkingDataMessage(translate(localeRef.current, 'dataUnavailable'));
      }
    }

    void initializeParkingData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stored = readSavedNeuks(window.localStorage);
    setSavedNeuks(stored.items);
    setSavedNeuksStatus(stored.ok ? 'ready' : 'storage-error');
    if (!stored.ok) {
      setSavedNeuksMessage(translate(localeRef.current, 'savedStorageError'));
    }

    return subscribeToSavedNeuks((items) => {
      setSavedNeuks(items);
      setSavedNeuksStatus('ready');
      setSavedNeuksMessage(null);
    });
  }, []);

  useEffect(() => {
    if (savedNeuksStatus === 'storage-error') {
      setSavedNeuksMessage(t('savedStorageError'));
    }
  }, [savedNeuksStatus, t]);

  useEffect(() => {
    const client = parkingDataClient.current;
    if (!client || !parkingManifest) {
      return;
    }

    const requestId = savedResolutionRequestId.current + 1;
    savedResolutionRequestId.current = requestId;
    if (savedNeuks.length === 0) {
      setIsSavedPointsLoading(false);
      setSavedRawPoints([]);
      setMissingSavedIds([]);
      setFailedSavedIds([]);
      return;
    }

    setIsSavedPointsLoading(true);
    void client
      .loadPoints(savedNeuks.map(({ id }) => id))
      .then(({ failedIds, missingIds, points }) => {
        if (savedResolutionRequestId.current !== requestId) {
          return;
        }
        const failedIdSet = new Set(failedIds);
        setSavedRawPoints((current) => {
          const nextPoints = new Map(
            current
              .filter(({ id }) => failedIdSet.has(id))
              .map((point) => [point.id, point]),
          );
          for (const point of points) {
            nextPoints.set(point.id, point);
          }
          return [...nextPoints.values()];
        });
        setMissingSavedIds(missingIds);
        setFailedSavedIds(failedIds);
        setIsSavedPointsLoading(false);
      })
      .catch(() => {
        if (savedResolutionRequestId.current !== requestId) {
          return;
        }
        const savedIdSet = new Set(savedNeuks.map(({ id }) => id));
        setSavedRawPoints((current) =>
          current.filter(({ id }) => savedIdSet.has(id)),
        );
        setMissingSavedIds((current) =>
          current.filter((id) => savedIdSet.has(id)),
        );
        setFailedSavedIds(savedNeuks.map(({ id }) => id));
        setIsSavedPointsLoading(false);
      });
  }, [parkingManifest, savedNeuks, savedPointsLoadRequestId]);

  useEffect(() => {
    const client = parkingDataClient.current;
    if (client) {
      setParkingPoints(prepareParkingPoints(client.getLoadedPoints(), locale));
    }
    if (placeSearchDebounceTimeout.current !== null) {
      window.clearTimeout(placeSearchDebounceTimeout.current);
      placeSearchDebounceTimeout.current = null;
    }
    placeSearchAbortController.current?.abort();
    placeSearchAbortController.current = null;
    placeSearchRequestId.current += 1;
    placeSearchCache.current.clear();
    setIsPlaceSearching(false);
    setActivePlaceResultIndex(0);
    setPlaceResults([]);
    setPlaceSearchMessage(null);
  }, [locale]);

  useEffect(() => {
    const client = parkingDataClient.current;
    const manifest = client?.getManifest();
    if (!client || !manifest || parkingDataStatus === 'error') {
      return;
    }

    let cancelled = false;
    setParkingDataStatus('loading');
    setParkingDataMessage(t('loadingNearby'));
    void client
      .loadLocation(locationState.location)
      .then(() => {
        if (cancelled) {
          return;
        }
        setParkingPoints((current) =>
          keepParkingPointsWhenUnchanged(
            current,
            prepareParkingPoints(client.getLoadedPoints(), locale),
          ),
        );
        setParkingDataStatus('ready');
        setParkingDataMessage(null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setParkingDataStatus('error');
        setParkingDataMessage(t('nearbyLoadError'));
      });

    return () => {
      cancelled = true;
    };
  }, [
    locationState.location.latitude,
    locationState.location.longitude,
    parkingManifest?.refreshedAt,
    locale,
    t,
  ]);

  const loadParkingForBounds = useCallback(
    (bounds: ParkingMapBounds) => {
      const client = parkingDataClient.current;
      const manifest = client?.getManifest();
      if (!client || !manifest) {
        return;
      }

      void client
        .loadBounds(bounds)
        .then(() => {
          setParkingPoints((current) =>
            keepParkingPointsWhenUnchanged(
              current,
              prepareParkingPoints(client.getLoadedPoints(), locale),
            ),
          );
        })
        .catch(() => {
          setParkingDataMessage(t('loadAreaError'));
        });
    },
    [locale, t],
  );

  async function retryParkingData() {
    const client = parkingDataClient.current;
    const manifest = client?.getManifest();
    if (!client || !manifest) {
      return;
    }

    setParkingDataStatus('loading');
    setParkingDataMessage(t('loadingNearby'));
    try {
      await client.loadLocation(locationState.location);
      setParkingPoints((current) =>
        keepParkingPointsWhenUnchanged(
          current,
          prepareParkingPoints(client.getLoadedPoints(), locale),
        ),
      );
      setParkingDataStatus('ready');
      setParkingDataMessage(null);
    } catch {
      setParkingDataStatus('error');
      setParkingDataMessage(t('nearbyLoadError'));
    }
  }

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
      if (savedNeuksMessageTimeout.current !== null) {
        window.clearTimeout(savedNeuksMessageTimeout.current);
      }
      if (placeSearchDebounceTimeout.current !== null) {
        window.clearTimeout(placeSearchDebounceTimeout.current);
      }
      placeSearchAbortController.current?.abort();
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
    if (!openParkingMoreMenuId) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      parkingMoreMenuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    });

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        !(target instanceof Element) ||
        (!target.closest('.parking-more-menu-shell') &&
          !target.closest('.parking-more-menu'))
      ) {
        setOpenParkingMoreMenuId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      setOpenParkingMoreMenuId(null);
      window.requestAnimationFrame(() => parkingMoreButtonRef.current?.focus());
    }

    function closeForViewportChange() {
      setOpenParkingMoreMenuId(null);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeForViewportChange);
    parkingListScroll.current?.addEventListener(
      'scroll',
      closeForViewportChange,
      { passive: true },
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeForViewportChange);
      parkingListScroll.current?.removeEventListener(
        'scroll',
        closeForViewportChange,
      );
    };
  }, [openParkingMoreMenuId]);

  useEffect(() => {
    setOpenParkingMoreMenuId(null);
  }, [parkingView, selectedId]);

  useEffect(() => {
    if (!openParkingMoreMenuId) {
      setParkingMoreMenuPosition(null);
    }
  }, [openParkingMoreMenuId]);

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
    [locationState.location, parkingPoints],
  );

  const closestPoints = useMemo(
    () => nearbyPoints.slice(0, closestParkingResultCount),
    [nearbyPoints],
  );
  const savedIds = useMemo(
    () => new Set(savedNeuks.map(({ id }) => id)),
    [savedNeuks],
  );
  const savedPoints = useMemo(
    () =>
      sortByDistance(
        prepareParkingPoints(savedRawPoints, locale),
        locationState.location,
      ).sort((left, right) => {
        const distanceDifference =
          (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0);
        if (distanceDifference !== 0) {
          return distanceDifference;
        }
        const leftSavedAt = savedNeuks.find(
          ({ id }) => id === left.id,
        )?.savedAt;
        const rightSavedAt = savedNeuks.find(
          ({ id }) => id === right.id,
        )?.savedAt;
        const savedAtDifference =
          Date.parse(rightSavedAt ?? '') - Date.parse(leftSavedAt ?? '');
        return savedAtDifference || left.name.localeCompare(right.name, locale);
      }),
    [locale, locationState.location, savedNeuks, savedRawPoints],
  );
  const missingSavedRecords = useMemo(
    () =>
      savedNeuks
        .filter(({ id }) => missingSavedIds.includes(id))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [missingSavedIds, savedNeuks],
  );
  const availablePoints = useMemo(() => {
    const points = new Map<string, ParkingPoint>();
    for (const point of [...nearbyPoints, ...savedPoints]) {
      points.set(point.id, point);
    }
    return [...points.values()];
  }, [nearbyPoints, savedPoints]);
  const mapPoints = parkingView === 'saved' ? savedPoints : availablePoints;
  const formattedParkingLocationCount = useMemo(
    () => (parkingManifest?.recordCount ?? 0).toLocaleString(formattingLocale),
    [formattingLocale, parkingManifest?.recordCount],
  );

  const nearestPoint = nearbyPoints[0] ?? null;
  const activeListPoints =
    parkingView === 'saved' ? savedPoints : closestPoints;
  const explicitSelectedPoint =
    selectedId !== null
      ? (availablePoints.find((point) => point.id === selectedId) ?? null)
      : null;
  const explicitSelectedPointDetails = explicitSelectedPoint
    ? getParkingPopupDetails(explicitSelectedPoint, locale)
    : null;
  const parkingDetailMessage =
    shareError ??
    (savedNeuksStatus === 'storage-error' ? savedNeuksMessage : null);
  const parkingDetailAnnouncement = parkingDetailMessage
    ? null
    : savedNeuksMessage;
  const directionsParkingPoint =
    directionsState.status !== 'idle'
      ? (availablePoints.find(
          (point) => point.id === directionsState.parkingId,
        ) ?? null)
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
    parkingPanelState.view === 'directions' &&
    directionsState.status !== 'idle' &&
    directionsParkingPoint !== null;
  const isParkingDetailsMode =
    parkingPanelState.view === 'details' &&
    explicitSelectedPoint !== null &&
    !isDirectionsMode;
  const isSavedListMode =
    parkingPanelState.view === 'list' &&
    parkingView === 'saved' &&
    !isDirectionsMode;
  const isContentSizedMobileSheet = isParkingDetailsMode || isSavedListMode;
  const activeMobileSheetExpandedViewportRatio = isParkingDetailsMode
    ? mobileDetailsSheetExpandedViewportRatio
    : mobileSheetExpandedViewportRatio;
  const activeMobileSheetExpandedHeight =
    isContentSizedMobileSheet && mobileContentSheetExpandedHeightPx !== null
      ? `${mobileContentSheetExpandedHeightPx}px`
      : `${activeMobileSheetExpandedViewportRatio * 100}dvh`;
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
  const panelDirection = parkingPanelState.direction;
  const parkingViewDirection = parkingView === 'saved' ? 1 : -1;
  const panelMotionContext: PanelMotionContext = {
    direction: panelDirection,
    kind: parkingPanelState.transition,
  };

  useEffect(() => {
    if (
      selectedId === null ||
      !window.matchMedia('(max-width: 820px)').matches
    ) {
      return;
    }

    const selectedListItem = parkingListItemRefs.current.get(selectedId);
    const scrollContainer = parkingListScroll.current;

    if (!selectedListItem || !scrollContainer) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const containerBounds = scrollContainer.getBoundingClientRect();
    const itemBounds = selectedListItem.getBoundingClientRect();
    const scrollDelta =
      itemBounds.top < containerBounds.top
        ? itemBounds.top - containerBounds.top
        : itemBounds.bottom > containerBounds.bottom
          ? itemBounds.bottom - containerBounds.bottom
          : 0;

    if (scrollDelta === 0) {
      return;
    }

    scrollContainer.scrollTo({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      top: scrollContainer.scrollTop + scrollDelta,
    });
  }, [activeListPoints, selectedId]);

  useEffect(() => {
    parkingViewState.current[parkingView].selectedId = selectedId;
  }, [parkingView, selectedId]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (parkingListScroll.current) {
        parkingListScroll.current.scrollTop =
          parkingViewState.current[parkingView].scrollTop;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [parkingView]);

  useEffect(() => {
    if (isDirectionsMode) {
      setMobileSheetState('expanded');
      animateMobileSheetTo('expanded');
    }
  }, [isDirectionsMode]);

  useEffect(() => {
    if (
      parkingPanelState.view === 'details' &&
      explicitSelectedPoint === null
    ) {
      dispatchParkingPanel({ type: 'CLEAR_SELECTION' });
    }
  }, [explicitSelectedPoint, parkingPanelState.view]);

  useEffect(() => {
    if (!isParkingDetailsMode) {
      return;
    }

    setMobileSheetState('expanded');
    animateMobileSheetTo('expanded');
  }, [isParkingDetailsMode]);

  useEffect(() => {
    if (parkingPanelState.view !== 'details') {
      return;
    }

    const mobileViewport = window.matchMedia('(max-width: 820px)');
    function restoreDesktopList(event?: MediaQueryListEvent) {
      if (!(event?.matches ?? mobileViewport.matches)) {
        dispatchParkingPanel({ type: 'RESTORE_DESKTOP_LIST' });
      }
    }

    restoreDesktopList();
    mobileViewport.addEventListener('change', restoreDesktopList);
    return () =>
      mobileViewport.removeEventListener('change', restoreDesktopList);
  }, [parkingPanelState.view]);

  useLayoutEffect(() => {
    if (!isContentSizedMobileSheet) {
      setMobileContentSheetExpandedHeightPx(null);
      setIsMobileContentSheetOverflowing(false);
      return;
    }

    const controlPane = controlPaneRef.current;
    const contentBody = isParkingDetailsMode
      ? Array.from(
          controlPane?.querySelectorAll<HTMLElement>(
            '.parking-detail-body[data-parking-detail-id]',
          ) ?? [],
        ).find(
          (body) => body.dataset.parkingDetailId === explicitSelectedPoint?.id,
        )
      : controlPane?.querySelector<HTMLElement>(
          `.parking-view-content[data-parking-view="${parkingView}"]`,
        );
    if (!controlPane || !contentBody) {
      return;
    }
    const measuredControlPane = controlPane;
    const measuredContentBody = contentBody;

    function getLayoutOffsetTop(element: HTMLElement, ancestor: HTMLElement) {
      let offsetTop = 0;
      let current: HTMLElement | null = element;

      while (current && current !== ancestor) {
        offsetTop += current.offsetTop;
        current = current.offsetParent as HTMLElement | null;
      }

      return current === ancestor ? offsetTop : null;
    }

    function measureContentHeight() {
      const lastContent = Array.from(measuredContentBody.children)
        .reverse()
        .find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            window.getComputedStyle(child).display !== 'none' &&
            child.offsetHeight > 0,
        );
      if (!lastContent) {
        return;
      }

      const contentBottom = getLayoutOffsetTop(
        lastContent,
        measuredControlPane,
      );
      if (contentBottom === null) {
        return;
      }

      const controlPaneStyles = window.getComputedStyle(measuredControlPane);
      const paddingBottom = Number.parseFloat(controlPaneStyles.paddingBottom);
      const borderTopWidth = Number.parseFloat(
        controlPaneStyles.borderTopWidth,
      );
      const borderBottomWidth = Number.parseFloat(
        controlPaneStyles.borderBottomWidth,
      );
      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      );
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const collapsedHeight =
        (Number.isFinite(rootFontSize) ? rootFontSize : 16) *
        mobileSheetCollapsedHeightRem;
      const contentHeight =
        Math.ceil(
          contentBottom +
            lastContent.offsetHeight +
            (Number.isFinite(paddingBottom) ? paddingBottom : 0) +
            (Number.isFinite(borderTopWidth) ? borderTopWidth : 0) +
            (Number.isFinite(borderBottomWidth) ? borderBottomWidth : 0),
        ) + 1;
      const maximumExpandedHeight =
        viewportHeight * activeMobileSheetExpandedViewportRatio;
      const nextHeight = Math.round(
        Math.min(
          maximumExpandedHeight,
          Math.max(collapsedHeight + 1, contentHeight),
        ),
      );

      setMobileContentSheetExpandedHeightPx((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
      setIsMobileContentSheetOverflowing((currentValue) => {
        const nextValue = contentHeight > maximumExpandedHeight;
        return currentValue === nextValue ? currentValue : nextValue;
      });
    }

    let measurementFrame = 0;
    function scheduleContentHeightMeasurement() {
      window.cancelAnimationFrame(measurementFrame);
      measurementFrame = window.requestAnimationFrame(measureContentHeight);
    }

    measureContentHeight();
    const resizeObserver = new ResizeObserver(scheduleContentHeightMeasurement);
    resizeObserver.observe(measuredContentBody);
    for (const child of measuredContentBody.children) {
      resizeObserver.observe(child);
    }
    const mutationObserver = new MutationObserver(() => {
      for (const child of measuredContentBody.children) {
        resizeObserver.observe(child);
      }
      scheduleContentHeightMeasurement();
    });
    mutationObserver.observe(measuredContentBody, {
      childList: true,
      subtree: true,
    });
    window.visualViewport?.addEventListener(
      'resize',
      scheduleContentHeightMeasurement,
    );

    return () => {
      window.cancelAnimationFrame(measurementFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.visualViewport?.removeEventListener(
        'resize',
        scheduleContentHeightMeasurement,
      );
    };
  }, [
    activeMobileSheetExpandedViewportRatio,
    explicitSelectedPoint?.id,
    failedSavedIds.length,
    isContentSizedMobileSheet,
    isParkingDetailsMode,
    isSavedPointsLoading,
    locale,
    savedNeuks.length,
    savedNeuksMessage,
    savedPoints.length,
    shareError,
  ]);

  useEffect(() => {
    if (!isParkingDetailsMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      closeParkingDetails();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isParkingDetailsMode, selectedId]);

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
    const expandedHeight =
      isContentSizedMobileSheet && mobileContentSheetExpandedHeightPx !== null
        ? mobileContentSheetExpandedHeightPx
        : viewportHeight * activeMobileSheetExpandedViewportRatio;
    const rangePx = Math.max(expandedHeight - collapsedHeight, 1);
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
    '--mobile-sheet-expanded-height': activeMobileSheetExpandedHeight,
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

        const manifest = parkingDataClient.current?.getManifest();
        if (manifest && !isLocationInParkingCoverage(location, manifest)) {
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

  function clearDirectionsData() {
    directionsRequestId.current += 1;
    stopLiveRouteTracking();
    setDirectionsState({ status: 'idle' });
    setActiveInstruction(null);
    setRouteInstructionFocusRequest(null);
  }

  function exitDirections() {
    clearDirectionsData();
    dispatchParkingPanel({ type: 'EXIT_DIRECTIONS' });
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
    const client = parkingDataClient.current;
    const manifest = client?.getManifest();
    if (client && manifest) {
      void client
        .loadLocation(EDINBURGH_FALLBACK_LOCATION)
        .then(() => {
          setParkingPoints((current) =>
            keepParkingPointsWhenUnchanged(
              current,
              prepareParkingPoints(client.getLoadedPoints(), locale),
            ),
          );
        })
        .catch(() => {
          setParkingDataMessage(t('nearbyLoadError'));
        });
    }
    requestCurrentLocationFocus();
  }

  function applyReferenceLocation(
    location: UserLocation,
    status: Extract<LocationState['status'], 'located' | 'searched'>,
    label?: string,
    selectedParkingId?: string,
  ) {
    dispatchParkingPanel({
      selectedId: selectedParkingId ?? null,
      type: 'RESET_LIST',
    });
    clearDirectionsData();

    const manifest = parkingDataClient.current?.getManifest();
    if (manifest && !isLocationInParkingCoverage(location, manifest)) {
      applyFallbackLocation('too-far');
      return false;
    }

    setLocationState(
      status === 'searched'
        ? {
            status,
            location,
            label: label ?? t('selectedPlace'),
          }
        : {
            status,
            location,
          },
    );

    return true;
  }

  function requestLocation(selectedParkingId?: string) {
    if (parkingView === 'saved') {
      showNearby();
    }
    dispatchParkingPanel({
      selectedId: selectedParkingId ?? null,
      type: 'RESET_LIST',
    });
    clearDirectionsData();

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

  function cancelPlaceSearchWork() {
    if (placeSearchDebounceTimeout.current !== null) {
      window.clearTimeout(placeSearchDebounceTimeout.current);
      placeSearchDebounceTimeout.current = null;
    }
    placeSearchAbortController.current?.abort();
    placeSearchAbortController.current = null;
    placeSearchRequestId.current += 1;
    setIsPlaceSearching(false);
  }

  async function runPlaceSearch(query: string) {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return;
    }

    if (placeSearchDebounceTimeout.current !== null) {
      window.clearTimeout(placeSearchDebounceTimeout.current);
      placeSearchDebounceTimeout.current = null;
    }
    placeSearchAbortController.current?.abort();

    const cacheKey = `${locale}:${trimmedQuery.toLowerCase()}`;
    const cachedResults = placeSearchCache.current.get(cacheKey);
    const requestId = placeSearchRequestId.current + 1;
    placeSearchRequestId.current = requestId;

    if (cachedResults) {
      placeSearchAbortController.current = null;
      setIsPlaceSearching(false);
      setActivePlaceResultIndex(0);
      setPlaceResults(cachedResults);
      setPlaceSearchMessage(
        cachedResults.length === 0 ? t('noPlaceResults') : null,
      );
      return;
    }

    const controller = new AbortController();
    placeSearchAbortController.current = controller;
    setIsPlaceSearching(true);
    setPlaceSearchMessage(null);

    try {
      const response = await fetch(
        buildPlaceSearchUrl(trimmedQuery, locale, locationState.location),
        {
          headers: {
            Accept: 'application/json',
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error('Place search failed');
      }

      const manifest = parkingDataClient.current?.getManifest();
      const results = parsePlaceSearchResults(await response.json()).filter(
        (result) =>
          !manifest || isLocationInParkingCoverage(result.location, manifest),
      );
      placeSearchCache.current.set(cacheKey, results);
      if (placeSearchCache.current.size > maxPlaceSearchCacheEntries) {
        const oldestKey = placeSearchCache.current.keys().next().value;
        if (oldestKey) {
          placeSearchCache.current.delete(oldestKey);
        }
      }
      if (requestId !== placeSearchRequestId.current) {
        return;
      }
      captureAnalyticsEvent('place_searched', {
        result_count: results.length,
      });
      setActivePlaceResultIndex(0);
      setPlaceResults(results);
      setPlaceSearchMessage(results.length === 0 ? t('noPlaceResults') : null);
      setHasUsedPlaceSearch(true);
    } catch {
      if (
        controller.signal.aborted ||
        requestId !== placeSearchRequestId.current
      ) {
        return;
      }
      captureAnalyticsEvent('place_searched', { error: true });
      setActivePlaceResultIndex(0);
      setPlaceResults([]);
      setPlaceSearchMessage(t('placeSearchError'));
    } finally {
      if (requestId === placeSearchRequestId.current) {
        placeSearchAbortController.current = null;
        setIsPlaceSearching(false);
      }
    }
  }

  function searchForPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runPlaceSearch(placeQuery);
  }

  function updatePlaceQuery(query: string) {
    cancelPlaceSearchWork();
    setPlaceQuery(query);
    setActivePlaceResultIndex(0);
    setPlaceResults([]);
    setPlaceSearchMessage(null);

    if (query.trim().length < placeSearchMinimumCharacters) {
      return;
    }

    placeSearchDebounceTimeout.current = window.setTimeout(() => {
      placeSearchDebounceTimeout.current = null;
      void runPlaceSearch(query);
    }, placeSearchDebounceMs);
  }

  function clearPlaceSearch(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.parentElement
      ?.querySelector<HTMLInputElement>('input')
      ?.focus();
    cancelPlaceSearchWork();
    setPlaceQuery('');
    setActivePlaceResultIndex(0);
    setPlaceResults([]);
    setPlaceSearchMessage(null);
  }

  function selectPlace(result: PlaceSearchResult) {
    cancelPlaceSearchWork();
    captureAnalyticsEvent('place_selected', { place_name: result.name });
    setActivePlaceResultIndex(0);
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
    setOpenParkingMoreMenuId(null);
    parkingViewState.current[parkingView].selectedId = id;
    clearDirectionsData();
    dispatchParkingPanel({ selectedId: id, type: 'SELECT_LIST_POINT' });
  }

  function openParkingDetails(
    point: ParkingPoint,
    origin: 'list' | 'map' = 'map',
  ) {
    if (!window.matchMedia('(max-width: 820px)').matches) {
      selectParkingPoint(point.id);
      return;
    }

    setOpenParkingMoreMenuId(null);
    parkingViewState.current[parkingView].selectedId = point.id;
    clearDirectionsData();
    dispatchParkingPanel({
      origin,
      selectedId: point.id,
      type: 'OPEN_DETAILS',
    });
    setMobileSheetState('expanded');
    animateMobileSheetTo('expanded');
    captureAnalyticsEvent('parking_details_opened', {
      parking_id: point.id,
      parking_name: point.name,
    });
  }

  function closeParkingDetails(event?: MouseEvent<HTMLButtonElement>) {
    const parkingId = selectedId;
    const detailsOrigin = parkingPanelState.detailsOrigin;
    dispatchParkingPanel({ type: 'CLOSE_DETAILS' });
    captureAnalyticsEvent('parking_details_closed', {
      parking_id: parkingId,
    });
    if (event && event.detail !== 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      const markerButton = parkingId
        ? document.querySelector<HTMLElement>(
            `[data-testid="parking-marker-${parkingId}"]`,
          )
        : null;
      const listItem = parkingId
        ? parkingListItemRefs.current.get(parkingId)
        : null;
      const listDetailsButton = listItem?.querySelector<HTMLButtonElement>(
        '.parking-details-button',
      );
      const listButton =
        listItem?.querySelector<HTMLButtonElement>('.parking-row');
      const focusTarget =
        detailsOrigin === 'list'
          ? (listDetailsButton ?? listButton ?? markerButton)
          : (markerButton ?? listButton);
      focusTarget?.focus({ preventScroll: true });
    });
  }

  function clearSelectedParkingPoint() {
    setOpenParkingMoreMenuId(null);
    parkingViewState.current[parkingView].selectedId = null;
    clearDirectionsData();
    dispatchParkingPanel({ type: 'CLEAR_SELECTION' });
  }

  function rememberCurrentParkingView() {
    parkingViewState.current[parkingView] = {
      scrollTop: parkingListScroll.current?.scrollTop ?? 0,
      selectedId,
    };
  }

  function openMyNeuks(event?: MouseEvent<HTMLButtonElement>) {
    rememberCurrentParkingView();
    const selectedSavedId =
      selectedId && savedIds.has(selectedId)
        ? selectedId
        : parkingViewState.current.saved.selectedId;
    parkingViewState.current.saved.selectedId = selectedSavedId;
    clearDirectionsData();
    dispatchParkingPanel({
      selectedId: selectedSavedId,
      type: 'SHOW_SAVED',
    });
    if (event?.detail === 0) {
      window.requestAnimationFrame(() => savedHeadingRef.current?.focus());
    }
    captureAnalyticsEvent('my_neuks_opened', {
      saved_count: savedNeuks.length,
    });
  }

  function showNearby() {
    rememberCurrentParkingView();
    const nearbySelectedId = parkingViewState.current.nearby.selectedId;
    clearDirectionsData();
    dispatchParkingPanel({
      selectedId: nearbySelectedId,
      type: 'SHOW_NEARBY',
    });
  }

  function showSavedNeuksConfirmation(message: string) {
    if (savedNeuksMessageTimeout.current !== null) {
      window.clearTimeout(savedNeuksMessageTimeout.current);
    }
    setSavedNeuksMessage(message);
    savedNeuksMessageTimeout.current = window.setTimeout(() => {
      setSavedNeuksMessage(null);
      savedNeuksMessageTimeout.current = null;
    }, copiedMessageDurationMs);
  }

  function commitSavedNeuks(items: SavedNeukRecord[]) {
    setSavedNeuks(items);
    const wasWritten = writeSavedNeuks(window.localStorage, items);
    setSavedNeuksStatus(wasWritten ? 'ready' : 'storage-error');
    if (!wasWritten) {
      if (savedNeuksMessageTimeout.current !== null) {
        window.clearTimeout(savedNeuksMessageTimeout.current);
        savedNeuksMessageTimeout.current = null;
      }
      setSavedNeuksMessage(t('savedStorageError'));
    }
    return wasWritten;
  }

  function toggleSavedPoint(point: ParkingPoint, source: ParkingActionSource) {
    const wasSaved = isNeukSaved(savedNeuks, point.id);
    const nextItems = wasSaved
      ? removeSavedNeuk(savedNeuks, point.id)
      : addSavedNeuk(savedNeuks, point);
    const wasWritten = commitSavedNeuks(nextItems);

    if (wasSaved) {
      setSavedRawPoints((points) => points.filter(({ id }) => id !== point.id));
      setMissingSavedIds((ids) => ids.filter((id) => id !== point.id));
      setFailedSavedIds((ids) => ids.filter((id) => id !== point.id));
      if (parkingView === 'saved' && selectedId === point.id) {
        clearSelectedParkingPoint();
      }
    } else {
      setFailedSavedIds((ids) => ids.filter((id) => id !== point.id));
      setSavedRawPoints((points) => [
        point,
        ...points.filter(({ id }) => id !== point.id),
      ]);
    }

    if (wasWritten) {
      showSavedNeuksConfirmation(
        t(wasSaved ? 'removedFromMyNeuks' : 'savedToMyNeuks'),
      );
    }
    captureAnalyticsEvent(wasSaved ? 'neuk_removed' : 'neuk_saved', {
      parking_id: point.id,
      parking_name: point.name,
      saved_count: nextItems.length,
      source,
    });
  }

  function removeMissingSavedNeuk(record: SavedNeukRecord) {
    const nextItems = removeSavedNeuk(savedNeuks, record.id);
    const wasWritten = commitSavedNeuks(nextItems);
    setMissingSavedIds((ids) => ids.filter((id) => id !== record.id));
    setFailedSavedIds((ids) => ids.filter((id) => id !== record.id));
    if (wasWritten) {
      showSavedNeuksConfirmation(t('removedFromMyNeuks'));
    }
    captureAnalyticsEvent('neuk_removed', {
      parking_id: record.id,
      parking_name: record.snapshot.name,
      saved_count: nextItems.length,
      source: 'list',
    });
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
    parkingViewState.current[parkingView].selectedId = point.id;
    dispatchParkingPanel({
      selectedId: point.id,
      type: 'OPEN_DIRECTIONS',
    });
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
    } catch {
      if (directionsRequestId.current !== requestId) {
        return;
      }

      const message = t('directionsError');
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

  async function copyParkingLinkForPoint(
    point: ParkingPoint,
    source: ParkingActionSource,
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
    setShareError(t('copyLinkError'));
  }

  async function requestDirections(
    event: MouseEvent<HTMLButtonElement>,
    point: ParkingPoint,
  ) {
    event.stopPropagation();
    await requestDirectionsToPoint(point);
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

  function chooseLanguage(nextLocale: AppLocale) {
    captureAnalyticsEvent('language_changed', { language: nextLocale });
    setLocale(nextLocale);
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
          aria-label={isBrandTrigger ? t('bikeNeuksMenu') : t('themeSettings')}
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
              aria-label={isBrandTrigger ? t('bikeNeuksMenu') : t('settings')}
            >
              <span className="settings-label">{t('theme')}</span>
              <div
                className="theme-options"
                role="group"
                aria-label={t('theme')}
              >
                {themeOptions.map(({ icon: Icon, labelKey, mode }) => (
                  <motion.button
                    aria-pressed={themeMode === mode}
                    className={themeMode === mode ? 'selected' : undefined}
                    key={mode}
                    type="button"
                    whileTap={subtleTap}
                    onClick={() => chooseThemeMode(mode)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {t(labelKey)}
                  </motion.button>
                ))}
              </div>
              <label className="settings-label" htmlFor="language-setting">
                {t('language')}
              </label>
              <select
                className="language-select"
                id="language-setting"
                value={locale}
                onChange={(event) =>
                  chooseLanguage(event.target.value as AppLocale)
                }
              >
                {supportedLocales.map((optionLocale) => (
                  <option key={optionLocale} value={optionLocale}>
                    {localeDetails[optionLocale].selfName}
                  </option>
                ))}
              </select>
              {canInstall ? (
                <Fragment key="install-app-action">
                  <span className="settings-label">{t('app')}</span>
                  <motion.button
                    className="settings-action-button"
                    type="button"
                    whileTap={subtleTap}
                    onClick={installPwa}
                  >
                    <Download size={15} aria-hidden="true" />
                    {t('installApp')}
                  </motion.button>
                </Fragment>
              ) : null}
              <span className="settings-label">{t('about')}</span>
              <motion.button
                className="settings-action-button"
                type="button"
                whileTap={subtleTap}
                onClick={openAttributionsFromSettings}
              >
                <CircleHelp size={15} aria-hidden="true" />
                {t('attributions')}
              </motion.button>
              {isBrandTrigger ? (
                <p className="settings-credit">
                  {t('builtBy')} <a href="https://tau.gr">taugr</a>
                </p>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  function renderPlaceSearchPanel(surface: 'desktop' | 'mobile') {
    const resultListId = `place-search-results-${surface}`;
    const hasSearchFeedback =
      isPlaceSearching ||
      placeResults.length > 0 ||
      placeSearchMessage !== null;

    return (
      <section
        className={`reference-panel reference-panel--${surface}`}
        aria-label={t('placeSearch')}
      >
        <form
          className="place-search-form"
          onSubmit={(event) => {
            void searchForPlace(event);
          }}
        >
          <div className="search-box">
            <Search className="search-box-icon" size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor={`place-search-${surface}`}>
              {t('placeSearchLabel')}
            </label>
            <input
              aria-activedescendant={
                placeResults.length > 0
                  ? `place-search-result-${surface}-${activePlaceResultIndex}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls={resultListId}
              aria-expanded={hasSearchFeedback}
              id={`place-search-${surface}`}
              name="place-search"
              type="search"
              value={placeQuery}
              placeholder={t('placeOrPostcode')}
              onChange={(event) => updatePlaceQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  cancelPlaceSearchWork();
                  setActivePlaceResultIndex(0);
                  setPlaceResults([]);
                  setPlaceSearchMessage(null);
                  return;
                }

                if (placeResults.length === 0) {
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActivePlaceResultIndex((index) =>
                    Math.min(index + 1, placeResults.length - 1),
                  );
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActivePlaceResultIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  const result = placeResults[activePlaceResultIndex];
                  if (result) {
                    selectPlace(result);
                  }
                }
              }}
            />
            {placeQuery.length > 0 ? (
              <button
                aria-label={t('clearSearch')}
                className="search-clear-button"
                type="button"
                onClick={clearPlaceSearch}
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <motion.button
            aria-label={
              locationState.status === 'locating'
                ? t('locating')
                : t('useCurrentLocation')
            }
            className="secondary-location-button"
            title={
              locationState.status === 'locating'
                ? t('locating')
                : t('useCurrentLocation')
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
              {locationState.status === 'locating'
                ? t('locating')
                : t('nearMe')}
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
              {isPlaceSearching ? t('searching') : t('search')}
            </span>
          </motion.button>
        </form>

        <AnimatePresence initial={false}>
          {placeResults.length > 0 ? (
            <motion.ol
              {...risePresence}
              layout
              id={resultListId}
              className="place-results"
              aria-label={t('placeSearchResults')}
              role="listbox"
            >
              {placeResults.map((result, index) => (
                <motion.li
                  layout
                  key={result.id}
                  role="none"
                  transition={rowLayoutTransition}
                >
                  <motion.button
                    aria-selected={index === activePlaceResultIndex}
                    className={
                      index === activePlaceResultIndex ? 'is-active' : undefined
                    }
                    id={`place-search-result-${surface}-${index}`}
                    role="option"
                    type="button"
                    whileTap={subtleTap}
                    onMouseDown={(event) => event.preventDefault()}
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
          {isPlaceSearching || placeSearchMessage ? (
            <motion.div
              {...risePresence}
              key={isPlaceSearching ? 'searching' : placeSearchMessage}
              className="place-search-message"
              role="status"
            >
              {isPlaceSearching ? t('searching') : placeSearchMessage}
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
          {t('attributions')}
        </button>
        <span className="built-by-credit">
          {t('builtBy')} <a href="https://tau.gr">taugr</a>
        </span>
      </footer>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="app-shell"
        data-directions-mode={isDirectionsMode ? 'true' : undefined}
        data-theme={resolvedTheme}
      >
        <section className="map-pane" aria-label={t('map')}>
          <CycleParkingMap
            locale={locale}
            points={mapPoints}
            userLocation={locationState.location}
            currentLocationFocusRequestId={currentLocationFocusRequestId}
            selectedPoint={explicitSelectedPoint}
            nearestPoint={parkingView === 'nearby' ? nearestPoint : null}
            rankedPoints={parkingView === 'nearby' ? nearbyPoints : []}
            parkingView={parkingView}
            savedPointIds={[...savedIds]}
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
            onToggleSavedPoint={(point) => {
              toggleSavedPoint(point, 'popup');
            }}
            onOpenDetails={(point) => openParkingDetails(point, 'map')}
            onViewportChange={loadParkingForBounds}
          />
        </section>

        {!isDirectionsMode ? (
          <section className="mobile-map-toolbar" aria-label={t('findNearby')}>
            <header className="app-header app-header--mobile">
              {renderThemeSettings('settings-menu--mobile', 'brand')}
              <h1 className="sr-only">Bike Neuks</h1>
              {renderPlaceSearchPanel('mobile')}
            </header>
          </section>
        ) : null}

        <motion.aside
          className="control-pane"
          ref={controlPaneRef}
          aria-label={t('nearestParking')}
          data-mobile-sheet-dragging={
            isMobileSheetDragging ? 'true' : undefined
          }
          data-mobile-sheet-state={mobileSheetState}
          data-content-overflow={
            isParkingDetailsMode && isMobileContentSheetOverflowing
              ? 'true'
              : undefined
          }
          data-panel-view={
            isDirectionsMode
              ? 'directions'
              : isParkingDetailsMode
                ? 'details'
                : 'list'
          }
          data-parking-view={parkingView}
          data-panel-transition={parkingPanelState.transition}
          initial={false}
          style={controlPaneStyle}
        >
          <motion.button
            aria-expanded={mobileSheetState === 'expanded'}
            aria-label={
              mobileSheetState === 'expanded'
                ? t('collapsePanel', {
                    panel: t(
                      isDirectionsMode
                        ? 'panelDirections'
                        : isParkingDetailsMode
                          ? 'panelDetails'
                          : parkingView === 'saved'
                            ? 'panelSaved'
                            : 'panelResults',
                    ),
                  })
                : t('expandPanel', {
                    panel: t(
                      isDirectionsMode
                        ? 'panelDirections'
                        : isParkingDetailsMode
                          ? 'panelDetails'
                          : parkingView === 'saved'
                            ? 'panelSaved'
                            : 'panelResults',
                    ),
                  })
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
              custom={panelMotionContext}
              initial={false}
              mode="popLayout"
            >
              {isDirectionsMode ? (
                <motion.section
                  animate="center"
                  custom={panelMotionContext}
                  exit="exit"
                  initial="enter"
                  key="directions"
                  className="directions-mode panel-view"
                  aria-label={t('cycleDirections')}
                  variants={panelMotionVariants}
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
                            {directionsParkingPoint?.name ?? t('directions')}
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
                                {t('cycleRoute')}
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
                                ? t('done')
                                : t('stop')
                              : liveRouteTracking.status === 'starting'
                                ? t('starting')
                                : t('startRoute')}
                          </motion.button>
                        ) : null}
                        <motion.button
                          className="directions-exit-button"
                          type="button"
                          whileTap={subtleTap}
                          onClick={exitDirections}
                        >
                          <X size={16} aria-hidden="true" />
                          {t('exitDirections')}
                        </motion.button>
                      </motion.div>
                    </motion.div>
                    {liveRouteProgress?.hasArrived ? (
                      <motion.p
                        {...directionsRevealPresence}
                        className="directions-live-status directions-live-status-arrived"
                        role="status"
                      >
                        {t('arrivedParking')}
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
                          ? t('routeLocationPermission')
                          : liveRouteTracking.status === 'too-far'
                            ? t('routeOutsideCoverage')
                            : t('liveLocationUnavailable')}
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
                            locale,
                          )}
                        </span>
                        <small className="directions-step-distance directions-current-step-distance">
                          {formatDistance(
                            activeRouteInstruction.distanceMeters,
                            locale,
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
                            aria-label={t('routeSummary')}
                          >
                            <span>
                              <Navigation size={16} aria-hidden="true" />
                              {formatDistance(
                                directionsState.route.distanceMeters,
                                locale,
                              )}
                            </span>
                            <span>
                              <Bike size={16} aria-hidden="true" />
                              {formatCycleRouteDuration(
                                directionsState.route.durationSeconds,
                                locale,
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
                          {t('findingRoute')}
                        </motion.p>
                      ) : null}

                      {directionsState.status === 'missing-key' ? (
                        <motion.p
                          {...risePresence}
                          key="directions-missing-key"
                          className="directions-message"
                        >
                          {t('directionsNeedKey')}
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
                                        locale,
                                      )}
                                    </span>
                                    <small className="directions-step-distance">
                                      {formatDistance(
                                        instruction.distanceMeters,
                                        locale,
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
                              {t('routeBy')}
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
              ) : isParkingDetailsMode && explicitSelectedPoint ? (
                <motion.section
                  animate="center"
                  aria-label={t('details')}
                  className="parking-detail-view panel-view"
                  custom={panelMotionContext}
                  exit="exit"
                  initial="enter"
                  key={`parking-details-${explicitSelectedPoint.id}`}
                  variants={panelMotionVariants}
                >
                  <div
                    className="mobile-sheet-summary mobile-sheet-summary--details"
                    aria-hidden="true"
                  >
                    <strong className="mobile-sheet-summary-location">
                      {explicitSelectedPoint.name}
                    </strong>
                    {explicitSelectedPointDetails?.metrics[0] ? (
                      <small>
                        {explicitSelectedPointDetails.metrics[0].value}
                      </small>
                    ) : null}
                  </div>

                  <div
                    className="mobile-sheet-body parking-detail-body"
                    data-parking-detail-id={explicitSelectedPoint.id}
                  >
                    <div className="parking-details-toolbar">
                      <motion.button
                        className="parking-details-back"
                        type="button"
                        whileTap={subtleTap}
                        onClick={closeParkingDetails}
                      >
                        <ChevronLeft size={17} aria-hidden="true" />
                        {t(
                          parkingView === 'saved'
                            ? 'backToMyNeuks'
                            : 'backToNearbyNeuks',
                        )}
                      </motion.button>
                      <div
                        className="parking-details-utilities"
                        aria-label={t('moreActions', {
                          name: explicitSelectedPoint.name,
                        })}
                      >
                        <motion.button
                          aria-label={t(
                            savedIds.has(explicitSelectedPoint.id)
                              ? 'removeFromMyNeuks'
                              : 'saveToMyNeuks',
                            { name: explicitSelectedPoint.name },
                          )}
                          aria-pressed={savedIds.has(explicitSelectedPoint.id)}
                          className="parking-detail-utility"
                          data-testid="parking-detail-save"
                          type="button"
                          whileTap={subtleTap}
                          onClick={() =>
                            toggleSavedPoint(explicitSelectedPoint, 'details')
                          }
                        >
                          <Bookmark
                            fill={
                              savedIds.has(explicitSelectedPoint.id)
                                ? 'currentColor'
                                : 'none'
                            }
                            size={21}
                            aria-hidden="true"
                          />
                        </motion.button>
                        <motion.button
                          aria-label={t('copyLink', {
                            name: explicitSelectedPoint.name,
                          })}
                          className="parking-detail-utility"
                          data-testid="parking-detail-share"
                          type="button"
                          whileTap={subtleTap}
                          onClick={() => {
                            void copyParkingLinkForPoint(
                              explicitSelectedPoint,
                              'details',
                            );
                          }}
                        >
                          <Share2 size={21} aria-hidden="true" />
                        </motion.button>
                      </div>
                    </div>

                    <header className="parking-details-header">
                      <h1>{explicitSelectedPoint.name}</h1>
                      {explicitSelectedPointDetails?.metrics[0] ? (
                        <span>
                          {explicitSelectedPointDetails.metrics[0].value}
                        </span>
                      ) : null}
                    </header>

                    <div
                      className={[
                        'parking-detail-overview',
                        googleStreetViewApiKey.length === 0
                          ? 'parking-detail-overview--facts-only'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <ParkingDetailStrip
                        className="parking-detail-facts"
                        point={explicitSelectedPoint}
                        showAllDetails
                      />
                      {googleStreetViewApiKey.length > 0 ? (
                        <div className="parking-detail-street-view">
                          <iframe
                            aria-hidden="true"
                            className="parking-detail-street-view-frame"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            src={buildGoogleStreetViewEmbedUrl(
                              explicitSelectedPoint,
                              googleStreetViewApiKey,
                            )}
                            tabIndex={-1}
                            title={t('streetViewFor', {
                              name: explicitSelectedPoint.name,
                            })}
                          />
                          <motion.button
                            aria-label={t('openStreetView', {
                              name: explicitSelectedPoint.name,
                            })}
                            className="parking-detail-street-view-trigger"
                            data-testid="parking-detail-street-view"
                            type="button"
                            whileTap={subtleTap}
                            onClick={() => {
                              setStreetViewPoint(explicitSelectedPoint);
                              captureAnalyticsEvent('street_view_opened', {
                                parking_id: explicitSelectedPoint.id,
                                parking_name: explicitSelectedPoint.name,
                                source: 'details_preview',
                              });
                            }}
                          >
                            <span className="parking-detail-street-view-expand">
                              <Maximize2
                                aria-hidden="true"
                                data-testid="parking-detail-street-view-expand-icon"
                                size={17}
                              />
                            </span>
                          </motion.button>
                        </div>
                      ) : null}
                    </div>

                    <AnimatePresence initial={false}>
                      {parkingDetailMessage ? (
                        <motion.div
                          {...risePresence}
                          className="parking-share-message parking-detail-message"
                          key={parkingDetailMessage}
                          role="status"
                        >
                          {parkingDetailMessage}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    {parkingDetailAnnouncement ? (
                      <span className="sr-only" role="status">
                        {parkingDetailAnnouncement}
                      </span>
                    ) : null}

                    <div
                      className="parking-detail-actions"
                      aria-label={t('moreActions', {
                        name: explicitSelectedPoint.name,
                      })}
                    >
                      <motion.a
                        aria-label={t('openInGoogleMaps', {
                          name: explicitSelectedPoint.name,
                        })}
                        className="parking-detail-action parking-detail-action--external"
                        data-testid="parking-detail-google-maps"
                        href={buildGoogleMapsLocationUrl(explicitSelectedPoint)}
                        rel="noreferrer"
                        target="_blank"
                        whileTap={subtleTap}
                        onClick={() => {
                          captureAnalyticsEvent('google_maps_opened', {
                            parking_id: explicitSelectedPoint.id,
                            parking_name: explicitSelectedPoint.name,
                            source: 'details',
                          });
                        }}
                      >
                        <span className="parking-detail-action-icon">
                          <ExternalLink size={19} aria-hidden="true" />
                        </span>
                        <span className="parking-detail-action-label">
                          {t('googleMaps')}
                        </span>
                      </motion.a>
                      <motion.button
                        className="parking-detail-action parking-detail-action--primary"
                        data-testid="parking-detail-directions"
                        disabled={!isClientReady}
                        type="button"
                        whileTap={subtleTap}
                        onClick={() => {
                          void requestDirectionsToPoint(explicitSelectedPoint);
                        }}
                      >
                        <span className="parking-detail-action-icon">
                          <Navigation size={19} aria-hidden="true" />
                        </span>
                        <span className="parking-detail-action-label">
                          {t('directions')}
                        </span>
                      </motion.button>
                    </div>
                  </div>
                </motion.section>
              ) : (
                <motion.div
                  animate="center"
                  custom={panelMotionContext}
                  exit="exit"
                  initial="enter"
                  key="finder"
                  className="finder-panel-content panel-view"
                  variants={panelMotionVariants}
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
                        {t('spotsAcrossCoverage', {
                          count: formattedParkingLocationCount,
                        })}
                      </p>
                    </div>
                    {renderThemeSettings('settings-menu--desktop')}
                  </header>

                  <div className="mobile-sheet-summary" aria-hidden="true">
                    <span>
                      <strong>
                        {t(
                          parkingView === 'saved'
                            ? 'myNeuks'
                            : 'nearbyBikeNeuks',
                        )}
                      </strong>
                      <small>
                        {t(
                          parkingView === 'saved'
                            ? 'savedCount'
                            : 'closestCount',
                          {
                            count:
                              parkingView === 'saved'
                                ? savedNeuks.length
                                : closestPoints.length,
                          },
                        )}
                      </small>
                    </span>
                    <span className="mobile-sheet-summary-location">
                      {parkingView === 'saved'
                        ? explicitSelectedPoint?.name
                        : nearestPoint?.name}
                    </span>
                  </div>

                  <div className="mobile-sheet-body">
                    <AnimatePresence
                      custom={parkingViewDirection}
                      initial={false}
                      mode="popLayout"
                    >
                      <motion.div
                        animate="center"
                        className="parking-view-content"
                        custom={parkingViewDirection}
                        data-parking-view={parkingView}
                        exit="exit"
                        initial="enter"
                        key={`parking-view-${parkingView}`}
                        transition={parkingViewSlideTransition}
                        variants={parkingViewSlideVariants}
                      >
                        {parkingView === 'nearby'
                          ? renderPlaceSearchPanel('desktop')
                          : null}

                        <div className="list-heading list-heading-actions">
                          <h2
                            ref={savedHeadingRef}
                            tabIndex={parkingView === 'saved' ? -1 : undefined}
                          >
                            {t(
                              parkingView === 'saved'
                                ? 'myNeuks'
                                : 'nearbyBikeNeuks',
                            )}{' '}
                            <span>
                              ·{' '}
                              {t(
                                parkingView === 'saved'
                                  ? 'savedCount'
                                  : 'closestCount',
                                {
                                  count:
                                    parkingView === 'saved'
                                      ? savedNeuks.length
                                      : closestPoints.length,
                                },
                              )}
                            </span>
                          </h2>
                          {parkingView === 'saved' ? (
                            <motion.button
                              className="parking-view-button"
                              type="button"
                              whileTap={subtleTap}
                              onClick={showNearby}
                            >
                              <ChevronLeft size={14} aria-hidden="true" />
                              {t('showNearby')}
                            </motion.button>
                          ) : (
                            <motion.button
                              className="parking-view-button"
                              data-testid="open-my-neuks"
                              disabled={savedNeuksStatus === 'loading'}
                              type="button"
                              whileTap={subtleTap}
                              onClick={openMyNeuks}
                            >
                              <Bookmark
                                size={14}
                                fill={
                                  savedNeuks.length > 0
                                    ? 'currentColor'
                                    : 'none'
                                }
                                aria-hidden="true"
                              />
                              <span>
                                {t('myNeuks')} {savedNeuks.length}
                              </span>
                              <ChevronRight size={14} aria-hidden="true" />
                            </motion.button>
                          )}
                        </div>

                        <AnimatePresence initial={false}>
                          {shareError || savedNeuksMessage ? (
                            <motion.div
                              {...risePresence}
                              key={shareError ?? savedNeuksMessage}
                              className="parking-share-message"
                              role="status"
                            >
                              {shareError ?? savedNeuksMessage}
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        <div
                          className="parking-list-scroll"
                          ref={parkingListScroll}
                        >
                          <AnimatePresence initial={false} mode="popLayout">
                            {parkingView === 'nearby' && parkingDataMessage ? (
                              <motion.div
                                {...risePresence}
                                key={parkingDataMessage}
                                className="parking-list-context"
                                role="status"
                              >
                                {parkingDataMessage}
                                {parkingDataStatus === 'error' ? (
                                  <button
                                    className="parking-retry-button"
                                    type="button"
                                    onClick={() => void retryParkingData()}
                                  >
                                    {t('retry')}
                                  </button>
                                ) : null}
                              </motion.div>
                            ) : null}
                            {parkingView === 'nearby' &&
                            locationState.status === 'too-far' ? (
                              <motion.div
                                {...risePresence}
                                key="too-far"
                                className="parking-list-context"
                                role="status"
                              >
                                {t('outsideCoverage')}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>

                          {parkingView === 'saved' && isSavedPointsLoading ? (
                            <div className="parking-list-context" role="status">
                              {t('loadingSavedNeuks')}
                            </div>
                          ) : null}

                          {parkingView === 'saved' &&
                          !isSavedPointsLoading &&
                          failedSavedIds.length > 0 ? (
                            <div className="parking-list-context" role="status">
                              {t('savedLoadError')}
                              <button
                                className="parking-retry-button"
                                type="button"
                                onClick={() =>
                                  setSavedPointsLoadRequestId((id) => id + 1)
                                }
                              >
                                {t('retry')}
                              </button>
                            </div>
                          ) : null}

                          {parkingView === 'saved' &&
                          !isSavedPointsLoading &&
                          savedNeuks.length === 0 ? (
                            <section className="saved-neuks-empty">
                              <Bookmark size={24} aria-hidden="true" />
                              <h3>{t('noSavedNeuks')}</h3>
                              <button type="button" onClick={showNearby}>
                                {t('showNearby')}
                              </button>
                            </section>
                          ) : null}

                          {parkingView === 'saved' ||
                          parkingDataStatus === 'ready' ? (
                            <motion.ol
                              className="parking-list"
                              data-testid="parking-list"
                              aria-label={t(
                                parkingView === 'saved'
                                  ? 'myNeuks'
                                  : 'nearbyBikeNeuks',
                              )}
                            >
                              {activeListPoints.map((point, index) => {
                                const isActive =
                                  point.id === explicitSelectedPoint?.id;
                                const isSaved = savedIds.has(point.id);
                                return (
                                  <motion.li
                                    className={[
                                      'parking-list-item',
                                      parkingView === 'saved'
                                        ? 'saved-list-item'
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    key={point.id}
                                    transition={rowLayoutTransition}
                                    ref={(item) => {
                                      if (item) {
                                        parkingListItemRefs.current.set(
                                          point.id,
                                          item,
                                        );
                                      } else {
                                        parkingListItemRefs.current.delete(
                                          point.id,
                                        );
                                      }
                                    }}
                                  >
                                    <motion.button
                                      aria-pressed={isActive}
                                      className={[
                                        'parking-row',
                                        parkingView === 'saved'
                                          ? 'saved-parking-row'
                                          : null,
                                        parkingView === 'nearby' && index === 0
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
                                      onClick={() =>
                                        selectParkingPoint(point.id)
                                      }
                                    >
                                      {parkingView === 'nearby' ? (
                                        <span
                                          className={`rank rank-${index + 1}`}
                                        >
                                          {index + 1}
                                        </span>
                                      ) : null}
                                      <span className="parking-row-copy">
                                        <strong>{point.name}</strong>
                                        <ParkingDetailStrip
                                          includeDistance
                                          point={point}
                                        />
                                      </span>
                                      {parkingView === 'nearby' &&
                                      isSaved &&
                                      !isActive ? (
                                        <span
                                          className="parking-saved-indicator"
                                          data-testid={`parking-saved-status-${point.id}`}
                                        >
                                          <Bookmark
                                            size={16}
                                            fill="currentColor"
                                            aria-hidden="true"
                                          />
                                          <span className="sr-only">
                                            {t('savedMarker')}
                                          </span>
                                        </span>
                                      ) : null}
                                    </motion.button>
                                    {isActive ? (
                                      <motion.div
                                        className="parking-list-actions"
                                        data-testid={`parking-actions-${point.id}`}
                                      >
                                        <motion.button
                                          aria-label={t('viewParkingDetails', {
                                            name: point.name,
                                          })}
                                          className="parking-details-button"
                                          data-testid={`parking-details-${point.id}`}
                                          type="button"
                                          whileTap={subtleTap}
                                          onClick={() =>
                                            openParkingDetails(point, 'list')
                                          }
                                        >
                                          <span>{t('viewDetails')}</span>
                                          <ChevronRight
                                            size={17}
                                            aria-hidden="true"
                                          />
                                        </motion.button>
                                        <motion.button
                                          aria-label={t('showDirections', {
                                            name: point.name,
                                          })}
                                          className="parking-directions-button"
                                          data-testid={`parking-directions-${point.id}`}
                                          disabled={!isClientReady}
                                          type="button"
                                          whileTap={subtleTap}
                                          onClick={(event) => {
                                            void requestDirections(
                                              event,
                                              point,
                                            );
                                          }}
                                        >
                                          <Navigation
                                            size={17}
                                            aria-hidden="true"
                                          />
                                          <span className="parking-directions-label">
                                            {t('directions')}
                                          </span>
                                        </motion.button>
                                        <div className="parking-more-menu-shell">
                                          <motion.button
                                            ref={parkingMoreButtonRef}
                                            aria-expanded={
                                              openParkingMoreMenuId === point.id
                                            }
                                            aria-haspopup="menu"
                                            aria-label={t('moreActions', {
                                              name: point.name,
                                            })}
                                            className="parking-more-button"
                                            data-testid={`parking-more-${point.id}`}
                                            type="button"
                                            whileTap={subtleTap}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              if (
                                                openParkingMoreMenuId ===
                                                point.id
                                              ) {
                                                setOpenParkingMoreMenuId(null);
                                                return;
                                              }

                                              const buttonBounds =
                                                event.currentTarget.getBoundingClientRect();
                                              const opensAbove =
                                                buttonBounds.top >= 116;
                                              setParkingMoreMenuPosition({
                                                right: Math.max(
                                                  12,
                                                  window.innerWidth -
                                                    buttonBounds.right,
                                                ),
                                                ...(opensAbove
                                                  ? {
                                                      bottom:
                                                        window.innerHeight -
                                                        buttonBounds.top +
                                                        6,
                                                    }
                                                  : {
                                                      top:
                                                        buttonBounds.bottom + 6,
                                                    }),
                                              });
                                              setOpenParkingMoreMenuId(
                                                point.id,
                                              );
                                            }}
                                          >
                                            <EllipsisVertical
                                              size={20}
                                              aria-hidden="true"
                                            />
                                          </motion.button>
                                          {openParkingMoreMenuId === point.id &&
                                          parkingMoreMenuPosition &&
                                          typeof document !== 'undefined'
                                            ? createPortal(
                                                <motion.div
                                                  ref={parkingMoreMenuRef}
                                                  {...risePresence}
                                                  className="parking-more-menu"
                                                  data-testid={`parking-more-menu-${point.id}`}
                                                  role="menu"
                                                  style={
                                                    parkingMoreMenuPosition
                                                  }
                                                >
                                                  <motion.button
                                                    aria-label={t(
                                                      isSaved
                                                        ? 'removeFromMyNeuks'
                                                        : 'saveToMyNeuks',
                                                      { name: point.name },
                                                    )}
                                                    className="parking-more-menu-item parking-save-button"
                                                    data-testid={`parking-save-${point.id}`}
                                                    role="menuitem"
                                                    type="button"
                                                    whileTap={subtleTap}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      setOpenParkingMoreMenuId(
                                                        null,
                                                      );
                                                      toggleSavedPoint(
                                                        point,
                                                        'list',
                                                      );
                                                    }}
                                                  >
                                                    <Bookmark
                                                      size={17}
                                                      fill={
                                                        isSaved
                                                          ? 'currentColor'
                                                          : 'none'
                                                      }
                                                      aria-hidden="true"
                                                    />
                                                    {t(
                                                      isSaved
                                                        ? 'removeFromMyNeuksShort'
                                                        : 'saveToMyNeuksShort',
                                                    )}
                                                  </motion.button>
                                                  <motion.button
                                                    aria-label={t('copyLink', {
                                                      name: point.name,
                                                    })}
                                                    className="parking-more-menu-item parking-share-button"
                                                    role="menuitem"
                                                    type="button"
                                                    whileTap={subtleTap}
                                                    onClick={(event) => {
                                                      void copyParkingLink(
                                                        event,
                                                        point,
                                                      );
                                                    }}
                                                  >
                                                    <Share2
                                                      size={17}
                                                      aria-hidden="true"
                                                    />
                                                    {copiedShareButton?.source ===
                                                      'list' &&
                                                    copiedShareButton.parkingId ===
                                                      point.id
                                                      ? t('copied')
                                                      : t('share')}
                                                  </motion.button>
                                                </motion.div>,
                                                document.body,
                                              )
                                            : null}
                                        </div>
                                      </motion.div>
                                    ) : null}
                                  </motion.li>
                                );
                              })}
                              {parkingView === 'saved'
                                ? missingSavedRecords.map((record) => (
                                    <motion.li
                                      className="parking-list-item saved-list-item saved-list-item-missing"
                                      key={record.id}
                                      layout="position"
                                    >
                                      <div className="parking-row saved-parking-row">
                                        <span className="parking-row-copy">
                                          <strong>
                                            {record.snapshot.name}
                                          </strong>
                                          <span>{t('noLongerInData')}</span>
                                        </span>
                                      </div>
                                      <motion.button
                                        aria-label={t('removeFromMyNeuks', {
                                          name: record.snapshot.name,
                                        })}
                                        aria-pressed="true"
                                        className="parking-save-button"
                                        type="button"
                                        whileTap={subtleTap}
                                        onClick={() =>
                                          removeMissingSavedNeuk(record)
                                        }
                                      >
                                        <Bookmark
                                          size={18}
                                          fill="currentColor"
                                          aria-hidden="true"
                                        />
                                      </motion.button>
                                    </motion.li>
                                  ))
                                : null}
                            </motion.ol>
                          ) : null}
                        </div>

                        {renderAttributionFooter()}
                      </motion.div>
                    </AnimatePresence>
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
                  <h2 id="attribution-modal-title">{t('attributions')}</h2>
                </div>
                <div className="attribution-details">
                  {parkingManifest?.sources.map((source) => (
                    <Fragment key={source.id}>
                      <span>{source.attribution}</span>
                      <a href={source.licenceUrl}>{source.licenceName}</a>
                    </Fragment>
                  ))}
                  <span>
                    Map interface by{' '}
                    <a href="https://maplibre.org/">MapLibre GL JS</a>.
                  </span>
                  {hasUsedPlaceSearch ? (
                    <span>
                      Place search by{' '}
                      <a href="https://photon.komoot.io/">Photon</a> using
                      OpenStreetMap data.
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
                    {t('close')}
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
                    aria-label={t('closeStreetView')}
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
                  title={t('streetViewFor', { name: streetViewPoint.name })}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </dialog>
      </main>
    </MotionConfig>
  );
}

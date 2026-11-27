import { captureAnalyticsEvent, isAnalyticsTestTraffic } from './analytics';

type MapPhase = 'starting' | 'ready' | 'recovering';
type MapState = {
  map_phase: MapPhase;
  terrain_active: boolean;
};
type VisitMarker = MapState & { checkedAt: number; isTest: boolean };
type PageError = 'runtime_error' | 'unhandled_rejection';

const storageKey = 'bike-neuk-map-diagnostics-v1';
const stallMs = 20_000;
const heartbeatMs = 60_000;
const maxMarkerAgeMs = 5 * heartbeatMs;
let updateMapState: ((next: MapState) => void) | undefined;

export function setMapDiagnosticState(phase: MapPhase, terrainActive: boolean) {
  updateMapState?.({ map_phase: phase, terrain_active: terrainActive });
}

function readRecentVisit(isTest: boolean): MapState | undefined {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return;
    window.sessionStorage.removeItem(storageKey);
    const marker: Partial<VisitMarker> | null = JSON.parse(raw);
    if (!marker || typeof marker.checkedAt !== 'number') return;
    const age = Date.now() - marker.checkedAt;
    if (
      age >= 0 &&
      age <= maxMarkerAgeMs &&
      marker.isTest === isTest &&
      typeof marker.terrain_active === 'boolean' &&
      (marker.map_phase === 'starting' ||
        marker.map_phase === 'ready' ||
        marker.map_phase === 'recovering')
    ) {
      return {
        map_phase: marker.map_phase,
        terrain_active: marker.terrain_active,
      };
    }
  } catch {
    // Session storage can be blocked or contain a marker from an older build.
  }
}

export function installMapDiagnostics() {
  const previous = readRecentVisit(isAnalyticsTestTraffic());
  const discarded = (document as Document & { wasDiscarded?: boolean })
    .wasDiscarded;
  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (previous && (discarded || navigation?.type === 'reload')) {
    captureAnalyticsEvent('map_session_interrupted', {
      ...previous,
      reason: discarded ? 'browser_discarded' : 'unclean_reload',
    });
  }

  const reportedErrors = new Set<PageError>();
  let state: MapState = { map_phase: 'starting', terrain_active: false };
  let pageActive = true;
  let reportedStall = false;
  let stallTimer: number | undefined;
  let heartbeat: number | undefined;
  const isVisible = () => pageActive && document.visibilityState === 'visible';

  function saveMarker() {
    if (!isVisible()) return;
    try {
      const marker: VisitMarker = {
        ...state,
        checkedAt: Date.now(),
        isTest: isAnalyticsTestTraffic(),
      };
      window.sessionStorage.setItem(storageKey, JSON.stringify(marker));
    } catch {
      // Runtime diagnostics still work without session storage.
    }
  }

  function watchRendering() {
    window.clearTimeout(stallTimer);
    if (!isVisible() || state.map_phase === 'ready' || reportedStall) return;
    stallTimer = window.setTimeout(() => {
      if (!isVisible()) return;
      reportedStall = true;
      captureAnalyticsEvent('map_render_stalled', state);
    }, stallMs);
  }

  function onVisibility() {
    window.clearInterval(heartbeat);
    if (isVisible()) {
      saveMarker();
      heartbeat = window.setInterval(saveMarker, heartbeatMs);
    }
    watchRendering();
  }

  function reportPageError(reason: PageError) {
    if (reportedErrors.has(reason)) return;
    reportedErrors.add(reason);
    captureAnalyticsEvent('map_page_error', { ...state, reason });
  }

  updateMapState = (next) => {
    const phaseChanged = next.map_phase !== state.map_phase;
    state = next;
    saveMarker();
    if (phaseChanged) {
      reportedStall = false;
      watchRendering();
    }
  };
  window.addEventListener('error', (event) => {
    if (event instanceof ErrorEvent) reportPageError('runtime_error');
  });
  window.addEventListener('unhandledrejection', () => {
    reportPageError('unhandled_rejection');
  });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => {
    pageActive = false;
    onVisibility();
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage access is optional.
    }
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    pageActive = true;
    onVisibility();
  });
  onVisibility();
}

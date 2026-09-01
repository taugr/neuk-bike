'use client';

import { useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  CircleParking,
  MapPinPlus,
  Pencil,
  Plus,
  Route,
  Save,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import {
  CYCLESTREETS_MAX_WAYPOINTS,
  CYCLESTREETS_ROUTE_PLANS,
  formatCycleRouteDuration,
  type CycleRoutePlan,
  type CycleRoutesByPlan,
  type CycleRouteWaypoint,
} from '@/lib/cyclestreets';
import { buildPlaceSearchUrl, parsePlaceSearchResults } from '@/lib/geocoder';
import { formatLocalizedDistance } from '@/lib/i18n/format';
import { createLocalId } from '@/lib/local-id';
import { getDefaultRouteName, type RouteDraft } from '@/lib/route-draft';

type RoutePlannerStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'missing-key'
  | 'error';

export type RoutePlannerProps = {
  draft: RouteDraft;
  message: string | null;
  placementActive: boolean;
  placementStartWaypointCount: number;
  routes: CycleRoutesByPlan;
  status: RoutePlannerStatus;
  onAddWaypoint: (waypoint: CycleRouteWaypoint) => void;
  onBack: () => void;
  onCancelMapPlacement: () => void;
  onDoneMapPlacement: () => void;
  onMoveWaypoint: (fromIndex: number, toIndex: number) => void;
  onOpenLibrary: () => void;
  onOpenDestinationParking: () => void;
  onRemoveWaypoint: (id: string) => void;
  onRename: (name: string) => void;
  onRequestMapPlacement: () => void;
  onSave: () => void;
  onSelectPlan: (plan: CycleRoutePlan) => void;
  onSwapEndpoints: () => void;
  onUndoMapPlacement: () => void;
};

export function RoutePlanner({
  draft,
  message,
  placementActive,
  placementStartWaypointCount,
  routes,
  status,
  onAddWaypoint,
  onBack,
  onCancelMapPlacement,
  onDoneMapPlacement,
  onMoveWaypoint,
  onOpenLibrary,
  onOpenDestinationParking,
  onRemoveWaypoint,
  onRename,
  onRequestMapPlacement,
  onSave,
  onSelectPlan,
  onSwapEndpoints,
  onUndoMapPlacement,
}: RoutePlannerProps) {
  const { locale, t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    ReturnType<typeof parsePlaceSearchResults>
  >([]);
  const [searchStatus, setSearchStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const searchRequestId = useRef(0);
  const selectedRoute = routes[draft.plan] ?? null;
  const addedWaypointCount = Math.max(
    0,
    draft.waypoints.length - placementStartWaypointCount,
  );
  const waypointCountKey =
    draft.waypoints.length === 1 ? 'routePoint' : 'routePoints';

  if (placementActive) {
    const reachedWaypointLimit =
      draft.waypoints.length >= CYCLESTREETS_MAX_WAYPOINTS;

    return (
      <section
        className="route-map-editor"
        aria-label={t('editingRoute')}
        data-testid="route-map-editor"
      >
        <header className="route-map-editor-header">
          <span className="route-map-editor-title">
            <span className="route-map-editor-icon" aria-hidden="true">
              <Pencil size={18} />
            </span>
            <strong>{t('editingRoute')}</strong>
            <span className="route-map-editor-count">
              {t(waypointCountKey, { count: draft.waypoints.length })}
            </span>
          </span>
          <button type="button" onClick={onCancelMapPlacement}>
            {t('cancel')}
          </button>
        </header>

        <div className="route-map-editor-status" aria-live="polite">
          <CheckCircle2 size={21} aria-hidden="true" />
          <strong>
            {addedWaypointCount > 0
              ? t('routePointAdded', { count: draft.waypoints.length })
              : t('routeReadyToAddPoints')}
          </strong>
          <button
            disabled={addedWaypointCount === 0}
            type="button"
            onClick={onUndoMapPlacement}
          >
            <Undo2 size={17} aria-hidden="true" />
            {t('undo')}
          </button>
        </div>

        <p className="route-map-editor-help">
          {t(
            reachedWaypointLimit
              ? 'routePointLimitReached'
              : 'tapMapToKeepAddingPoints',
          )}
        </p>

        <button
          className="route-map-editor-done"
          type="button"
          onClick={onDoneMapPlacement}
        >
          <CheckCircle2 size={21} aria-hidden="true" />
          {t('doneEditing')}
        </button>
      </section>
    );
  }

  async function searchPlaces(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3) {
      return;
    }

    const requestId = ++searchRequestId.current;
    setSearchStatus('loading');
    setResults([]);
    try {
      const focus = draft.waypoints.at(-1);
      const response = await fetch(
        buildPlaceSearchUrl(trimmedQuery, locale, focus),
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) {
        throw new Error('Search failed.');
      }
      const nextResults = parsePlaceSearchResults(await response.json());
      if (searchRequestId.current !== requestId) {
        return;
      }
      setResults(nextResults);
      setSearchStatus('idle');
    } catch {
      if (searchRequestId.current !== requestId) {
        return;
      }
      setSearchStatus('error');
    }
  }

  return (
    <section className="route-planner panel-view" aria-label={t('planRoute')}>
      <header className="route-planner-header">
        <button type="button" className="route-planner-back" onClick={onBack}>
          <ChevronLeft size={17} aria-hidden="true" />
          {t('back')}
        </button>
        <span className="route-planner-title">
          <Route size={22} aria-hidden="true" />
          <strong>{t('planRoute')}</strong>
        </span>
        <button
          type="button"
          className="route-library-link"
          onClick={onOpenLibrary}
        >
          {t('myRoutes')}
        </button>
      </header>

      <div className="route-planner-scroll">
        <label className="route-name-field">
          <span>{t('routeName')}</span>
          <input
            value={draft.name}
            placeholder={
              getDefaultRouteName(draft.waypoints, (start, finish) =>
                t('routeNameBetween', { start, finish }),
              ) || t('newRoute')
            }
            onChange={(event) => onRename(event.target.value)}
          />
        </label>

        <div className="route-stop-list" aria-label={t('routeStops')}>
          {draft.waypoints.map((waypoint, index) => (
            <div className="route-stop-row" key={waypoint.id}>
              <span className="route-stop-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="route-stop-copy">
                <small>
                  {index === 0
                    ? t('routeStart')
                    : index === draft.waypoints.length - 1
                      ? t('routeFinish')
                      : t('routeVia')}
                </small>
                <strong>{waypoint.label}</strong>
              </span>
              <span className="route-stop-actions">
                <button
                  aria-label={t('moveStopUp', { name: waypoint.label })}
                  disabled={index === 0}
                  type="button"
                  onClick={() => onMoveWaypoint(index, index - 1)}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  aria-label={t('moveStopDown', { name: waypoint.label })}
                  disabled={index === draft.waypoints.length - 1}
                  type="button"
                  onClick={() => onMoveWaypoint(index, index + 1)}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button
                  aria-label={t('removeRouteStop', { name: waypoint.label })}
                  type="button"
                  onClick={() => onRemoveWaypoint(waypoint.id)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </span>
            </div>
          ))}
        </div>

        {draft.waypoints.length >= 2 && status === 'loaded' ? (
          <button
            className="route-destination-parking-trigger"
            data-testid="finish-at-bike-parking"
            type="button"
            onClick={onOpenDestinationParking}
          >
            <CircleParking size={19} aria-hidden="true" />
            <span>
              <strong>{t('finishAtBikeParking')}</strong>
              <small>{t('finishAtBikeParkingHelp')}</small>
            </span>
          </button>
        ) : null}

        <div className="route-stop-toolbar">
          <button
            type="button"
            className={placementActive ? 'is-active' : undefined}
            disabled={draft.waypoints.length >= CYCLESTREETS_MAX_WAYPOINTS}
            onClick={onRequestMapPlacement}
          >
            <MapPinPlus size={17} aria-hidden="true" />
            {placementActive ? t('tapMapToAddStop') : t('addStopOnMap')}
          </button>
          <button
            type="button"
            disabled={draft.waypoints.length < 2}
            onClick={onSwapEndpoints}
          >
            <ArrowUpDown size={17} aria-hidden="true" />
            {t('swapEndpoints')}
          </button>
        </div>

        {draft.waypoints.length < CYCLESTREETS_MAX_WAYPOINTS ? (
          <form
            className="route-place-search"
            onSubmit={(event) => void searchPlaces(event)}
          >
            <label htmlFor="route-place-query">{t('addPlace')}</label>
            <div>
              <input
                id="route-place-query"
                value={query}
                placeholder={t('placeOrPostcode')}
                onChange={(event) => {
                  searchRequestId.current += 1;
                  setQuery(event.target.value);
                  setResults([]);
                  setSearchStatus('idle');
                }}
              />
              <button
                disabled={query.trim().length < 3 || searchStatus === 'loading'}
              >
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">{t('search')}</span>
              </button>
            </div>
            {searchStatus === 'error' ? (
              <p role="status">{t('placeSearchError')}</p>
            ) : null}
            {results.length > 0 ? (
              <ol className="route-place-results">
                {results.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onAddWaypoint({
                          id: createLocalId(),
                          label: result.name,
                          latitude: result.location.latitude,
                          longitude: result.location.longitude,
                          source: 'search',
                        });
                        setQuery('');
                        setResults([]);
                      }}
                    >
                      <Plus size={15} aria-hidden="true" />
                      {result.name}
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </form>
        ) : null}

        {status === 'loading' ? (
          <p className="route-planner-message" role="status">
            {t('findingRoute')}
          </p>
        ) : null}
        {status === 'missing-key' ? (
          <p className="route-planner-message" role="status">
            {t('directionsNeedKey')}
          </p>
        ) : null}
        {status === 'error' && message ? (
          <p className="route-planner-message" role="status">
            {message}
          </p>
        ) : null}

        {Object.keys(routes).length > 0 ? (
          <div
            className="route-planner-options"
            aria-label={t('routeStyle')}
            role="group"
          >
            {CYCLESTREETS_ROUTE_PLANS.map((plan) => {
              const route = routes[plan];
              return (
                <button
                  aria-pressed={draft.plan === plan}
                  className={draft.plan === plan ? 'is-selected' : undefined}
                  disabled={!route}
                  key={plan}
                  type="button"
                  onClick={() => onSelectPlan(plan)}
                >
                  <strong>
                    {t(
                      plan === 'quietest'
                        ? 'routeQuietest'
                        : plan === 'balanced'
                          ? 'routeBalanced'
                          : 'routeFastest',
                    )}
                  </strong>
                  <small>
                    {route
                      ? `${formatCycleRouteDuration(route.durationSeconds, locale)} · ${formatLocalizedDistance(route.distanceMeters, locale)}`
                      : t('routeUnavailable')}
                  </small>
                </button>
              );
            })}
          </div>
        ) : null}

        {message && status !== 'error' ? (
          <p className="route-planner-message" role="status">
            {message}
          </p>
        ) : null}
      </div>

      <footer className="route-planner-footer">
        <button
          className="route-save-button"
          disabled={!selectedRoute || status === 'loading'}
          type="button"
          onClick={onSave}
        >
          <Save size={18} aria-hidden="true" />
          {t('saveRoute')}
        </button>
      </footer>
    </section>
  );
}

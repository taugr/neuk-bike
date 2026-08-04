'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  Copy,
  Download,
  Ellipsis,
  Pencil,
  Plus,
  Route,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import {
  describeCycleRouteInstruction,
  formatCycleRouteDuration,
} from '@/lib/cyclestreets';
import { formatLocalizedDistance } from '@/lib/i18n/format';
import {
  groupRouteWaypointNumbersByInstruction,
  savedRouteToCycleRoute,
  type SavedRouteRecord,
} from '@/lib/saved-routes';

export function SavedRoutesPanel({
  error,
  loading,
  routes,
  selectedRoute,
  onBack,
  onDelete,
  onDuplicate,
  onEdit,
  onExport,
  onNewRoute,
  onRename,
  onSelect,
}: {
  error: string | null;
  loading: boolean;
  routes: SavedRouteRecord[];
  selectedRoute: SavedRouteRecord | null;
  onBack: () => void;
  onDelete: (route: SavedRouteRecord) => void;
  onDuplicate: (route: SavedRouteRecord) => void;
  onEdit: (route: SavedRouteRecord) => void;
  onExport: (route: SavedRouteRecord) => void;
  onNewRoute: () => void;
  onRename: (route: SavedRouteRecord, name: string) => void;
  onSelect: (route: SavedRouteRecord) => void;
}) {
  const { locale, t } = useLanguage();
  const [name, setName] = useState(selectedRoute?.name ?? '');
  const [isRenaming, setIsRenaming] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [mobileActionsPosition, setMobileActionsPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const mobileActionsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(selectedRoute?.name ?? '');
    setIsRenaming(false);
    setMobileActionsOpen(false);
    setMobileActionsPosition(null);
  }, [selectedRoute]);

  useEffect(() => {
    if (!mobileActionsOpen) {
      return;
    }

    const closeMenu = () => {
      setMobileActionsOpen(false);
      setMobileActionsPosition(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        mobileActionsButtonRef.current?.contains(target) ||
        mobileActionsMenuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      closeMenu();
      window.requestAnimationFrame(() =>
        mobileActionsButtonRef.current?.focus(),
      );
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.requestAnimationFrame(() => {
      mobileActionsMenuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [mobileActionsOpen]);

  function closeMobileActions() {
    setMobileActionsOpen(false);
    setMobileActionsPosition(null);
  }

  function toggleMobileActions() {
    if (mobileActionsOpen) {
      closeMobileActions();
      return;
    }

    const button = mobileActionsButtonRef.current;
    if (!button) {
      return;
    }

    const buttonBounds = button.getBoundingClientRect();
    const viewportPadding = 12;
    const menuGap = 8;
    const estimatedMenuHeight = 152;
    const width = Math.min(220, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      window.innerWidth - width - viewportPadding,
      Math.max(viewportPadding, buttonBounds.right - width),
    );
    const preferredTop =
      buttonBounds.top >= estimatedMenuHeight + menuGap + viewportPadding
        ? buttonBounds.top - estimatedMenuHeight - menuGap
        : buttonBounds.bottom + menuGap;
    const top = Math.max(
      viewportPadding,
      Math.min(
        preferredTop,
        window.innerHeight - estimatedMenuHeight - viewportPadding,
      ),
    );

    setMobileActionsPosition({ left, top, width });
    setMobileActionsOpen(true);
  }

  if (selectedRoute) {
    const route = savedRouteToCycleRoute(selectedRoute);
    const waypointNumbersByInstruction = groupRouteWaypointNumbersByInstruction(
      selectedRoute.waypoints,
      route.instructions,
    );
    return (
      <section
        className="saved-route-detail panel-view"
        aria-label={selectedRoute.name}
      >
        <header
          className={[
            'saved-route-detail-toolbar',
            isRenaming ? 'is-renaming' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className="saved-route-detail-back"
            onClick={onBack}
          >
            <ChevronLeft size={17} aria-hidden="true" />
            <span>{t('myRoutes')}</span>
          </button>

          {isRenaming ? (
            <div className="saved-route-name-editor">
              <label className="sr-only" htmlFor="saved-route-name">
                {t('routeName')}
              </label>
              <input
                autoFocus
                id="saved-route-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <button
                type="button"
                disabled={
                  name.trim().length === 0 || name.trim() === selectedRoute.name
                }
                onClick={() => {
                  onRename(selectedRoute, name);
                  setIsRenaming(false);
                }}
              >
                {t('save')}
              </button>
              <button
                type="button"
                className="is-secondary"
                onClick={() => {
                  setName(selectedRoute.name);
                  setIsRenaming(false);
                }}
              >
                {t('cancel')}
              </button>
            </div>
          ) : (
            <>
              <h1 title={selectedRoute.name}>{selectedRoute.name}</h1>
              <button
                type="button"
                className="saved-route-name-edit"
                aria-label={t('editRouteName')}
                onClick={() => setIsRenaming(true)}
              >
                <Pencil size={17} aria-hidden="true" />
              </button>
            </>
          )}
        </header>

        <div className="saved-route-scroll">
          {error ? (
            <p className="saved-route-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="saved-route-summary">
            <strong>
              {formatLocalizedDistance(route.distanceMeters, locale)}
            </strong>
            <strong>
              {formatCycleRouteDuration(route.durationSeconds, locale)}
            </strong>
            <strong>
              {t(
                route.plan === 'quietest'
                  ? 'routeQuietest'
                  : route.plan === 'balanced'
                    ? 'routeBalanced'
                    : 'routeFastest',
              )}
            </strong>
          </div>

          <div className="saved-route-actions saved-route-actions-desktop">
            <button
              type="button"
              className="is-primary"
              onClick={() => onEdit(selectedRoute)}
            >
              <Pencil size={17} aria-hidden="true" />
              {t('editRoute')}
            </button>
            <button type="button" onClick={() => onExport(selectedRoute)}>
              <Download size={17} aria-hidden="true" />
              {t('exportGpx')}
            </button>
            <button type="button" onClick={() => onDuplicate(selectedRoute)}>
              <Copy size={17} aria-hidden="true" />
              {t('duplicateRoute')}
            </button>
            <button
              type="button"
              className="is-danger"
              onClick={() => onDelete(selectedRoute)}
            >
              <Trash2 size={17} aria-hidden="true" />
              {t('deleteRoute')}
            </button>
          </div>

          <div className="saved-route-mobile-actions">
            <button
              type="button"
              className="is-primary"
              onClick={() => onEdit(selectedRoute)}
            >
              <Pencil size={17} aria-hidden="true" />
              {t('editRoute')}
            </button>
            <button
              ref={mobileActionsButtonRef}
              type="button"
              aria-label={t('routeMoreActions')}
              aria-controls="saved-route-mobile-action-menu"
              aria-expanded={mobileActionsOpen}
              className="saved-route-more-actions"
              onClick={toggleMobileActions}
            >
              <Ellipsis size={19} aria-hidden="true" />
            </button>
          </div>

          {mobileActionsOpen && mobileActionsPosition
            ? createPortal(
                <div
                  ref={mobileActionsMenuRef}
                  aria-label={t('routeMoreActions')}
                  className="saved-route-mobile-action-menu"
                  id="saved-route-mobile-action-menu"
                  role="menu"
                  style={mobileActionsPosition}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMobileActions();
                      onExport(selectedRoute);
                    }}
                  >
                    <Download size={17} aria-hidden="true" />
                    {t('exportGpx')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMobileActions();
                      onDuplicate(selectedRoute);
                    }}
                  >
                    <Copy size={17} aria-hidden="true" />
                    {t('duplicateRoute')}
                  </button>
                  <div
                    aria-hidden="true"
                    className="saved-route-mobile-action-separator"
                    role="separator"
                  />
                  <button
                    type="button"
                    className="is-danger"
                    role="menuitem"
                    onClick={() => {
                      closeMobileActions();
                      onDelete(selectedRoute);
                    }}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                    {t('deleteRoute')}
                  </button>
                </div>,
                document.body,
              )
            : null}

          <h2>{t('routeDirections')}</h2>
          <ol className="saved-route-instructions">
            {route.instructions.map((instruction, instructionIndex) => (
              <li key={instruction.id}>
                <span className="saved-route-instruction-points">
                  {waypointNumbersByInstruction[instructionIndex]!.map(
                    (waypointNumber) => (
                      <span
                        aria-label={t('routePointNumber', {
                          count: waypointNumber,
                        })}
                        className={[
                          'saved-route-instruction-point',
                          waypointNumber === selectedRoute.waypoints.length
                            ? 'saved-route-instruction-point-finish'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        data-testid={`route-instruction-point-${waypointNumber}`}
                        key={waypointNumber}
                      >
                        {waypointNumber}
                      </span>
                    ),
                  )}
                </span>
                <span className="saved-route-instruction-copy">
                  {describeCycleRouteInstruction(instruction, locale)}
                </span>
                <small>
                  {formatLocalizedDistance(instruction.distanceMeters, locale)}
                </small>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section
      className="saved-routes-panel panel-view"
      aria-label={t('myRoutes')}
    >
      <header className="saved-routes-header">
        <button type="button" onClick={onBack}>
          <ChevronLeft size={17} aria-hidden="true" />
          {t('back')}
        </button>
        <span>
          <Route size={22} aria-hidden="true" />
          <strong>{t('myRoutes')}</strong>
        </span>
        <button type="button" className="saved-routes-new" onClick={onNewRoute}>
          <Plus size={17} aria-hidden="true" />
          {t('planRoute')}
        </button>
      </header>

      <div className="saved-routes-scroll">
        {loading ? <p role="status">{t('loadingSavedRoutes')}</p> : null}
        {error ? (
          <p className="saved-route-error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && routes.length === 0 ? (
          <div className="saved-routes-empty">
            <Route size={28} aria-hidden="true" />
            <h2>{t('noSavedRoutes')}</h2>
            <p>{t('savedRoutesEmptyHelp')}</p>
            <button type="button" onClick={onNewRoute}>
              <Plus size={17} aria-hidden="true" />
              {t('planRoute')}
            </button>
          </div>
        ) : null}
        {routes.length > 0 ? (
          <ol className="saved-routes-list">
            {routes.map((route) => (
              <li key={route.id}>
                <button type="button" onClick={() => onSelect(route)}>
                  <Route size={22} aria-hidden="true" />
                  <span>
                    <strong>{route.name}</strong>
                    <small>
                      {formatLocalizedDistance(route.distanceMeters, locale)} ·{' '}
                      {formatCycleRouteDuration(route.durationSeconds, locale)}{' '}
                      ·{' '}
                      {t(
                        route.plan === 'quietest'
                          ? 'routeQuietest'
                          : route.plan === 'balanced'
                            ? 'routeBalanced'
                            : 'routeFastest',
                      )}
                    </small>
                  </span>
                  <ChevronLeft
                    className="saved-route-chevron"
                    size={17}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

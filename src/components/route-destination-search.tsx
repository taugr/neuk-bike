'use client';

import {
  ChevronLeft,
  ChevronRight,
  Landmark,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import type { PlaceSearchResult } from '@/lib/geocoder';

type RouteDestinationSearchProps = {
  activeResultIndex: number;
  message: string | null;
  query: string;
  results: PlaceSearchResult[];
  routeStatus: 'error' | 'idle' | 'loaded' | 'loading' | 'missing-key';
  searchStatus: 'error' | 'idle' | 'loading';
  selectedId: string | null;
  onBack: () => void;
  onClear: () => void;
  onQueryChange: (query: string) => void;
  onRetry: () => void;
  onSearch: () => void;
  onSelect: (result: PlaceSearchResult, index: number) => void;
  onSetActiveResultIndex: (index: number) => void;
};

function splitPlaceLabel(name: string) {
  const [primary = name, ...details] = name
    .split(',')
    .map((part) => part.trim());
  return {
    details: details.join(', '),
    primary,
  };
}

export function RouteDestinationSearch({
  activeResultIndex,
  message,
  query,
  results,
  routeStatus,
  searchStatus,
  selectedId,
  onBack,
  onClear,
  onQueryChange,
  onRetry,
  onSearch,
  onSelect,
  onSetActiveResultIndex,
}: RouteDestinationSearchProps) {
  const { t } = useLanguage();
  const visibleResults = results.slice(0, 3);
  const isRouteLoading = routeStatus === 'loading' && selectedId !== null;

  return (
    <section
      className="route-destination-search panel-view"
      aria-label={t('chooseDestination')}
      data-testid="route-destination-search"
    >
      <header className="route-destination-search-header">
        <button type="button" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" />
          {t('back')}
        </button>
        <h2>{t('chooseDestination')}</h2>
        <span aria-hidden="true" />
      </header>

      <form
        className="route-destination-search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <Search size={21} aria-hidden="true" />
        <label className="sr-only" htmlFor="route-destination-query">
          {t('searchDestination')}
        </label>
        <input
          autoComplete="off"
          autoFocus
          aria-activedescendant={
            visibleResults.length > 0
              ? `route-destination-result-${activeResultIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls="route-destination-results"
          aria-expanded={visibleResults.length > 0}
          id="route-destination-query"
          name="route-destination-query"
          placeholder={t('placeOrPostcode')}
          role="combobox"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onBack();
              return;
            }
            if (visibleResults.length === 0) {
              return;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onSetActiveResultIndex(
                Math.min(activeResultIndex + 1, visibleResults.length - 1),
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              onSetActiveResultIndex(Math.max(activeResultIndex - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const result = visibleResults[activeResultIndex];
              if (result) {
                onSelect(result, activeResultIndex);
              }
            }
          }}
        />
        {query.length > 0 ? (
          <button
            aria-label={t('clearSearch')}
            className="route-destination-search-clear"
            type="button"
            onClick={onClear}
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : null}
      </form>

      {visibleResults.length > 0 ? (
        <ol
          className="route-destination-results"
          id="route-destination-results"
          aria-label={t('destinationSearchResults')}
          role="listbox"
        >
          {visibleResults.map((result, index) => {
            const label = splitPlaceLabel(result.name);
            const isActive = index === activeResultIndex;
            const isSelected = result.id === selectedId;
            return (
              <li key={result.id} role="none">
                <button
                  aria-selected={isSelected}
                  className={
                    isSelected
                      ? 'is-selected'
                      : isActive
                        ? 'is-active'
                        : undefined
                  }
                  id={`route-destination-result-${index}`}
                  role="option"
                  type="button"
                  onClick={() => onSelect(result, index)}
                >
                  <span
                    className="route-destination-result-icon"
                    aria-hidden="true"
                  >
                    <Landmark size={22} />
                  </span>
                  <span className="route-destination-result-copy">
                    <strong>{label.primary}</strong>
                    {label.details ? <small>{label.details}</small> : null}
                    {isSelected && isRouteLoading ? (
                      <span
                        className="route-destination-result-status"
                        role="status"
                      >
                        <LoaderCircle size={17} aria-hidden="true" />
                        {t('findingRoute')}
                      </span>
                    ) : null}
                  </span>
                  {!isSelected ? (
                    <ChevronRight size={20} aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {searchStatus === 'loading' ? (
        <p className="route-destination-search-message" role="status">
          <LoaderCircle size={17} aria-hidden="true" />
          {t('searchingPlaces')}
        </p>
      ) : null}
      {searchStatus === 'error' || message ? (
        <p className="route-destination-search-message" role="status">
          {message ?? t('placeSearchError')}
        </p>
      ) : null}
      {routeStatus === 'error' && selectedId ? (
        <button
          className="route-destination-retry"
          type="button"
          onClick={onRetry}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {t('retry')}
        </button>
      ) : null}

      {isRouteLoading ? (
        <p className="route-destination-comparing">
          {t('comparingRouteStyles')}
        </p>
      ) : null}
    </section>
  );
}

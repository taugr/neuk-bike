'use client';

import { useEffect } from 'react';
import {
  Download,
  HardDrive,
  MapPin,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import type {
  OfflineAreaDownloadProgress,
  OfflineAreaRecord,
} from '@/lib/offline-areas';
import {
  getOfflineAreaFreshness,
  maximumOfflineAreas,
} from '@/lib/offline-areas';

function formatBytes(bytes: number, locale: string) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)} ${unit}`;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
    : value;
}

export function OfflineAreasPanel({
  areas,
  busyAreaId,
  error,
  loading,
  message,
  progress,
  onClose,
  onDownloadNew,
  onRemove,
  onRetry,
  onView,
}: {
  areas: OfflineAreaRecord[];
  busyAreaId: string | null;
  error: string | null;
  loading: boolean;
  message: string | null;
  progress: OfflineAreaDownloadProgress | null;
  onClose: () => void;
  onDownloadNew: () => void;
  onRemove: (area: OfflineAreaRecord) => void;
  onRetry: (area: OfflineAreaRecord) => void;
  onView: (area: OfflineAreaRecord) => void;
}) {
  const { formattingLocale, t } = useLanguage();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyAreaId) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busyAreaId, onClose]);

  return (
    <div
      className="offline-areas-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyAreaId) onClose();
      }}
    >
      <section
        aria-label={t('offlineAreas')}
        aria-modal="true"
        className="offline-areas-panel"
        role="dialog"
      >
        <header className="offline-areas-header">
          <div>
            <HardDrive aria-hidden="true" size={20} />
            <div>
              <h2>{t('offlineAreas')}</h2>
              <p>{t('offlineAreasHelp')}</p>
            </div>
          </div>
          <button
            aria-label={t('close')}
            className="offline-areas-close"
            disabled={Boolean(busyAreaId)}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <button
          className="offline-areas-download-new"
          disabled={Boolean(busyAreaId) || areas.length >= maximumOfflineAreas}
          type="button"
          onClick={onDownloadNew}
        >
          <Download aria-hidden="true" size={17} />
          {t('downloadCurrentMapArea')}
        </button>
        <p className="offline-areas-state">
          {t('offlineAreaCount', {
            count: areas.length,
            maximum: maximumOfflineAreas,
          })}
        </p>

        {loading ? (
          <p className="offline-areas-state" role="status">
            {t('loadingOfflineAreas')}
          </p>
        ) : areas.length === 0 ? (
          <p className="offline-areas-state">{t('noOfflineAreas')}</p>
        ) : (
          <ul className="offline-areas-list">
            {areas.map((area) => {
              const isBusy = busyAreaId === area.id;
              const freshness = getOfflineAreaFreshness(area);
              const latestDatasetDate = (area.datasets ?? [])
                .map((dataset) => dataset.refreshedAt)
                .sort()
                .at(-1);
              return (
                <li key={area.id}>
                  <div className="offline-area-summary">
                    <MapPin aria-hidden="true" size={18} />
                    <div>
                      <strong>{area.name}</strong>
                      <span>
                        {formatBytes(area.estimatedBytes, formattingLocale)}
                      </span>
                      <small>
                        {area.status === 'complete'
                          ? t('downloadedDate', {
                              date: formatDate(
                                area.updatedAt,
                                formattingLocale,
                              ),
                            })
                          : t('incompleteOfflineArea')}
                      </small>
                      {latestDatasetDate ? (
                        <small>
                          {t('datasetDates', {
                            date: formatDate(
                              latestDatasetDate,
                              formattingLocale,
                            ),
                          })}
                        </small>
                      ) : null}
                      {freshness === 'update-recommended' ? (
                        <small>{t('offlineUpdateRecommended')}</small>
                      ) : freshness === 'stale' ? (
                        <small>{t('offlineAreaStale')}</small>
                      ) : null}
                    </div>
                  </div>
                  {isBusy && progress ? (
                    <div className="offline-area-progress" role="status">
                      <progress
                        max={progress.totalResources}
                        value={progress.completedResources}
                      />
                      <span>
                        {t('downloadProgress', {
                          completed: progress.completedResources,
                          total: progress.totalResources,
                        })}
                      </span>
                    </div>
                  ) : null}
                  <div className="offline-area-actions">
                    <button
                      disabled={Boolean(busyAreaId) || !area.center}
                      type="button"
                      onClick={() => onView(area)}
                    >
                      <MapPin aria-hidden="true" size={15} />
                      {t('viewOfflineArea')}
                    </button>
                    <button
                      disabled={Boolean(busyAreaId) || !area.bounds}
                      type="button"
                      onClick={() => onRetry(area)}
                    >
                      <RefreshCw aria-hidden="true" size={15} />
                      {t('updateOfflineArea')}
                    </button>
                    <button
                      disabled={Boolean(busyAreaId)}
                      type="button"
                      onClick={() => onRemove(area)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                      {t('removeOfflineArea')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {message ? (
          <p className="offline-areas-message" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="offline-areas-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

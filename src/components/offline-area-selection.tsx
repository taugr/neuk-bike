'use client';

import { Download, HardDrive, Info, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import type {
  OfflineAreaDownloadProgress,
  OfflineAreaPlan,
} from '@/lib/offline-areas';

function formatBytes(bytes: number, locale: string) {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 0.1) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: megabytes >= 10 ? 0 : 1,
    }).format(megabytes)} MB`;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(bytes / 1024)} KB`;
}

function datasetLabel(id: string, t: ReturnType<typeof useLanguage>['t']) {
  if (id === 'basemap') return t('mapBackground');
  if (id === 'parking') return t('categoryParking');
  if (id === 'cycling-pois') return t('cyclingPlaces');
  return t('nationalCycleNetwork');
}

export function OfflineAreaSelection({
  error,
  isDownloading,
  name,
  plan,
  progress,
  storageWarning,
  onCancel,
  onDownload,
  onNameChange,
}: {
  error: string | null;
  isDownloading: boolean;
  name: string;
  plan: OfflineAreaPlan | null;
  progress: OfflineAreaDownloadProgress | null;
  storageWarning: string | null;
  onCancel: () => void;
  onDownload: () => void;
  onNameChange: (name: string) => void;
}) {
  const { formattingLocale, t } = useLanguage();

  return (
    <section
      aria-label={t('downloadCurrentMapArea')}
      className="offline-area-selection-card"
    >
      <header>
        <div>
          <Download aria-hidden="true" size={18} />
          <strong>{t('downloadCurrentMapArea')}</strong>
        </div>
        <button aria-label={t('cancel')} type="button" onClick={onCancel}>
          <X aria-hidden="true" size={17} />
        </button>
      </header>
      <p>{t('offlineAreaSelectionHelp')}</p>
      <label>
        <span>{t('offlineAreaName')}</span>
        <input
          disabled={isDownloading}
          maxLength={80}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>

      {plan ? (
        <div className="offline-area-estimate">
          <HardDrive aria-hidden="true" size={17} />
          <div>
            <strong>
              {t('estimatedDownload', {
                size: formatBytes(plan.estimatedBytes, formattingLocale),
              })}
            </strong>
            <ul>
              {plan.datasets.map((dataset) => (
                <li key={dataset.id}>
                  {datasetLabel(dataset.id, t)} ·{' '}
                  {new Intl.DateTimeFormat(formattingLocale, {
                    dateStyle: 'medium',
                  }).format(new Date(dataset.refreshedAt))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="offline-area-checking" role="status">
          {t('checkingDownload')}
        </p>
      )}

      <p className="offline-area-limit">
        <Info aria-hidden="true" size={15} />
        {t('offlineDownloadIncludesMap')}
      </p>
      {storageWarning ? (
        <p className="offline-area-warning">{storageWarning}</p>
      ) : null}
      {error ? (
        <p className="offline-area-error" role="alert">
          {error}
        </p>
      ) : null}
      {isDownloading && progress ? (
        <div className="offline-area-selection-progress" role="status">
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
      <div className="offline-area-selection-actions">
        <button type="button" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button
          disabled={isDownloading || !plan || name.trim().length === 0}
          type="button"
          onClick={onDownload}
        >
          <Download aria-hidden="true" size={16} />
          {isDownloading ? t('downloadingArea') : t('downloadArea')}
        </button>
      </div>
    </section>
  );
}

'use client';

import { ChevronLeft, FileUp, Info, RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import { useLanguage } from '@/components/language-provider';
import { formatCycleRouteDuration } from '@/lib/cyclestreets';
import type { ParsedGpx } from '@/lib/gpx';
import { formatLocalizedDistance } from '@/lib/i18n/format';

export function GpxImportReview({
  gpx,
  onAdd,
  onBack,
  onChooseFile,
}: {
  gpx: ParsedGpx;
  onAdd: (name: string) => void;
  onBack: () => void;
  onChooseFile: (file: File) => void;
}) {
  const { locale, t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section
      className="gpx-import-review panel-view"
      aria-label={t('reviewGpx')}
    >
      <header className="gpx-import-review-header">
        <button type="button" onClick={onBack}>
          <ChevronLeft size={17} aria-hidden="true" />
          {t('myRoutes')}
        </button>
        <strong>{t('reviewGpx')}</strong>
        <span aria-hidden="true" />
      </header>

      <div className="gpx-import-review-scroll">
        <div className="gpx-import-title">
          <h1>{gpx.name}</h1>
          <small>{t('gpxStaysLocal', { file: gpx.fileName })}</small>
        </div>

        <div className="saved-route-summary">
          <strong>{formatLocalizedDistance(gpx.distanceMeters, locale)}</strong>
          <strong>
            {gpx.durationSeconds === null
              ? t('durationUnknown')
              : formatCycleRouteDuration(gpx.durationSeconds, locale)}
          </strong>
          <strong>{t('importedGpx')}</strong>
        </div>

        <p className="gpx-import-note">
          <Info size={18} aria-hidden="true" />
          <span>{t('gpxExactTrackNote')}</span>
        </p>

        <div className="gpx-import-actions">
          <button
            type="button"
            className="is-primary"
            onClick={() => onAdd(gpx.name)}
          >
            <FileUp size={17} aria-hidden="true" />
            {t('addToMyRoutes')}
          </button>
          <button type="button" onClick={() => inputRef.current?.click()}>
            <RefreshCw size={17} aria-hidden="true" />
            {t('chooseAnotherFile')}
          </button>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onChooseFile(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </section>
  );
}

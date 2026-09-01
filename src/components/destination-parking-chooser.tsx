'use client';

import {
  Bike,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleParking,
  Ruler,
  Star,
} from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import type { CycleRouteWaypoint } from '@/lib/cyclestreets';
import type { DestinationParkingCandidate } from '@/lib/destination-parking';
import {
  formatLocalizedDistance,
  formatLocalizedDuration,
} from '@/lib/i18n/format';
import { getParkingDetails } from '@/lib/parking';

export type DestinationParkingChooserProps = {
  candidates: DestinationParkingCandidate[];
  expanded: boolean;
  originalDestination: CycleRouteWaypoint;
  selectedId: string | null;
  status: 'error' | 'loading' | 'ready';
  onBack: () => void;
  onConfirm: () => void;
  onRestoreDestination: () => void;
  onSelect: (id: string) => void;
  onToggleExpanded: () => void;
};

function CandidateSummary({
  candidate,
}: {
  candidate: DestinationParkingCandidate;
}) {
  const { locale, t } = useLanguage();
  const delta = candidate.routeDurationDeltaSeconds;
  const routeCopy =
    delta === null
      ? t('routeComparisonUnavailable')
      : Math.abs(delta) < 30
        ? t('similarCyclingTime')
        : delta > 0
          ? t('addsCyclingTime', {
              time: formatLocalizedDuration(delta, locale),
            })
          : t('savesCyclingTime', {
              time: formatLocalizedDuration(Math.abs(delta), locale),
            });

  return (
    <p className="destination-parking-summary">
      <Bike size={15} aria-hidden="true" />
      {candidate.route ? (
        <>
          <span>
            {t('cyclingDistance', {
              distance: formatLocalizedDistance(
                candidate.route.distanceMeters,
                locale,
              ),
            })}
          </span>
          <span aria-hidden="true">·</span>
        </>
      ) : null}
      <span>{routeCopy}</span>
      <span aria-hidden="true">·</span>
      <Ruler size={15} aria-hidden="true" />
      <span>
        {t('straightLineFromDestination', {
          distance: formatLocalizedDistance(
            candidate.destinationDistanceMeters,
            locale,
          ),
        })}
      </span>
    </p>
  );
}

function CandidateDetails({
  candidate,
}: {
  candidate: DestinationParkingCandidate;
}) {
  const { locale } = useLanguage();
  const details = getParkingDetails(
    {
      ...candidate.point,
      distanceMeters: candidate.destinationDistanceMeters,
    },
    locale,
  ).filter(({ kind }) => kind !== 'distance');

  return (
    <span className="destination-parking-list-details">
      {details.map((detail) => (
        <span key={detail.kind}>
          <small>{detail.label}</small>
          <strong>{detail.value}</strong>
        </span>
      ))}
    </span>
  );
}

export function DestinationParkingChooser({
  candidates,
  expanded,
  originalDestination,
  selectedId,
  status,
  onBack,
  onConfirm,
  onRestoreDestination,
  onSelect,
  onToggleExpanded,
}: DestinationParkingChooserProps) {
  const { locale, t } = useLanguage();
  const selected =
    candidates.find(({ point }) => point.id === selectedId) ??
    candidates[0] ??
    null;

  return (
    <section
      className="destination-parking-chooser panel-view"
      aria-label={t('finishAtBikeParking')}
      data-testid="destination-parking-chooser"
    >
      <header className="destination-parking-header">
        <button type="button" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" />
          {t('back')}
        </button>
        <span>
          <CircleParking size={23} aria-hidden="true" />
          <span>
            <strong>{t('finishAtBikeParking')}</strong>
            <small>
              {t('nearDestination', {
                destination: originalDestination.label,
              })}
            </small>
          </span>
        </span>
        <small>{t('parkingChoicesCount', { count: candidates.length })}</small>
      </header>

      {status === 'loading' ? (
        <div className="destination-parking-loading" role="status">
          <span aria-hidden="true" />
          <p>{t('findingDestinationParking')}</p>
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="destination-parking-message" role="status">
          {t('destinationParkingError')}
        </p>
      ) : null}

      {status === 'ready' && selected ? (
        <>
          {!expanded ? (
            <>
              <div className="destination-parking-selected">
                <div className="destination-parking-rank" aria-hidden="true">
                  {candidates.findIndex(
                    ({ point }) => point.id === selected.point.id,
                  ) + 1}
                </div>
                <div className="destination-parking-copy">
                  <span className="destination-parking-selected-heading">
                    <small>{t('destinationParkingChoice')}</small>
                    <span className="destination-parking-best-badge">
                      <Star size={12} aria-hidden="true" />
                      {t('destinationBestMatch')}
                    </span>
                  </span>
                  <h2>{selected.point.name}</h2>
                  <CandidateSummary candidate={selected} />
                </div>
              </div>

              <dl className="destination-parking-details">
                {getParkingDetails(
                  {
                    ...selected.point,
                    distanceMeters: selected.destinationDistanceMeters,
                  },
                  locale,
                )
                  .filter(({ kind }) => kind !== 'distance')
                  .map((detail) => (
                    <div key={detail.kind}>
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
              </dl>
            </>
          ) : null}

          {expanded ? (
            <ol className="destination-parking-list">
              {candidates.map((candidate, index) => {
                const isSelected = candidate.point.id === selected.point.id;
                return (
                  <li key={candidate.point.id}>
                    <button
                      aria-pressed={isSelected}
                      className={isSelected ? 'is-selected' : undefined}
                      type="button"
                      onClick={() => onSelect(candidate.point.id)}
                    >
                      <span className="destination-parking-list-rank">
                        {index + 1}
                      </span>
                      <span className="destination-parking-list-copy">
                        <span className="destination-parking-list-heading">
                          <strong>{candidate.point.name}</strong>
                          {index === 0 ? (
                            <small>{t('destinationBestMatch')}</small>
                          ) : null}
                        </span>
                        <CandidateSummary candidate={candidate} />
                        <CandidateDetails candidate={candidate} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}

          <div className="destination-parking-actions">
            <button
              className="destination-parking-confirm"
              data-testid="destination-parking-confirm"
              type="button"
              onClick={onConfirm}
            >
              <CircleParking size={19} aria-hidden="true" />
              {t('finishRouteHere')}
            </button>
            <button type="button" onClick={onToggleExpanded}>
              {expanded ? (
                <ChevronUp size={18} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} aria-hidden="true" />
              )}
              {expanded ? t('showBestMatch') : t('compareAllParking')}
            </button>
            <button type="button" onClick={onRestoreDestination}>
              {t('useOriginalDestination')}
            </button>
          </div>
        </>
      ) : null}

      {status === 'ready' && candidates.length === 0 ? (
        <>
          <p className="destination-parking-message" role="status">
            {t('noDestinationParking')}
          </p>
          <button
            className="destination-parking-restore"
            type="button"
            onClick={onRestoreDestination}
          >
            {t('useOriginalDestination')}
          </button>
        </>
      ) : null}
    </section>
  );
}

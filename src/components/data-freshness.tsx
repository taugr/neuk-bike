import summary from '@/data/data-freshness-summary.json';
import { localeDetails, type AppLocale } from '@/lib/i18n/locales';
import { translate } from '@/lib/i18n/messages';

export function DataFreshness({ locale }: { locale: AppLocale }) {
  const format = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(localeDetails[locale].formattingLocale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(value))
      : translate(locale, 'dataDateUnknown');
  const stale = summary.datasets.some(
    (dataset) =>
      !dataset.oldestSourceAt ||
      Date.now() - Date.parse(dataset.oldestSourceAt) > 35 * 86_400_000,
  );
  const mixed =
    !summary.osmInputsMatch ||
    summary.datasets.some((dataset) => !dataset.complete || dataset.mixedAge);
  return (
    <section
      className="data-freshness"
      aria-label={translate(locale, 'dataFreshness')}
    >
      <h3>{translate(locale, 'dataFreshness')}</h3>
      <dl>
        {summary.datasets.map((dataset) => (
          <div key={dataset.id}>
            <dt>
              {dataset.id === 'parking' ? 'OSM · ' : ''}
              {translate(
                locale,
                dataset.id === 'parking'
                  ? 'dataParking'
                  : dataset.id === 'cycling-pois'
                    ? 'dataPlaces'
                    : 'dataNetwork',
              )}
            </dt>
            <dd>
              {format(dataset.oldestSourceAt)}
              {dataset.newestSourceAt?.slice(0, 10) !==
              dataset.oldestSourceAt?.slice(0, 10)
                ? ` – ${format(dataset.newestSourceAt)}`
                : ''}
            </dd>
          </div>
        ))}
      </dl>
      <p>{translate(locale, 'dataDatesHelp')}</p>
      {stale ? <p>{translate(locale, 'dataNeedsRefresh')}</p> : null}
      {mixed ? <p>{translate(locale, 'dataMixed')}</p> : null}
    </section>
  );
}

import { localeDetails, type AppLocale } from '@/lib/i18n/locales';
import { translate } from '@/lib/i18n/messages';

export function formatNumber(
  value: number,
  locale: AppLocale,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(
    localeDetails[locale].formattingLocale,
    options,
  ).format(value);
}

export function formatLocalizedDistance(
  distance: number | undefined,
  locale: AppLocale,
) {
  if (typeof distance !== 'number') {
    return translate(locale, 'unknownDistance');
  }

  if (distance < 1_000) {
    return translate(locale, 'metres', {
      count: formatNumber(Math.round(distance), locale),
    });
  }

  return translate(locale, 'kilometres', {
    count: formatNumber(distance / 1_000, locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }),
  });
}

export function formatLocalizedDuration(seconds: number, locale: AppLocale) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return translate(locale, 'lessThanOneMinute');
  }

  return translate(locale, 'minutes', {
    count: formatNumber(Math.max(1, Math.round(seconds / 60)), locale),
  });
}

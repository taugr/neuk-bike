import type { AppLocale } from '@/lib/i18n/locales';

const osmWeekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
type OsmWeekday = (typeof osmWeekdays)[number];

const weekdayLabels: Record<AppLocale, Record<OsmWeekday, string>> = {
  en: {
    Mo: 'Mon',
    Tu: 'Tue',
    We: 'Wed',
    Th: 'Thu',
    Fr: 'Fri',
    Sa: 'Sat',
    Su: 'Sun',
  },
  es: {
    Mo: 'lun',
    Tu: 'mar',
    We: 'mié',
    Th: 'jue',
    Fr: 'vie',
    Sa: 'sáb',
    Su: 'dom',
  },
  gd: {
    Mo: 'DiL',
    Tu: 'DiM',
    We: 'DiC',
    Th: 'Dia',
    Fr: 'Dih',
    Sa: 'DiS',
    Su: 'DiD',
  },
};

/**
 * Makes common OSM opening-hours values easier to scan without interpreting
 * whether a place is currently open. Unknown syntax is preserved verbatim.
 */
export function formatOpeningHours(value: string, locale: AppLocale): string {
  const openingHours = value.trim();

  if (!openingHours || openingHours === '24/7') {
    return openingHours;
  }

  const localizedWeekdays = weekdayLabels[locale];
  const weekdayPattern = '(Mo|Tu|We|Th|Fr|Sa|Su)';

  return openingHours
    .replace(
      new RegExp(`\\b${weekdayPattern},${weekdayPattern}\\b`, 'g'),
      '$1, $2',
    )
    .replace(
      new RegExp(`\\b${weekdayPattern}-${weekdayPattern}\\b`, 'g'),
      (_, start: string, end: string) =>
        `${localizedWeekdays[start as OsmWeekday]}–${localizedWeekdays[end as OsmWeekday]}`,
    )
    .replace(
      new RegExp(`\\b${weekdayPattern}\\b`, 'g'),
      (weekday: string) => localizedWeekdays[weekday as OsmWeekday],
    )
    .replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2');
}

export function formatOpeningHoursLines(
  value: string,
  locale: AppLocale,
): string[] {
  return value
    .split(';')
    .map((line) => formatOpeningHours(line, locale))
    .filter(Boolean);
}

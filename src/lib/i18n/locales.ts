export const supportedLocales = ['en', 'gd', 'es'] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultAppLocale: AppLocale = 'en';
export const languageStorageKey = 'cycle-parking-language';

export const localeDetails: Record<
  AppLocale,
  {
    formattingLocale: string;
    placeSearchLanguage: 'default' | 'en';
    selfName: string;
  }
> = {
  en: {
    formattingLocale: 'en-GB',
    placeSearchLanguage: 'en',
    selfName: 'English',
  },
  gd: {
    formattingLocale: 'gd-GB',
    placeSearchLanguage: 'default',
    selfName: 'Gàidhlig',
  },
  es: {
    formattingLocale: 'es-ES',
    placeSearchLanguage: 'default',
    selfName: 'Español',
  },
};

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === 'string' && supportedLocales.includes(value as AppLocale)
  );
}

export function localeFromLanguageTag(value: string): AppLocale | null {
  const primaryLanguage = value.trim().toLowerCase().split(/[-_]/)[0];
  return isAppLocale(primaryLanguage) ? primaryLanguage : null;
}

export function resolveAppLocale(
  storedLocale: string | null | undefined,
  browserLanguages: readonly string[] = [],
): AppLocale {
  if (isAppLocale(storedLocale)) {
    return storedLocale;
  }

  for (const language of browserLanguages) {
    const locale = localeFromLanguageTag(language);
    if (locale) {
      return locale;
    }
  }

  return defaultAppLocale;
}

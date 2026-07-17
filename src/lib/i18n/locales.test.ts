import { describe, expect, it } from 'vitest';
import {
  localeDetails,
  localeFromLanguageTag,
  resolveAppLocale,
  supportedLocales,
} from '@/lib/i18n/locales';
import { getMessageCatalogue } from '@/lib/i18n/messages';

function placeholders(message: string) {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('language support', () => {
  it('resolves stored and browser language preferences', () => {
    expect(resolveAppLocale('es', ['gd-GB'])).toBe('es');
    expect(resolveAppLocale('unsupported', ['fr-FR', 'gd-GB'])).toBe('gd');
    expect(resolveAppLocale(null, ['es-MX'])).toBe('es');
    expect(resolveAppLocale(null, ['fr-FR'])).toBe('en');
    expect(localeFromLanguageTag('GD_gb')).toBe('gd');
  });

  it('defines formatting and place-search preferences for every locale', () => {
    expect(localeDetails.en).toMatchObject({
      formattingLocale: 'en-GB',
      placeSearchLanguages: 'en',
    });
    expect(localeDetails.gd.placeSearchLanguages).toBe('gd,en');
    expect(localeDetails.es.placeSearchLanguages).toBe('es,en');
  });

  it('keeps every catalogue complete with matching placeholders', () => {
    const english = getMessageCatalogue('en');
    const keys = Object.keys(english) as (keyof typeof english)[];

    for (const locale of supportedLocales) {
      const catalogue = getMessageCatalogue(locale);
      expect(Object.keys(catalogue)).toEqual(keys);
      for (const key of keys) {
        expect(catalogue[key].trim()).not.toBe('');
        expect(placeholders(catalogue[key])).toEqual(
          placeholders(english[key]),
        );
      }
    }
  });
});

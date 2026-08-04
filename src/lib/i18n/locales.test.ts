import { describe, expect, it } from 'vitest';
import {
  localeDetails,
  localeFromLanguageTag,
  resolveAppLocale,
  supportedLocales,
} from '@/lib/i18n/locales';
import { getMessageCatalogue, translate } from '@/lib/i18n/messages';

function placeholders(message: string) {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('language support', () => {
  it('resolves stored and browser language preferences', () => {
    expect(resolveAppLocale('es', ['gd-GB'])).toBe('es');
    expect(resolveAppLocale('unsupported', ['fr-FR', 'gd-GB'])).toBe('gd');
    expect(resolveAppLocale(null, ['es-MX'])).toBe('es');
    expect(resolveAppLocale(null, ['hy-AM'])).toBe('hy');
    expect(resolveAppLocale(null, ['fr-FR'])).toBe('en');
    expect(localeFromLanguageTag('GD_gb')).toBe('gd');
  });

  it('defines formatting and place-search preferences for every locale', () => {
    expect(localeDetails.en).toMatchObject({
      formattingLocale: 'en-GB',
      placeSearchLanguage: 'en',
    });
    expect(localeDetails.gd.placeSearchLanguage).toBe('default');
    expect(localeDetails.es.placeSearchLanguage).toBe('default');
    expect(localeDetails.hy).toMatchObject({
      formattingLocale: 'hy-AM',
      placeSearchLanguage: 'default',
      selfName: 'Հայերեն',
    });
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

  it('uses a compact Armenian label for the device theme', () => {
    expect(getMessageCatalogue('hy').system).toBe('Սարքի');
  });

  it('uses a compact Armenian label for a parking stand', () => {
    expect(getMessageCatalogue('hy').typeStands).toBe('Կանգնակ');
  });

  it('uses the Armenian name for a drinking-water fountain', () => {
    expect(getMessageCatalogue('hy').drinkingWater).toBe('Պուլպուլակ');
  });

  it('uses a compact Gaelic label for starting directions', () => {
    expect(getMessageCatalogue('gd').startRoute).toBe('Tòisich');
  });

  it('localizes generated route and duplicate names', () => {
    expect(
      translate('gd', 'routeNameBetween', { start: 'A', finish: 'B' }),
    ).toBe('A gu B');
    expect(translate('es', 'routeCopyName', { name: 'Ruta' })).toBe(
      'Copia de Ruta',
    );
    expect(translate('hy', 'routeCopyName', { name: 'Երթուղի' })).toBe(
      'Երթուղի-ի պատճեն',
    );
  });
});

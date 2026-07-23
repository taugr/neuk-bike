import { describe, expect, it } from 'vitest';
import {
  formatOpeningHours,
  formatOpeningHoursLines,
} from '@/lib/opening-hours';

describe('formatOpeningHours', () => {
  it('formats common weekday and time ranges for scanning', () => {
    expect(formatOpeningHours('We-Sa 13:00-18:00', 'en')).toBe(
      'Wed–Sat 13:00–18:00',
    );
    expect(formatOpeningHours('Mo-Fr 09:00-17:00', 'en')).toBe(
      'Mon–Fri 09:00–17:00',
    );
  });

  it('localizes weekday abbreviations', () => {
    expect(formatOpeningHours('We-Sa 13:00-18:00', 'gd')).toBe(
      'DiC–DiS 13:00–18:00',
    );
    expect(formatOpeningHours('Mo-Fr 09:00-17:00', 'es')).toBe(
      'lun–vie 09:00–17:00',
    );
  });

  it('keeps always-open and unfamiliar syntax intact', () => {
    expect(formatOpeningHours('24/7', 'en')).toBe('24/7');
    expect(formatOpeningHours('sunrise-sunset; PH off', 'en')).toBe(
      'sunrise-sunset; PH off',
    );
  });

  it('preserves lists and closures while improving known parts', () => {
    expect(formatOpeningHours('Mo-Fr 09:00-17:00; Sa,Su off', 'en')).toBe(
      'Mon–Fri 09:00–17:00; Sat, Sun off',
    );
  });

  it('splits multi-clause schedules into display lines', () => {
    expect(
      formatOpeningHoursLines('Mo-Fr 09:30-18:00; Sa,Su 10:00-18:00', 'en'),
    ).toEqual(['Mon–Fri 09:30–18:00', 'Sat, Sun 10:00–18:00']);
    expect(formatOpeningHoursLines('We-Sa 13:00-18:00', 'en')).toEqual([
      'Wed–Sat 13:00–18:00',
    ]);
  });
});

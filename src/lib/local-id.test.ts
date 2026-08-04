import { describe, expect, it, vi } from 'vitest';
import { createLocalId } from '@/lib/local-id';

describe('local IDs', () => {
  it('uses randomUUID when the browser provides it', () => {
    const randomUUID = vi.fn(() => 'native-uuid');

    expect(createLocalId({ randomUUID })).toBe('native-uuid');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates an RFC 4122 version 4 UUID from getRandomValues', () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.set(Array.from({ length: 16 }, (_, index) => index));
      return values;
    });

    expect(createLocalId({ getRandomValues })).toBe(
      '00010203-0405-4607-8809-0a0b0c0d0e0f',
    );
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it('still creates distinct local IDs without Web Crypto', () => {
    const first = createLocalId({});
    const second = createLocalId({});

    expect(first).toMatch(/^local-/);
    expect(second).toMatch(/^local-/);
    expect(second).not.toBe(first);
  });
});

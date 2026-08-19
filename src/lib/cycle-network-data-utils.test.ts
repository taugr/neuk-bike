import { describe, expect, it } from 'vitest';
import { createCycleNetworkManifestReleaseId } from '../../scripts/cycle-network-data-utils.mjs';

describe('cycle-network data generation utilities', () => {
  it('derives a stable release ID from chunk metadata', () => {
    const chunks = {
      '10/1/1': { byteLength: 200, count: 2, path: 'chunks/one.json' },
    };

    expect(
      createCycleNetworkManifestReleaseId({ chunks, recordCount: 2 }),
    ).toBe(createCycleNetworkManifestReleaseId({ chunks, recordCount: 2 }));
    expect(
      createCycleNetworkManifestReleaseId({ chunks, recordCount: 2 }),
    ).not.toBe(createCycleNetworkManifestReleaseId({ chunks, recordCount: 3 }));
  });
});

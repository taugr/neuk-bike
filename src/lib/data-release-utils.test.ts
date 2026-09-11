import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  promoteStagedPaths,
  summarizeSourceDates,
} from '../../scripts/data-release-utils.mjs';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('data release promotion', () => {
  it('restores the entire previous set when a later file cannot be installed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neuk-promotion-'));
    temporary.push(root);
    const stage = join(root, 'stage');
    const destination = join(root, 'live');
    await mkdir(stage);
    await mkdir(destination);
    for (const name of ['manifest', 'report']) {
      await writeFile(join(stage, name), `new-${name}`);
      await writeFile(join(destination, name), `old-${name}`);
    }
    const move = async (from: string, to: string) => {
      if (from === join(stage, 'report')) throw new Error('disk failure');
      await rename(from, to);
    };
    await expect(
      promoteStagedPaths(stage, destination, ['manifest', 'report'], move),
    ).rejects.toThrow('disk failure');
    for (const name of ['manifest', 'report']) {
      expect(await readFile(join(destination, name), 'utf8')).toBe(
        `old-${name}`,
      );
      expect(await readFile(join(stage, name), 'utf8')).toBe(`new-${name}`);
    }
  });

  it('keeps the prior file available after successful promotion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neuk-promotion-'));
    temporary.push(root);
    await mkdir(join(root, 'stage'));
    await mkdir(join(root, 'live'));
    await writeFile(join(root, 'stage', 'report'), 'new');
    await writeFile(join(root, 'live', 'report'), 'old');
    await promoteStagedPaths(join(root, 'stage'), join(root, 'live'), [
      'report',
    ]);
    expect(await readFile(join(root, 'live', 'report'), 'utf8')).toBe('new');
    expect(
      await readFile(join(root, 'stage', '.previous', 'report'), 'utf8'),
    ).toBe('old');
  });
});

describe('source freshness', () => {
  it('exposes a mixed-age release using the oldest input rather than the rebuild date', () => {
    const summary = summarizeSourceDates(
      [
        { id: 'a', sourceTimestamp: '2026-07-14T00:00:00Z' },
        { id: 'b', sourceTimestamp: '2026-09-11T00:00:00Z' },
      ],
      ['a', 'b'],
    );
    expect(summary).toMatchObject({
      complete: true,
      mixedAge: true,
      oldestSourceAt: '2026-07-14T00:00:00Z',
    });
  });
  it('rejects missing, duplicate, or undated inputs', () => {
    expect(
      summarizeSourceDates([{ id: 'a', sourceTimestamp: null }], ['a', 'b']),
    ).toMatchObject({
      complete: false,
      missingInputs: ['b'],
      unknownTimestampInputs: ['a'],
    });
    expect(
      summarizeSourceDates(
        [
          { id: 'a', sourceTimestamp: '2026-09-11' },
          { id: 'a', sourceTimestamp: '2026-09-11' },
        ],
        ['a'],
      ),
    ).toHaveProperty('complete', false);
  });
});

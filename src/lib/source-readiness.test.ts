import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForSources } from '../../scripts/source-readiness.mjs';
import type { SourceReadinessStatus } from '../../scripts/source-readiness.mjs';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function fixture() {
  let time = Date.parse('2026-11-01T09:25:00Z');
  const statuses: SourceReadinessStatus[] = [];
  const sleep = vi.fn(async (ms: number) => {
    time += ms;
  });
  return {
    statuses,
    settings: {
      now: () => time,
      sleep,
      log: vi.fn(),
      timeoutMs: 1_000,
      intervalMs: 400,
      onStatus: async (status: SourceReadinessStatus) => {
        statuses.push(status);
      },
    },
  };
}

const pending = () =>
  Object.assign(new Error('Dated publication not ready'), {
    retryable: true,
    sourceId: 'ireland-and-northern-ireland',
  });

describe('bounded upstream readiness', () => {
  it('preserves installed files and writes diagnostics when the real refresh cannot pin a complete plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neuk-readiness-'));
    temporary.push(root);
    const repo = fileURLToPath(new URL('../../', import.meta.url));
    await cp(join(repo, 'scripts'), join(root, 'scripts'), { recursive: true });
    await symlink(join(repo, 'node_modules'), join(root, 'node_modules'));
    await mkdir(join(root, 'public/data'), { recursive: true });
    await mkdir(join(root, 'src/data'), { recursive: true });
    const paths = [
      'public/data/installed-release',
      ...[
        'cycle-parking.json',
        'cycle-parking-report.json',
        'cycling-poi-report.json',
        'cycle-network-report.json',
      ].map((name) => `src/data/${name}`),
    ];
    for (const path of paths)
      await writeFile(join(root, path), `previous ${path}`);
    const cutoff =
      new Date(Date.now() - 86_400_000).toISOString().slice(0, 19) + 'Z';
    const suffix = cutoff.slice(2, 10).replaceAll('-', '');
    const row = `<tr><td><a href="scotland-${suffix}.osm.pbf">extract</a></td><td>2026-11-01 02:00</td><td>123</td></tr>`;
    const publication = `<li><a href="scotland-latest.osm.pbf">latest</a> contains all OSM data up to ${cutoff}</li>${row}${row}`;
    await writeFile(
      join(root, 'upstream.mjs'),
      `globalThis.fetch = async (url) => {
      if (!String(url).endsWith('/scotland.html')) throw new Error('Unexpected download before readiness');
      return new Response(${JSON.stringify(publication)}, { headers: { 'content-type': 'text/html' } });
    };`,
    );
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        join(root, 'upstream.mjs'),
        join(root, 'scripts/refresh-data-release.mjs'),
        'all',
        '--wait-for-sources',
      ],
      {
        cwd: root,
        env: { ...process.env, GIT_DIR: join(repo, '.git') },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(result.status, result.stderr).toBe(1);
    for (const path of paths)
      expect(await readFile(join(root, path), 'utf8')).toBe(`previous ${path}`);
    expect(
      JSON.parse(
        await readFile(
          join(root, '.cache/review/source-readiness.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({
      state: 'failed',
      sourceId: 'scotland',
      retryable: false,
    });
    expect(
      JSON.parse(
        await readFile(
          join(root, '.cache/review/refresh-failure.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({ previousReleasePreserved: true, sourceId: 'scotland' });
    await expect(
      readFile(join(root, '.cache/data-refresh.lock')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('returns only a successful complete check after waiting', async () => {
    const f = fixture();
    const complete = { sources: ['scotland', 'ireland'] };
    const check = vi
      .fn()
      .mockRejectedValueOnce(pending())
      .mockResolvedValue(complete);
    await expect(waitForSources(check, f.settings)).resolves.toBe(complete);
    expect(f.settings.sleep).toHaveBeenCalledExactlyOnceWith(400);
    expect(f.statuses.map((status) => status.state)).toEqual([
      'waiting',
      'ready',
    ]);
    expect(f.statuses[0]).toMatchObject({
      sourceId: 'ireland-and-northern-ireland',
      attempt: 1,
    });
  });

  it('stops at the deadline without returning partial results or checking again', async () => {
    const f = fixture();
    const check = vi.fn().mockRejectedValue(pending());
    await expect(waitForSources(check, f.settings)).rejects.toThrow(
      'not ready',
    );
    expect(check).toHaveBeenCalledTimes(3);
    expect(f.settings.sleep.mock.calls.map(([ms]) => ms)).toEqual([
      400, 400, 200,
    ]);
    expect(f.statuses.at(-1)).toMatchObject({
      state: 'failed',
      timedOut: true,
      nextCheckAt: undefined,
    });
  });

  it('fails immediately on an integrity error', async () => {
    const f = fixture();
    const check = vi
      .fn()
      .mockRejectedValue(new Error('PBF timestamp mismatch'));
    await expect(waitForSources(check, f.settings)).rejects.toThrow(
      'timestamp mismatch',
    );
    expect(check).toHaveBeenCalledTimes(1);
    expect(f.settings.sleep).not.toHaveBeenCalled();
    expect(f.statuses.at(-1)).toMatchObject({
      state: 'failed',
      timedOut: false,
      retryable: false,
    });
  });

  it('does not sleep again when the failed request already consumed the wait window', async () => {
    const f = fixture();
    const check = vi.fn(async () => {
      await f.settings.sleep(1_001);
      throw pending();
    });
    await expect(waitForSources(check, f.settings)).rejects.toThrow(
      'not ready',
    );
    expect(check).toHaveBeenCalledTimes(1);
    expect(f.settings.sleep).toHaveBeenCalledTimes(1);
    expect(f.statuses.at(-1)).toMatchObject({
      state: 'failed',
      timedOut: true,
    });
  });

  it('accepts a ready source set without sleeping', async () => {
    const f = fixture();
    await expect(
      waitForSources(async () => 'complete', f.settings),
    ).resolves.toBe('complete');
    expect(f.settings.sleep).not.toHaveBeenCalled();
  });
});

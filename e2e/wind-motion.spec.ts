import { expect, test } from '@playwright/test';
import {
  enableWindMap,
  installWindJourneyFixture,
  openWindJourney,
} from './wind-fixtures';

test.use({ hasTouch: true, reducedMotion: 'no-preference' });

for (const width of [390, 1440]) {
  test(`wind stays attached throughout sustained ${width === 390 ? 'touch' : 'mouse'} pan and inertia at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installWindJourneyFixture(page);
    await openWindJourney(page);
    await enableWindMap(page);
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    const reference = page.locator('.route-waypoint-marker').first();
    let last = '',
      stableSince = Date.now();
    await expect
      .poll(async () => {
        const next = await reference.getAttribute('style');
        if (next !== last) stableSince = Date.now();
        last = next ?? '';
        return Date.now() - stableSince;
      })
      .toBeGreaterThan(400);
    await expect(page.locator('.wind-map-speed').first()).toHaveText(
      '15.8 km/h',
    );
    await expect(page.getByTestId('wind-overlay')).toContainText(
      'Area-wide estimate',
    );
    await page.evaluate(() => {
      const center = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      };
      const reference = document.querySelector('.route-waypoint-marker')!;
      const origin = center(reference);
      const anchors = new Map(
        [...document.querySelectorAll<HTMLElement>('.wind-map-arrow')].map(
          (el) => [
            el.dataset.anchor,
            {
              ...center(el),
              node: el,
              point: [el.dataset.longitude, el.dataset.latitude],
            },
          ],
        ),
      );
      const state = {
        done: false,
        released: false,
        samples: [] as {
          x: number;
          y: number;
          error: number;
          replaced: number;
          movedAnchor: boolean;
          released: boolean;
        }[],
      };
      Object.assign(window, { windMotion: state });
      document.addEventListener(
        'mouseup',
        () => {
          state.released = true;
        },
        { once: true, capture: true },
      );
      document.addEventListener(
        'touchend',
        () => {
          state.released = true;
        },
        { once: true, capture: true },
      );
      function sample() {
        const ref = center(reference),
          errors: number[] = [];
        let replaced = 0,
          movedAnchor = false;
        for (const el of document.querySelectorAll<HTMLElement>(
          '.wind-map-arrow',
        )) {
          const a = anchors.get(el.dataset.anchor);
          if (!a) continue;
          const p = center(el);
          errors.push(
            Math.hypot(
              p.x - a.x - (ref.x - origin.x),
              p.y - a.y - (ref.y - origin.y),
            ),
          );
          if (a.node !== el) replaced++;
          if (
            a.point[0] !== el.dataset.longitude ||
            a.point[1] !== el.dataset.latitude
          )
            movedAnchor = true;
        }
        state.samples.push({
          ...ref,
          error: errors.length ? Math.max(...errors) : Infinity,
          replaced,
          movedAnchor,
          released: state.released,
        });
        if (!state.done) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
    const x = box.x + box.width * 0.28,
      y = box.y + 180;
    const cdp = await page.context().newCDPSession(page);
    if (width === 390)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
    else {
      await page.mouse.move(x, y);
      await page.mouse.down();
    }
    for (let i = 1; i <= 45; i++) {
      const point = {
        x:
          x +
          (width === 390 ? 100 : 200) *
            (i <= 35 ? (0.45 * i) / 35 : 0.45 + (0.55 * (i - 35)) / 10),
        y: y + 40 * Math.sin(((i / 45) * Math.PI) / 2),
      };
      if (width === 390)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [point],
        });
      else await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(i > 35 ? 5 : 12);
    }
    // Release without an evaluate round-trip draining the velocity window.
    for (const extra of [25, 50]) {
      const point = { x: x + (width === 390 ? 100 : 200) + extra, y: y + 40 };
      if (width === 390)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [point],
        });
      else await page.mouse.move(point.x, point.y);
    }
    if (width === 390)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    else await page.mouse.up();
    await page.waitForTimeout(700);
    const samples = await page.evaluate(() => {
      const state = (
        window as unknown as {
          windMotion: {
            done: boolean;
            samples: {
              x: number;
              y: number;
              error: number;
              replaced: number;
              movedAnchor: boolean;
              released: boolean;
            }[];
          };
        }
      ).windMotion;
      state.done = true;
      return state.samples;
    });
    const moving = samples.filter(
      (s, i) =>
        i > 0 &&
        Math.hypot(s.x - samples[i - 1].x, s.y - samples[i - 1].y) > 0.05,
    );
    expect(moving.length).toBeGreaterThan(20);
    expect(moving.some((s) => s.released)).toBe(true);
    // The native waypoint rounds its resting position to pixels; the wind
    // marker retains fractional pixels. Allow that <1.5px rounding difference,
    // never a deferred camera frame (the old renderer drifted 5–21px).
    expect(Math.max(...moving.map((s) => s.error))).toBeLessThan(1.5);
    expect(moving.every((s) => s.replaced === 0 && !s.movedAnchor)).toBe(true);
    await testInfo.attach('continuous-motion-samples', {
      body: JSON.stringify(samples),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('after-inertia.png') });
  });
}

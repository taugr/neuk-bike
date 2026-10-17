import { expect, test } from '@playwright/test';
import {
  enableWindMap,
  installWindJourneyFixture,
  openWindJourney,
} from './wind-fixtures';

for (const width of [1440, 390]) {
  test(`wind geographic anchors follow every pan phase at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installWindJourneyFixture(page);
    await openWindJourney(page);
    await enableWindMap(page);
    const arrows = page.locator('.wind-map-arrow');
    await expect(arrows.first()).toBeVisible();
    const read = () =>
      arrows.evaluateAll((nodes) =>
        nodes.flatMap((node) => {
          const el = node as HTMLElement;
          const rect = el.getBoundingClientRect();
          const parent = el.closest('.maplibregl-map');
          // The buffered grid can reconcile between locator resolution and
          // evaluation. Ignore detached nodes and distant offscreen buffers.
          if (!parent) return [];
          const container = parent.getBoundingClientRect();
          if (
            rect.right < container.left - 200 ||
            rect.left > container.right + 200 ||
            rect.bottom < container.top - 200 ||
            rect.top > container.bottom + 200 ||
            getComputedStyle(el).visibility === 'hidden'
          )
            return [];
          return {
            id: el.dataset.anchor!,
            lng: Number(el.dataset.longitude),
            lat: Number(el.dataset.latitude),
            x: rect.x + rect.width / 2 - container.x,
            y: rect.y + rect.height / 2 - container.y,
          };
        }),
      );
    // Route framing animates on first load. Establish a stationary baseline
    // before testing a user drag, rather than mixing the two camera motions.
    let last = await read();
    let stableSince = Date.now();
    await expect
      .poll(
        async () => {
          const next = await read();
          if (JSON.stringify(next) !== JSON.stringify(last))
            stableSince = Date.now();
          last = next;
          return Date.now() - stableSince;
        },
        { intervals: [100] },
      )
      .toBeGreaterThan(400);
    const before = await read();
    const canvas = page.locator('.maplibregl-canvas');
    const box = (await canvas.boundingBox())!;
    const x = box.x + box.width * 0.5,
      y = box.y + Math.min(200, box.height * 0.25);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const [dx, dy] of [
      [35, 15],
      [70, 30],
    ]) {
      await page.mouse.move(x + dx, y + dy, { steps: 8 });
      // Hold the drag so inertia cannot masquerade as settled movement.
      await expect
        .poll(async () => {
          const current = await read();
          const common = before.flatMap((a) => {
            const b = current.find((b) => b.id === a.id);
            if (!b) return [];
            expect([b.lng, b.lat]).toEqual([a.lng, a.lat]);
            return [Math.hypot(b.x - a.x - dx, b.y - a.y - dy)];
          });
          return common.length >= 2 ? Math.max(...common) : Infinity;
        })
        .toBeLessThan(1);
    }
    // A held pointer release avoids kinetic pan; check the same anchors after.
    await page.waitForTimeout(200);
    await page.mouse.up();
    const after = await read();
    const common = before.filter((a) => after.some((b) => b.id === a.id));
    expect(common.length).toBeGreaterThanOrEqual(2);
    for (const a of common) {
      const b = after.find((b) => b.id === a.id)!;
      expect(Math.hypot(b.x - a.x - 70, b.y - a.y - 30)).toBeLessThan(1);
    }
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => {
        const zoomed = await read();
        const pair = after.flatMap((a) => {
          const b = zoomed.find((b) => b.id === a.id);
          return b ? [{ a, b }] : [];
        });
        if (pair.length < 2) return 0;
        const [p, q] = pair;
        return (
          Math.hypot(p.b.x - q.b.x, p.b.y - q.b.y) /
          Math.hypot(p.a.x - q.a.x, p.a.y - q.a.y)
        );
      })
      .toBeCloseTo(2, 3);
    await expect(arrows.first()).toHaveCSS('width', '28px');
    const beforeRotation = await read();
    await canvas.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect
      .poll(async () =>
        Number(await arrows.first().getAttribute('data-bearing')),
      )
      .toBeCloseTo(359, 2);
    const positions = await read();
    const rotated = beforeRotation.flatMap((a) => {
      const b = positions.find((b) => b.id === a.id);
      return b ? [{ a, b }] : [];
    });
    expect(rotated.length).toBeGreaterThanOrEqual(2);
    const [p, q] = rotated;
    const dx = p.a.x - q.a.x,
      dy = p.a.y - q.a.y;
    const angle = (15 * Math.PI) / 180;
    expect(
      Math.hypot(
        p.b.x - q.b.x - (dx * Math.cos(angle) + dy * Math.sin(angle)),
        p.b.y - q.b.y - (-dx * Math.sin(angle) + dy * Math.cos(angle)),
      ),
    ).toBeLessThan(1);
    let minimumSeparation = Infinity;
    for (let i = 0; i < positions.length; i++)
      for (let j = i + 1; j < positions.length; j++)
        minimumSeparation = Math.min(
          minimumSeparation,
          Math.hypot(
            positions[i].x - positions[j].x,
            positions[i].y - positions[j].y,
          ),
        );
    expect(minimumSeparation).toBeGreaterThanOrEqual(54.9);
    await page.screenshot({
      path: testInfo.outputPath(`anchored-${width}.png`),
    });
  });
}

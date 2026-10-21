import { expect, test, type Page } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.beforeEach(async ({ context, page }) => {
  await installOfflineMapFixture(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();
});

async function drag(
  page: Page,
  browserName: string,
  x: number,
  fromY: number,
  toY: number,
) {
  if (browserName === 'chromium') {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: fromY }],
    });
    for (let step = 1; step <= 10; step++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: fromY + ((toY - fromY) * step) / 10 }],
      });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
  } else {
    // WebKit exposes touch taps but no touch-drag API. Exercise the same pointer
    // handlers with a captured pointer; physical Safari gestures remain a device check.
    await page.mouse.move(x, fromY);
    await page.mouse.down();
    await page.mouse.move(x, toY, { steps: 10 });
    await page.mouse.up();
  }
}

test('the compact tray handle receives touches without stealing content controls', async ({
  page,
}) => {
  const pane = page.locator('.control-pane');
  const grip = page.locator('.mobile-sheet-grip');
  for (const state of ['expanded', 'collapsed']) {
    await expect(pane).toHaveAttribute('data-mobile-sheet-state', state);
    const hitArea = await grip.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const panel = element.parentElement!.getBoundingClientRect();
      const missed = [];
      // Stay inside rounded corners but cover both edges and the full height.
      for (const x of [
        bounds.left + 24,
        (bounds.left + bounds.right) / 2,
        bounds.right - 24,
      ])
        for (let y = bounds.top + 1; y < bounds.bottom - 1; y++)
          if (!element.contains(document.elementFromPoint(x, y)))
            missed.push({ x, y });
      return {
        height: bounds.height,
        width: bounds.width,
        panelWidth: panel.width,
        top: bounds.top - panel.top,
        missed,
      };
    });
    expect(hitArea.height).toBe(36);
    expect(hitArea.width).toBeGreaterThanOrEqual(hitArea.panelWidth - 2);
    expect(hitArea.top).toBeGreaterThanOrEqual(0);
    expect(hitArea.missed).toEqual([]);
    const bounds = (await grip.boundingBox())!;
    await page.touchscreen.tap(
      state === 'expanded' ? bounds.x + 25 : bounds.x + bounds.width - 25,
      bounds.y + bounds.height - 7,
    );
  }
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  await page
    .getByRole('button', { name: 'Parking filters', exact: true })
    .click();
  await expect(pane).toHaveAttribute('data-panel-view', 'filters');
});

test('dragging from the header edges keeps tracking outside its bounds', async ({
  page,
  browserName,
}) => {
  const pane = page.locator('.control-pane');
  const grip = page.locator('.mobile-sheet-grip');
  let bounds = (await grip.boundingBox())!;
  await drag(
    page,
    browserName,
    bounds.x + 25,
    bounds.y + bounds.height - 6,
    bounds.y + 260,
  );
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'collapsed');
  bounds = (await grip.boundingBox())!;
  await drag(
    page,
    browserName,
    bounds.x + bounds.width - 25,
    bounds.y + bounds.height - 6,
    bounds.y - 260,
  );
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  await expect(pane).not.toHaveAttribute('data-mobile-sheet-dragging', 'true');
});

test('scrolling results leaves the tray expanded and its header fixed', async ({
  page,
  browserName,
}) => {
  const pane = page.locator('.control-pane');
  const list = page.locator('.parking-list-scroll');
  const headerBefore = (await page
    .locator('.mobile-sheet-grip')
    .boundingBox())!;
  const bounds = (await list.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height - 20;
  if (browserName === 'chromium')
    await drag(page, browserName, x, y, bounds.y + 20);
  else {
    // Mobile WebKit exposes neither touch drags nor wheel input. Verify its
    // scrolled layout; the Chromium branch above exercises native touch scrolling.
    await list.evaluate((element) => element.scrollBy(0, 250));
  }
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(20);
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  const headerAfter = (await page.locator('.mobile-sheet-grip').boundingBox())!;
  expect(headerAfter.y).toBeCloseTo(headerBefore.y, 1);
});

test('the collapsed summary stays above the home indicator inset', async ({
  page,
  browserName,
}) => {
  const pane = page.locator('.control-pane');
  await pane.evaluate((element) =>
    (element as HTMLElement).style.setProperty(
      '--mobile-sheet-bottom-padding',
      '34px',
    ),
  );
  await page.getByRole('button', { name: 'Collapse results panel' }).tap();
  const bounds = (await pane.boundingBox())!;
  const summary = (await page
    .locator('.finder-panel-content > .mobile-sheet-summary')
    .boundingBox())!;
  expect(summary.y + summary.height).toBeLessThanOrEqual(
    bounds.y + bounds.height - 34,
  );
  const grip = (await page.locator('.mobile-sheet-grip').boundingBox())!;
  expect(grip.height).toBe(36);
  await drag(
    page,
    browserName,
    grip.x + 25,
    grip.y + grip.height - 6,
    grip.y - 260,
  );
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
});

test('nearby and saved titles drag the compact tray while header buttons still work', async ({
  page,
  browserName,
}) => {
  const pane = page.locator('.control-pane');
  const grip = page.locator('.mobile-sheet-grip');
  const title = page.locator('.list-heading h2');
  await title.tap();
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  const button = (await page.getByTestId('open-my-neuks').boundingBox())!;
  await drag(page, browserName, button.x + 20, button.y + 15, button.y + 275);
  await expect(pane).toHaveAttribute('data-parking-view', 'nearby');
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');

  for (const view of ['nearby', 'saved']) {
    await expect(pane).toHaveAttribute('data-parking-view', view);
    // Both headings exist briefly during the view transition.
    await expect(page.locator('.parking-view-content')).toHaveCount(1);
    const bounds = (await title.boundingBox())!;
    await drag(page, browserName, bounds.x + 30, bounds.y + 15, bounds.y + 275);
    await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'collapsed');
    const summary = (await page
      .locator('.finder-panel-content > .mobile-sheet-summary')
      .boundingBox())!;
    await drag(
      page,
      browserName,
      summary.x + 30,
      summary.y + 15,
      summary.y - 245,
    );
    await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
    await expect(pane).not.toHaveAttribute(
      'data-mobile-sheet-dragging',
      'true',
    );
    expect((await grip.boundingBox())!.height).toBe(36);

    // A title drag must not swallow the next handle tap or keyboard activation.
    await grip.tap();
    await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'collapsed');
    await grip.press('Enter');
    await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
    await page.locator('.parking-view-button').tap();
  }
  await expect(pane).toHaveAttribute('data-parking-view', 'nearby');
});

test('filter and detail titles drag without capturing their buttons', async ({
  page,
  browserName,
}) => {
  const pane = page.locator('.control-pane');
  await page
    .getByRole('button', { name: 'Parking filters', exact: true })
    .tap();
  const filters = page.getByRole('region', {
    name: 'Parking filters',
    exact: true,
  });
  const filterTitle = (await filters.getByRole('heading').boundingBox())!;
  await drag(
    page,
    browserName,
    filterTitle.x + 20,
    filterTitle.y + 10,
    filterTitle.y + 270,
  );
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'collapsed');
  const filterSummary = (await filters
    .locator('.mobile-sheet-summary')
    .boundingBox())!;
  await drag(
    page,
    browserName,
    filterSummary.x + 20,
    filterSummary.y + 15,
    filterSummary.y - 245,
  );
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  await filters.getByRole('button', { name: 'Back', exact: true }).tap();
  await expect(pane).toHaveAttribute('data-panel-view', 'list');

  const row = page.locator('[data-testid^="parking-row-"]').first();
  const parkingName = (await row.locator('strong').innerText()).trim();
  await row.tap();
  await page
    .getByRole('button', { name: `View details for ${parkingName}` })
    .tap();
  const details = page.getByRole('region', {
    name: 'Parking details',
    exact: true,
  });
  const detailTitle = (await details
    .locator('.parking-details-header')
    .boundingBox())!;
  await drag(
    page,
    browserName,
    detailTitle.x + 20,
    detailTitle.y + 10,
    detailTitle.y + 270,
  );
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'collapsed');
  const detailSummary = (await details
    .locator('.mobile-sheet-summary')
    .boundingBox())!;
  await drag(
    page,
    browserName,
    detailSummary.x + 20,
    detailSummary.y + 15,
    detailSummary.y - 245,
  );
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  await page.getByTestId('parking-detail-save').tap();
  await expect(page.getByTestId('parking-detail-save')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await details.locator('.parking-details-back').tap();
  await expect(pane).toHaveAttribute('data-panel-view', 'list');
});

test('desktop headings keep their normal pointer behavior', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pane = page.locator('.control-pane');
  const title = page.locator('.list-heading h2');
  const bounds = (await title.boundingBox())!;
  await page.mouse.move(bounds.x + 20, bounds.y + 10);
  await page.mouse.down();
  await expect(pane).not.toHaveAttribute('data-mobile-sheet-dragging', 'true');
  await page.mouse.move(bounds.x + 20, bounds.y + 210, { steps: 5 });
  await page.mouse.up();
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  await expect(title).toHaveCSS('touch-action', 'auto');
});

test('a cancelled touch drag restores the tray and releases its controls', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Native touch cancellation requires CDP.',
  );
  const pane = page.locator('.control-pane');
  const title = (await page.locator('.list-heading h2').boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: title.x + 20, y: title.y + 10 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: title.x + 20, y: title.y + 90 }],
  });
  await expect(pane).toHaveAttribute('data-mobile-sheet-dragging', 'true');
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await session.detach();
  await expect(pane).not.toHaveAttribute('data-mobile-sheet-dragging', 'true');
  await expect(pane).toHaveAttribute('data-mobile-sheet-state', 'expanded');
  await page.getByTestId('open-my-neuks').tap();
  await expect(pane).toHaveAttribute('data-parking-view', 'saved');
});

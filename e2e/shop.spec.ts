import { expect, test, type Page } from '@playwright/test';

// Palier 2 : on paie le premier loyer, on achète au Comptoir, puis on joue une Carte au mois suivant.
interface KrachState {
  ui: string;
  run: { phase: string; capital: number; seance: number; tools: string[]; hand: string[] } | null;
  reading: 'long' | 'short' | null;
}

const state = (page: Page): Promise<KrachState> =>
  page.evaluate(() => (window as unknown as { krachState: () => KrachState }).krachState());

async function playUntilOverlay(page: Page): Promise<void> {
  for (let i = 0; i < 600; i++) {
    const s = await state(page);
    if (s.ui === 'decide' && s.reading) await page.locator(s.reading === 'long' ? '#btn-long' : '#btn-short').click();
    else if (s.ui === 'overlay') return;
    await page.waitForTimeout(20);
  }
  throw new Error('la séance ne finit pas');
}

test('achète au Comptoir et joue une Carte', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('krach-test/v3/settings', JSON.stringify({ muted: true, fast: true }));
    localStorage.setItem('krach-test/v3/progress', JSON.stringify({ version: 1, unlocked: 2, records: {}, beaten: [1], seenTerms: [] }));
  });
  await page.goto('/');
  await page.locator('[data-act="tier-2"]').click();
  await page.locator('[data-act="go"]').click();
  await playUntilOverlay(page);

  if (await page.locator('[data-act="cash"]').isVisible()) await page.locator('[data-act="cash"]').click();
  await page.locator('[data-act="next"]').click();
  await expect(page.locator('.shop')).toBeVisible();

  const before = (await state(page)).run?.capital ?? 0;
  const card = page.locator('.shop .buy[data-act^="card-"]:not([disabled])').first();
  await card.click();
  const tool = page.locator('.shop .buy[data-act^="tool-"]:not([disabled])').first();
  await tool.click();
  const after = await state(page);
  expect(after.run?.capital).toBeLessThan(before);
  expect(after.run?.hand).toHaveLength(1);
  expect(after.run?.tools).toHaveLength(1);

  await page.locator('[data-act="leave"]').click();
  await page.locator('[data-act="go"]').click();
  await expect(page.locator('#kit')).toBeVisible();
  await expect(page.locator('.play-card:not([disabled])')).toBeVisible();
  await page.locator('.play-card').first().click();
  await expect(page.locator('.hint').first()).toBeVisible();
  expect((await state(page)).run?.hand).toHaveLength(0);
  expect(errors).toEqual([]);
});

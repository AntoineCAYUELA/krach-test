import { expect, test, type Page } from '@playwright/test';

// Test de fumée : on lance le palier 1, on joue la bonne lecture à chaque trade
// et on vérifie que le capital bouge et que le premier mois se termine.
interface KrachState {
  ui: string;
  run: { phase: string; capital: number; seance: number } | null;
  reading: 'long' | 'short' | null;
}

const state = (page: Page): Promise<KrachState> =>
  page.evaluate(() => (window as unknown as { krachState: () => KrachState }).krachState());

test('joue le premier mois du palier 1', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('krach-test/v3/settings', JSON.stringify({ muted: true, fast: true })));
  await page.goto('/');
  await expect(page.locator('.logo')).toBeVisible();
  await page.locator('[data-act="tier-1"]').click();
  await expect(page.locator('[data-act="go"]')).toBeVisible();
  await page.keyboard.press('Enter');

  let trades = 0;
  for (let i = 0; i < 400; i++) {
    const s = await state(page);
    if (s.ui === 'decide' && s.reading) {
      await page.locator(s.reading === 'long' ? '#btn-long' : '#btn-short').click();
      trades++;
    } else if (s.ui === 'overlay' || (s.run && s.run.phase !== 'trading')) {
      break;
    }
    await page.waitForTimeout(25);
  }
  const end = await state(page);
  expect(trades).toBeGreaterThan(0);
  expect(end.run?.capital).toBeGreaterThan(1000);
  expect(['cashout', 'seanceWon']).toContain(end.run?.phase);
  await expect(page.locator('#overlay')).toBeVisible();
  expect(errors).toEqual([]);
});

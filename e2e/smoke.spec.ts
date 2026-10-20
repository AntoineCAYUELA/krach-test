// Test de fumée (jalon 8) : partie à graine fixe, ouverture d'une position,
// mise à jour de la Performance et du capital, puis fin de la séance.
import { expect, test, type Page } from '@playwright/test';
import { GLOSSARY } from '../src/data/glossary.ts';

const SEED = '12345';

/** « 1 000,00 $ » ou « −32,97 » → nombre. */
function parseNumber(text: string | null): number {
  const cleaned = (text ?? '').replace(/[\s  $]/g, '').replace('−', '-').replace(',', '.');
  return Number(cleaned);
}

async function hudValue(page: Page, label: string): Promise<string> {
  return (await page.locator('.hud .stat', { hasText: label }).locator('.stat-value').textContent()) ?? '';
}

/** Choisit la direction qui valide le plus de cartes, sélectionne ces cartes (3 au plus) et ouvre la position. */
async function openBestPosition(page: Page): Promise<void> {
  let best = { direction: 'long', valid: -1 };
  for (const direction of ['long', 'short']) {
    await page.locator(`.ticket .segmented button.${direction}`).click();
    const valid = await page.locator('.hand .card.valid').count();
    if (valid > best.valid) best = { direction, valid };
  }
  await page.locator(`.ticket .segmented button.${best.direction}`).click();
  const cards = page.locator('.hand .card.valid');
  const count = Math.min(3, await cards.count());
  for (let i = 0; i < count; i++) await cards.nth(i).click();
  await page.locator('button.open').click();
}

test.beforeEach(async ({ page }) => {
  // Termes déjà vus et animation rapide : le test ne dépend pas des infobulles ni du minutage.
  const seen = JSON.stringify(GLOSSARY.map((entry) => entry.id));
  await page.addInitScript((seenTerms) => {
    if (sessionStorage.getItem('smoke-init')) return;
    sessionStorage.setItem('smoke-init', '1');
    localStorage.clear();
    localStorage.setItem('krach-test/seen-terms', seenTerms);
    localStorage.setItem('krach-test/settings', JSON.stringify({ fastAnimation: true }));
  }, seen);
});

test('partie à graine fixe : un trade met à jour le capital et la Performance, puis la séance se termine', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  // Premier lancement : avertissement de risque puis tutoriel.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Avant de jouer' })).toBeVisible();
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await page.getByRole('button', { name: 'Passer le tutoriel' }).click();

  // Menu titre : nouvelle partie avec une graine fixe.
  await page.getByPlaceholder('Graine (facultatif)').fill(SEED);
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  await expect(page.getByRole('heading', { name: /Séance 1 sur 8/ })).toBeVisible();
  await expect(page.locator('.topbar .seed')).toHaveText(`Graine ${SEED}`);
  await page.getByRole('button', { name: 'Commencer la séance' }).click();

  // État de départ (GDD 2.1 et 2.2).
  expect(parseNumber(await hudValue(page, 'Capital'))).toBe(1000);
  await expect(page.locator('.stat-performance .stat-value')).toHaveText('0,00 / 20');
  expect(await hudValue(page, 'Ordres')).toBe('5');
  expect(await hudValue(page, 'Bougies')).toBe('24');

  // Première position : animation, décomposition du score, mise à jour de la barre d'état.
  await openBestPosition(page);
  const breakdown = page.locator('.ticket.trade .breakdown');
  await expect(breakdown).toBeVisible();
  const capitalLine = (await page.locator('.ticket.trade .after p', { hasText: 'Capital' }).textContent()) ?? '';
  const performanceLine = (await page.locator('.ticket.trade .after p', { hasText: 'Performance de séance' }).textContent()) ?? '';
  const capitalAfter = parseNumber(capitalLine.split('→')[1] ?? '');
  const performanceAfter = parseNumber((performanceLine.split('→')[1] ?? '').split('/')[0] ?? '');

  expect(capitalAfter).not.toBe(1000);
  expect(parseNumber(await hudValue(page, 'Capital'))).toBeCloseTo(capitalAfter, 2);
  expect(parseNumber((await page.locator('.stat-performance .stat-value').textContent())?.split('/')[0] ?? '')).toBeCloseTo(performanceAfter, 2);
  expect(await hudValue(page, 'Ordres')).toBe('4');
  expect(await hudValue(page, 'Bougies')).toBe('21');

  // Jouer jusqu'à la fin de la séance : bilan (quota atteint) ou écran de fin (quota manqué).
  for (let turn = 0; turn < 40; turn++) {
    if ((await page.locator('.summary, .end-panel').count()) > 0) break;
    const next = page.locator('.ticket.trade button.primary');
    if ((await next.count()) > 0) {
      await next.click();
      continue;
    }
    await openBestPosition(page);
    await expect(page.locator('.ticket.trade button.primary')).toBeVisible();
  }
  await expect(page.locator('.summary, .end-panel')).toBeVisible();
  const ended = (await page.locator('.summary h1, .end-panel h1').textContent()) ?? '';
  expect(ended).toMatch(/Séance 1 réussie|Tu es viré|Margin call/);

  // La run est sauvegardée tant qu'elle continue, effacée quand elle est perdue.
  const saved = await page.evaluate(() => localStorage.getItem('krach-test/run'));
  if (ended.startsWith('Séance')) expect(saved).not.toBeNull();
  else expect(saved).toBeNull();

  expect(errors).toEqual([]);
});

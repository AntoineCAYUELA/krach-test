// Test de fumée (jalon 8) : partie à graine fixe, ouverture d'une position,
// mise à jour de la Performance et du capital, puis fin de la séance.
import { expect, test, type Page } from '@playwright/test';
import { GLOSSARY } from '../src/data/glossary.ts';
import { beginSeance, createRun, finishSummary, passCandle } from '../src/engine/run.ts';

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
  await expect(page.locator('.stat-performance .stat-value')).toHaveText('0,00 / 60');
  expect(await hudValue(page, 'Ordres')).toBe('5');
  expect(await hudValue(page, 'Bougies')).toBe('24');

  // Contexte de marché toujours visible ; la direction choisie, le ticket affiche la prévision.
  await expect(page.locator('.chart-toolbar .context')).toContainText(/Tendance haussière|Tendance baissière|Sans tendance/);
  await page.locator('.ticket .segmented button.long').click();
  await expect(page.locator('.ticket .forecast-value')).toHaveText(/^\d+\s%$/);
  await expect(page.locator('.ticket .preview')).toContainText('Espérance de gain');
  await expect(page.locator('.hand .card')).toHaveCount(7);

  // Première position : animation, décomposition du score, mise à jour de la barre d'état.
  await openBestPosition(page);
  const breakdown = page.locator('.ticket.trade .breakdown');
  await expect(breakdown).toBeVisible();
  await expect(breakdown).toContainText('Chance affichée');
  const capitalLine = (await page.locator('.ticket.trade .after p', { hasText: /^Capital :/ }).textContent()) ?? '';
  const performanceLine = (await page.locator('.ticket.trade .after p', { hasText: /^Performance de séance/ }).textContent()) ?? '';
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

  // Séance réussie : soirée (entracte), puis boutique.
  if (ended.startsWith('Séance')) {
    await page.getByRole('button', { name: 'Passer à la soirée' }).click();
    await expect(page.getByRole('heading', { name: 'Soirée', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Aller à la boutique' }).click();
    await expect(page.locator('.topbar-title')).toHaveText('Boutique');
  }

  expect(errors).toEqual([]);
});

test('entracte avec décor : amélioration du poste, voyage, revue de marché au briefing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1536, height: 864 });

  // Run sauvegardée à l'entracte qui suit la séance 1, avec 300 € d'épargne.
  const run = createRun(Number(SEED));
  beginSeance(run);
  run.seance!.quota = 0;
  passCandle(run);
  finishSummary(run);
  run.life!.savings = 300;
  await page.addInitScript((saved) => {
    if (sessionStorage.getItem('entracte-init')) return;
    sessionStorage.setItem('entracte-init', '1');
    localStorage.setItem('krach-test/run', saved);
    localStorage.setItem('krach-test/onboarded', 'true');
  }, JSON.stringify(run));

  await page.goto('/');
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByRole('heading', { name: 'Soirée', exact: true })).toBeVisible();
  await expect(page.locator('.scene.evening.setup-laptop.home-studio')).toBeVisible();

  // Le PC tour remplace l'ordinateur portable.
  await page.getByRole('button', { name: 'Acheter (100 €)' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Acheter' }).click();
  await expect(page.locator('.scene.setup-tower')).toBeVisible();

  // Voyage : une seule activité, puis pas de boutique.
  await page.getByRole('button', { name: 'Choisir (150 €)' }).click();
  await page.getByRole('button', { name: 'Réserver le voyage' }).click();
  await expect(page.getByText('✔ Choisie')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choisir (20 €)' })).toBeDisabled();
  await expect(page.locator('.topbar .savings')).toHaveText('Épargne 50 €');
  await page.getByRole('button', { name: /Partir en voyage/ }).click();

  await expect(page.getByRole('heading', { name: /Pendant ton voyage/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Séance 2 sur 8/ })).toBeVisible();
  await page.getByRole('button', { name: 'Commencer la séance' }).click();
  await expect(page.locator('.device-tower .hud .stress-gauge')).toBeVisible();

  expect(errors).toEqual([]);
});

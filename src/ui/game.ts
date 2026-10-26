// Écran de jeu : relie le moteur (src/engine) à l'affichage. Le moteur règle chaque trade
// d'un coup ; l'écran dévoile ensuite les bougies une par une.
import { GLOSSARY, glossaryEntry } from '../data/glossary.ts';
import {
  CARDS, RARITY_NAME, TOOLS, cardDef, toolDef, unlockedItems, type CardId, type ToolId,
} from '../data/items.ts';
import { explain } from '../engine/explain.ts';
import { readingFor, type Candle } from '../engine/market.ts';
import { MAX_TIER, markSeen, recordWin, type Progress } from '../engine/progress.ts';
import { RULES, isBigTrade, type Direction, type Settlement } from '../engine/rules.ts';
import {
  beginTrade, buyBonusTrade, canBuyBonus, canPlayCard, cashOut, createRun, currentLevel, currentMulti, finishTrade,
  giveUp, interestFor, keepTrading, multiMax, nextBonusCost, nextSeance, playCard, quota, remainingToQuota,
  seanceCount, seanceGain, startSeance, type Deal, type RunState, type TradeOutcome,
} from '../engine/run.ts';
import {
  SHOP, buyCard, buyTool, canBuyCard, canBuyTool, canReroll, gainCut, leaveShop, reroll, rerollCost, sellTool,
} from '../engine/shop.ts';
import { getTier, TIERS } from '../engine/tiers.ts';
import { Chart } from './chart.ts';
import { int, money, money0, multiText, plural, richText, signed, signed0 } from './format.ts';
import { setMuted, sfx } from './sfx.ts';
import {
  clearRun, loadProgress, loadRun, loadSettings, saveProgress, saveRun, saveSettings, type Settings,
} from './storage.ts';
import { LANDLORD_SMS, seanceBriefing, tierLabel } from './texts.ts';

type UiPhase = 'menu' | 'lead' | 'decide' | 'trade' | 'result' | 'overlay';

const ARROW_UP = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 L12 4 M6 4 H12 V10" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="square"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 V13 M3.5 8.5 L8 13 L12.5 8.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="square"/></svg>';

const TEMPLATE = `
<div class="scene">
  <div class="screen" id="screen">
    <div class="screen-inner">
      <div class="top">
        <div class="ticker"><span class="coin" id="coin">K</span><span id="ticker">KRCH/USD</span></div>
        <div class="price" id="price">248.50</div>
        <div class="change" id="change">+0,00 % ▲</div>
        <div class="sep"></div>
        <div class="goal">
          <div class="goal-head"><span><b id="seance-label">Mois 1/3</b> · loyer</span><span class="num" id="goal-num">0 / 105 $</span></div>
          <div class="bar" id="bar"><i id="bar-fill"></i></div>
        </div>
        <div class="tickets" title="Tickets : trades bonus à acheter">🎟 <b id="tickets">0</b></div>
        <button class="small" id="mute" type="button" aria-pressed="false">Son : oui</button>
        <button class="small" id="menu-btn" type="button">Menu</button>
      </div>
      <div class="main">
        <div class="chart-wrap" id="chart-wrap">
          <canvas id="chart"></canvas>
          <div class="flash" id="flash"></div>
          <div class="pop" id="pop"></div>
          <div class="news" id="news" hidden><span class="tag">NEWS</span><span id="news-title"></span></div>
          <div class="hints" id="hints"></div>
        </div>
        <div class="side">
          <button class="order long" id="btn-long" type="button" disabled>${ARROW_UP}LONG</button>
          <button class="order short" id="btn-short" type="button" disabled>${ARROW_DOWN}SHORT</button>
          <div class="info">
            <div><span>Capital</span><b id="capital">1 000,00 $</b></div>
            <div><span>P&amp;L du trade</span><b class="pnl" id="pnl">–</b></div>
            <div><span>Série</span><b class="multi" id="streak">0 · ×1</b></div>
            <div class="gauge-box" title="Part des acheteurs et des vendeurs sur la dernière bougie">
              <div class="gauge-head"><span class="b">Acheteurs ▲</span><span class="s">Vendeurs ▼</span></div>
              <div class="gauge"><i id="gauge-fill"></i><b class="bl" id="buy">50 %</b><b class="sl" id="sell">50 %</b></div>
            </div>
          </div>
          <div class="kit" id="kit" hidden>
            <div class="kit-tools" id="kit-tools"></div>
            <div class="kit-hand" id="kit-hand"></div>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="pills" id="pills"></div>
        <div class="note" id="note"></div>
      </div>
    </div>
    <div class="edges" aria-hidden="true"></div>
    <div class="overlay" id="overlay" hidden></div>
  </div>
</div>`;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const frame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

export class Game {
  private readonly $: (id: string) => HTMLElement;
  private readonly chart: Chart;
  private readonly screen: HTMLElement;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private progress: Progress;
  private settings: Settings;
  private run: RunState | null = null;
  private ui: UiPhase = 'menu';
  private shown: Candle[] = [];
  private forming: Candle | null = null;
  private deal: Deal | null = null;
  private blinkOn = false;
  private blinkTimer = 0;
  private entry: { price: number; index: number } | null = null;
  private direction: Direction | null = null;
  private showSign = false;
  private overlayActions: Record<string, () => void> = {};
  private lastGauge: number | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = TEMPLATE;
    this.$ = (id: string): HTMLElement => {
      const el = root.querySelector<HTMLElement>(`#${id}`);
      if (!el) throw new Error(`#${id} introuvable`);
      return el;
    };
    this.screen = this.$('screen');
    this.chart = new Chart(this.$('chart') as HTMLCanvasElement);
    this.progress = loadProgress();
    this.settings = loadSettings();
    setMuted(this.settings.muted);
    this.bind();
    // Accès en lecture pour les tests automatiques.
    (window as unknown as { krachState: () => unknown }).krachState = () => ({
      ui: this.ui,
      run: this.run,
      reading: this.deal ? readingFor(this.deal.lead) : null,
    });
  }

  start(): void {
    this.renderMute();
    this.menu();
  }

  // ---------- Commandes ----------

  private bind(): void {
    this.$('btn-long').addEventListener('click', () => void this.choose('long'));
    this.$('btn-short').addEventListener('click', () => void this.choose('short'));
    this.$('mute').addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      setMuted(this.settings.muted);
      saveSettings(this.settings);
      this.renderMute();
    });
    this.$('kit-hand').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (btn?.dataset.card) this.playCardUi(btn.dataset.card as CardId);
    });
    this.$('menu-btn').addEventListener('click', () => {
      if (this.ui === 'decide' || this.ui === 'overlay') this.menu();
    });
    this.$('overlay').addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const term = target.closest<HTMLElement>('dfn[data-term]');
      if (term) {
        this.toggleBubble(term);
        return;
      }
      const btn = target.closest<HTMLElement>('[data-act]');
      const act = btn?.dataset.act;
      if (btn && act && !btn.hasAttribute('disabled')) this.runAction(act);
    });
    document.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const overlayOpen = !this.$('overlay').hidden;
      if (overlayOpen) {
        if (e.key === 'Enter' || e.key === ' ') {
          const primary = this.$('overlay').querySelector<HTMLElement>('[data-act].primary:not([disabled])');
          if (primary?.dataset.act) {
            e.preventDefault();
            this.runAction(primary.dataset.act);
          }
        } else if (e.key === 'c' || e.key === 'C') {
          if (this.overlayActions.keep) this.runAction('keep');
        } else if (e.key === 'Escape' && this.overlayActions.back) {
          this.runAction('back');
        } else if ((e.key === 'g' || e.key === 'G') && this.overlayActions.glossary) {
          this.runAction('glossary');
        }
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        void this.choose('long');
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void this.choose('short');
      } else if (e.key === 'g' || e.key === 'G') {
        if (this.ui === 'decide') this.glossary(() => this.closeOverlayTo('decide'));
      } else if (e.key === '1' || e.key === '2') {
        const id = this.run?.hand[Number(e.key) - 1];
        if (id) this.playCardUi(id);
      }
    });
  }

  private runAction(act: string): void {
    const fn = this.overlayActions[act];
    if (!fn) return;
    sfx.click();
    fn();
  }

  private renderMute(): void {
    const btn = this.$('mute');
    btn.textContent = this.settings.muted ? 'Son : non' : 'Son : oui';
    btn.setAttribute('aria-pressed', String(this.settings.muted));
  }

  // ---------- Écrans ----------

  private overlay(html: string, actions: Record<string, () => void>): void {
    const o = this.$('overlay');
    o.innerHTML = html;
    o.hidden = false;
    this.overlayActions = actions;
    if (this.ui !== 'menu') this.ui = 'overlay';
    o.querySelector<HTMLElement>('[data-act].primary')?.focus({ preventScroll: true });
    this.openFirstNewTerm();
  }

  private closeOverlay(): void {
    const o = this.$('overlay');
    o.hidden = true;
    o.innerHTML = '';
    this.overlayActions = {};
  }

  private closeOverlayTo(ui: UiPhase): void {
    this.closeOverlay();
    this.ui = ui;
  }

  private menu(): void {
    this.ui = 'menu';
    this.setButtons(false);
    const saved = loadRun();
    const tiers = TIERS.map((t) => {
      const locked = t.id > this.progress.unlocked;
      const record = this.progress.records[t.id];
      const beaten = this.progress.beaten.includes(t.id);
      return `<button class="tier${beaten ? ' beaten' : ''}" type="button" data-act="tier-${t.id}" ${locked ? 'disabled' : ''}>
        <span class="tier-name">${t.name}</span>
        <span class="tier-novelty">${locked ? '🔒 Gagne le palier précédent' : t.novelty}</span>
        <span class="tier-meta">${plural(t.quotas.length, 'mois')}${record ? ` · record ${money0(record)}` : ''}</span>
      </button>`;
    }).join('');
    const actions: Record<string, () => void> = {
      glossary: () => this.glossary(() => this.menu()),
      collection: () => this.collection(),
    };
    for (const t of TIERS) actions[`tier-${t.id}`] = () => this.newRun(t.id);
    if (saved) actions.resume = () => this.resume(saved);
    this.overlay(`<div class="card menu">
      <div class="logo">KRACH<span>TEST</span></div>
      <p class="tagline">Paie ton loyer en tradant depuis ta chambre. Lis le graphique, choisis LONG ou SHORT, enchaîne les gains.</p>
      ${saved ? `<button class="cta primary" type="button" data-act="resume">Continuer · ${getTier(saved.tier).name}, mois ${saved.seance + 1}<span class="key">Entrée</span></button>` : ''}
      <div class="tiers">${tiers}</div>
      <div class="row-actions">
        <button class="cta ghost" type="button" data-act="collection">Collection</button>
        <button class="cta ghost" type="button" data-act="glossary">Glossaire<span class="key">G</span></button>
      </div>
      <p class="disclaimer">Entreprises, prix et news inventés. Le vrai trading fait perdre de l'argent à la majorité des particuliers.</p>
    </div>`, actions);
    if (!saved) {
      const tiers2 = [...this.$('overlay').querySelectorAll<HTMLElement>('.tier:not([disabled])')];
      const pick = tiers2[tiers2.length - 1];
      pick?.classList.add('primary');
      pick?.focus({ preventScroll: true });
    }
  }

  private glossary(back: () => void): void {
    const rows = GLOSSARY.map((e) => `<div class="g-row"><b>${e.term}</b><span>${e.definition}</span></div>`).join('');
    this.overlay(`<div class="card glossary"><div class="eyebrow">Glossaire</div><div class="g-list">${rows}</div>
      <button class="cta primary" type="button" data-act="back">Retour<span class="key">Entrée</span></button></div>`, { back });
  }

  /** Outils et Cartes débloqués ou verrouillés (GDD v3, section 7). */
  private collection(): void {
    const unlocked = unlockedItems(this.progress.beaten);
    const lock = (n: number): string => `🔒 Gagne le palier ${n}`;
    const tools = TOOLS.map((t) => {
      const ok = unlocked.tools.includes(t.id);
      return `<div class="item${ok ? '' : ' locked'}"><b>${t.icon} ${t.name}</b><em>${RARITY_NAME[t.rarity]} · ${t.price} $</em><span>${ok ? t.effect : lock(t.unlock)}</span></div>`;
    }).join('');
    const cards = CARDS.map((c) => {
      const ok = unlocked.cards.includes(c.id);
      return `<div class="item card-item${ok ? '' : ' locked'}"><b>${c.icon} ${c.name}</b><em>Carte · ${c.price} $</em><span>${ok ? c.effect : lock(c.unlock)}</span></div>`;
    }).join('');
    this.overlay(`<div class="card wide collection"><div class="eyebrow">Collection · ${unlocked.tools.length + unlocked.cards.length} / ${TOOLS.length + CARDS.length}</div>
      <p>Le Comptoir vend ce que tu as débloqué, à partir du palier 2.</p>
      <h3>Outils <small>effet pour toute la partie</small></h3><div class="items">${tools}</div>
      <h3>Cartes <small>effet unique, à jouer avant LONG ou SHORT</small></h3><div class="items">${cards}</div>
      <button class="cta primary" type="button" data-act="back">Retour<span class="key">Entrée</span></button></div>`, { back: () => this.menu() });
  }

  // ---------- Bulles du glossaire ----------

  private openFirstNewTerm(): void {
    const terms = [...this.$('overlay').querySelectorAll<HTMLElement>('dfn[data-term]')];
    for (const el of terms) if (!this.progress.seenTerms.includes(el.dataset.term ?? '')) el.classList.add('new');
    const first = terms.find((el) => el.classList.contains('new'));
    if (first) this.toggleBubble(first);
  }

  private toggleBubble(term: HTMLElement): void {
    const card = term.closest('.card');
    const id = term.dataset.term;
    if (!card || !id) return;
    const open = card.querySelector('.bubble');
    const wasSame = open?.getAttribute('data-for') === id;
    open?.remove();
    if (wasSame) return;
    const entry = glossaryEntry(id);
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.dataset.for = id;
    bubble.innerHTML = `<b>${entry.term}</b> ${entry.definition}`;
    // La bulle s'ouvre sous la phrase du terme, pour ne pas couper la lecture.
    const block = term.closest('li, p');
    if (block?.tagName === 'LI') block.appendChild(bubble);
    else (block ?? term).insertAdjacentElement('afterend', bubble);
    term.classList.remove('new');
    if (markSeen(this.progress, id)) saveProgress(this.progress);
  }

  // ---------- Partie ----------

  private newRun(tier: number): void {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    this.run = createRun(tier, seed, unlockedItems(this.progress.beaten));
    this.shown = this.run.market.history.slice();
    this.resetTradeView();
    saveRun(this.run);
    this.renderAll();
    this.seanceIntro();
  }

  private resume(run: RunState): void {
    this.run = run;
    this.shown = run.market.history.slice();
    this.resetTradeView();
    this.renderAll();
    switch (run.phase) {
      case 'intro': return this.seanceIntro();
      case 'trading': this.closeOverlay(); return void this.startTrade();
      case 'cashout': return this.cashOutChoice();
      case 'bonus': return this.bonusChoice();
      case 'seanceWon': return this.seanceWon();
      case 'shop': return this.shopScreen();
      default: clearRun(); return this.menu();
    }
  }

  private resetTradeView(): void {
    this.stopBlink();
    this.deal = null;
    this.$('hints').innerHTML = '';
    this.entry = null;
    this.direction = null;
    this.forming = null;
    this.showSign = false;
    this.$('news').hidden = true;
  }

  private get R(): RunState {
    if (!this.run) throw new Error('Aucune partie en cours');
    return this.run;
  }

  private seanceIntro(): void {
    const run = this.R;
    const tier = getTier(run.tier);
    const n = run.seance + 1;
    this.$('coin').textContent = tier.ticker === 'KRYP' ? '₭' : 'K';
    this.overlay(`<div class="card">
      <div class="eyebrow">${tierLabel(run.tier)} · mois ${n} sur ${seanceCount(run)}</div>
      <h2>Loyer du mois : <span class="n">${quota(run)} $</span> à gagner en <span class="n">${RULES.tradesPerSeance}</span> trades</h2>
      ${seanceBriefing(run.tier, run.seance, currentLevel(run))}
      ${interestFor(run) > 0 ? `<p>💰 Intérêts du mois : <span class="up">${signed(interestFor(run))}</span> sur ton capital (ils ne comptent pas dans le loyer).</p>` : ''}
      <button class="cta primary" type="button" data-act="go">${n === 1 ? 'Ouvrir le marché' : 'Commencer le mois'}<span class="key">Entrée</span></button>
    </div>`, {
      go: () => {
        startSeance(run);
        this.closeOverlay();
        this.renderAll();
        void this.startTrade();
      },
    });
  }

  private async startTrade(): Promise<void> {
    const run = this.R;
    saveRun(run);
    this.ui = 'lead';
    this.resetTradeView();
    this.renderAll();
    this.note('Le marché bouge… regarde la tendance, la jauge et les dernières bougies.');
    const deal = beginTrade(run);
    const lead = deal.lead;
    this.deal = deal;
    this.shown = run.market.history.slice(0, run.market.history.length - lead.candles.length);
    for (const c of lead.candles) {
      this.shown.push(c);
      this.draw();
      this.renderTop();
      await wait(this.settings.fast || this.reduceMotion ? 15 : 65);
    }
    this.ui = 'decide';
    this.setButtons(true);
    this.renderHints();
    this.renderKit();
    if (deal.hints.flash !== null) this.startBlink();
    this.draw();
    const first = run.tier === 1 && run.seance === 0 && run.results.length === 0;
    this.note(first
      ? '<b>LONG</b> si tu penses que le prix va monter, <b>SHORT</b> s\'il va baisser. Clavier : ↑ ou ↓.'
      : `À toi : <b>LONG</b> (↑) ou <b>SHORT</b> (↓) ?${run.hand.length ? ' Tes Cartes se jouent avant (touches 1 et 2).' : ''}`);
  }

  /** Joue une Carte pendant le choix, avant LONG ou SHORT. */
  private playCardUi(id: CardId): void {
    const run = this.run;
    const deal = this.deal;
    if (this.ui !== 'decide' || !run || !deal || !canPlayCard(run, deal, id)) return;
    sfx.click();
    playCard(run, deal, id);
    this.renderAll();
    this.renderHints();
    this.renderKit();
  }

  /** Ce que montrent les Outils et les Cartes jouées, au-dessus du graphique. */
  private renderHints(): void {
    const deal = this.deal;
    const box = this.$('hints');
    if (!deal) {
      box.innerHTML = '';
      return;
    }
    const h = deal.hints;
    const range = deal.lead.regime === 'range';
    const lines: string[] = [];
    if (h.flash !== null) lines.push('🔍 Loupe : la bougie qui clignote porte un signe');
    if (h.verdict) lines.push(`📡 Détecteur : signe <b class="${h.verdict === 'fiable' ? 'up' : 'down'}">${h.verdict}</b>`);
    if (h.rumor) lines.push(`📰 Rumeur : une news va faire <b class="${h.rumor > 0 ? 'up' : 'down'}">${h.rumor > 0 ? 'monter ▲' : 'baisser ▼'}</b> le prix`);
    if (h.peek) lines.push('🖥️ Terminal pro : la 1re bougie du trade est affichée');
    if (h.analyst) {
      const text = range
        ? (h.analyst === 'reverse' ? 'le niveau va casser' : 'le prix va rebondir sur le niveau')
        : (h.analyst === 'reverse' ? 'le mouvement va se retourner' : 'le mouvement va continuer');
      lines.push(`📋 Analyste : <b>${text}</b> (hors news)`);
    }
    for (const id of deal.played) {
      if (id === 'leverage') lines.push('✖️ <b class="gold">Mise doublée</b> : gain et perte ×2');
      if (id === 'insurance') lines.push('🛡️ Assuré : une perte sera annulée');
      if (id === 'denial') lines.push('🚫 Démenti prêt : une news serait annulée');
      if (id === 'tickets') lines.push('🎟️ +2 tickets');
      if (id === 'overtime') lines.push('⏱️ +1 trade ce mois-ci');
    }
    box.innerHTML = lines.map((l) => `<div class="hint">${l}</div>`).join('');
  }

  /** Loupe : la bougie du signe clignote pendant le choix. */
  private startBlink(): void {
    this.stopBlink();
    if (this.reduceMotion) {
      this.blinkOn = true;
      return;
    }
    this.blinkTimer = window.setInterval(() => {
      this.blinkOn = !this.blinkOn;
      this.draw();
    }, 450);
    this.blinkOn = true;
  }

  private stopBlink(): void {
    window.clearInterval(this.blinkTimer);
    this.blinkTimer = 0;
    this.blinkOn = false;
  }

  private async choose(direction: Direction): Promise<void> {
    if (this.ui !== 'decide' || !this.deal) return;
    const run = this.R;
    const deal = this.deal;
    const lead = deal.lead;
    this.ui = 'trade';
    this.stopBlink();
    this.renderKit();
    this.direction = direction;
    sfx.click();
    this.setButtons(false);
    this.$(direction === 'long' ? 'btn-long' : 'btn-short').classList.add('picked');
    const capital = run.capital;
    const streak = run.streak;
    const lever = deal.played.includes('leverage') ? 2 : 1;
    const big = isBigTrade(capital, streak, remainingToQuota(run), lever, multiMax(run));
    const outcome = finishTrade(run, deal, direction);
    // Le moteur a déjà réglé le trade : on affiche l'état d'avant pendant l'animation.
    const after = { capital: run.capital, streak: run.streak };
    run.capital = capital;
    run.streak = streak;
    this.entry = { price: outcome.entry, index: this.shown.length - 1 };
    this.note(`Position ${direction === 'long' ? 'LONG' : 'SHORT'} ouverte à ${outcome.entry.toFixed(2)}. Le trade dure 5 bougies.${big ? ' <b class="gold">Gros trade.</b>' : ''}`);
    const sign = (direction === 'long' ? 1 : -1) * lever;
    const stopTension = big ? this.tension() : null;
    const ms = this.settings.fast ? 40 : this.reduceMotion ? 250 : big ? 1000 : 620;
    for (let i = 0; i < outcome.trade.candles.length; i++) {
      const c = outcome.trade.candles[i] as Candle;
      if (outcome.trade.news && i === outcome.trade.news.at) {
        this.$('news-title').textContent = outcome.trade.news.title;
        this.$('news').hidden = false;
        sfx.news();
      }
      await this.formCandle(c, ms, (p) => {
        const pnl = capital * (p / outcome.entry - 1) * sign;
        this.renderInfo(pnl);
        this.renderTop(p);
        this.screen.classList.toggle('danger', big && pnl < 0);
      });
      sfx.tick((c.c - outcome.entry) * sign >= 0);
    }
    stopTension?.();
    run.capital = after.capital;
    run.streak = after.streak;
    await this.showResult(capital, streak, outcome.settlement, () =>
      explain(lead, outcome.trade.news, direction, outcome.settlement.raw > 0, currentLevel(run)) + this.itemNotes(outcome, streak));
  }

  /** Ce que les Outils et Cartes ont changé à ce trade, ajouté à l'explication. */
  private itemNotes(o: TradeOutcome, streakBefore: number): string {
    const r = o.settlement;
    const notes: string[] = [];
    if (o.denied) notes.push('Démenti : la news a été annulée.');
    if (r.bonus > 0) notes.push(`Outils : **+${Math.round(r.bonus * 100)} %** sur le gain.`);
    if (r.capped) notes.push('Stop-loss : perte plafonnée.');
    if (r.insured) notes.push('Assurance : perte annulée, série gardée.');
    if (!r.insured && r.raw <= 0 && r.nextStreak > 0) notes.push(`Sang-froid : série ${streakBefore} → ${r.nextStreak}.`);
    return notes.length ? ` ${notes.join(' ')}` : '';
  }

  /** Effets des gros trades (bible, section 8) : cœur qui accélère, écran qui vibre, bords rouges. */
  private tension(): () => void {
    this.screen.classList.add('tense');
    let beat = 760;
    let timer = 0;
    const loop = (): void => {
      sfx.heartbeat();
      beat = Math.max(420, beat - 40);
      timer = window.setTimeout(loop, beat);
    };
    loop();
    return () => {
      window.clearTimeout(timer);
      this.screen.classList.remove('tense', 'danger');
    };
  }

  /** Une bougie se forme sous les yeux du joueur : le prix zigzague de l'ouverture à la clôture. */
  private async formCandle(c: Candle, ms: number, onPrice: (p: number) => void): Promise<void> {
    const t0 = performance.now();
    const wig = (c.h - c.l) * 0.35;
    const ph = Math.random() * 6;
    const forming: Candle = { o: c.o, c: c.o, h: c.o, l: c.o, v: 0, b: c.b };
    this.forming = forming;
    for (;;) {
      const t = Math.min(1, (performance.now() - t0) / ms);
      let p = c.o + (c.c - c.o) * t + Math.sin(t * 9 + ph) * wig * (1 - t) * Math.sin(Math.PI * t);
      p = Math.min(c.h, Math.max(c.l, p));
      forming.c = p;
      forming.h = Math.max(forming.h, p);
      forming.l = Math.min(forming.l, p);
      forming.v = c.v * t;
      onPrice(p);
      this.draw();
      if (t >= 1) break;
      await frame();
    }
    this.forming = null;
    this.shown.push(c);
    this.draw();
  }

  private async showResult(capitalBefore: number, streakBefore: number, r: Settlement, message: () => string): Promise<void> {
    const run = this.R;
    this.ui = 'result';
    this.showSign = true;
    this.draw();
    const pop = this.$('pop');
    const flash = this.$('flash');
    const win = r.raw > 0;
    const lostStreak = !win && r.nextStreak < streakBefore;
    const stamps = [
      r.bonus > 0 ? `<div class="stamp">OUTILS +${Math.round(r.bonus * 100)} %</div>` : '',
      r.multi > 1 ? `<div class="stamp">SÉRIE ${multiText(r.multi)}</div>` : '',
    ].join('');
    const lossStamp = r.insured ? 'Assuré' : r.capped ? 'Stop-loss' : lostStreak ? (r.nextStreak > 0 ? 'Série ÷2' : 'Série perdue') : '';
    pop.className = 'pop';
    pop.innerHTML = win
      ? `<div class="raw">${signed(r.raw)}</div>${stamps ? `${stamps}<div class="total">${signed(r.gain)}</div>` : ''}`
      : `<div class="raw">${signed(r.raw)}</div>${lossStamp ? `<div class="stamp">${lossStamp}</div>` : ''}${r.gain !== r.raw ? `<div class="total">${signed(r.gain)}</div>` : ''}`;
    void pop.offsetWidth;
    pop.classList.add('show', win ? 'win' : 'loss');
    flash.className = 'flash';
    void flash.offsetWidth;
    if (!this.reduceMotion) flash.classList.add(win ? 'win' : 'loss');
    if (win) {
      sfx.win(r.multi);
      if (r.multi >= 2 && !this.reduceMotion) {
        this.screen.classList.remove('shake');
        void this.screen.offsetWidth;
        this.screen.classList.add('shake');
      }
    } else sfx.loss();

    // Le capital défile vers sa nouvelle valeur.
    const to = run.capital;
    const t0 = performance.now();
    const dur = this.settings.fast ? 50 : 700;
    for (;;) {
      const t = Math.min(1, (performance.now() - t0) / dur);
      run.capital = capitalBefore + (to - capitalBefore) * (1 - Math.pow(1 - t, 3));
      this.renderInfo();
      this.renderTop();
      if (t >= 1) break;
      await frame();
    }
    run.capital = to;
    this.renderAll();
    this.note(richText(message()));
    await wait(this.settings.fast ? 60 : 1500);
    this.afterTrade();
  }

  private afterTrade(): void {
    const run = this.R;
    switch (run.phase) {
      case 'trading': return void this.startTrade();
      case 'cashout': return this.cashOutChoice();
      case 'bonus': return this.bonusChoice();
      case 'seanceWon': return this.seanceWon();
      case 'won': return this.tierWon();
      case 'lost': return this.tierLost();
      default: return this.menu();
    }
  }

  private cashOutChoice(): void {
    const run = this.R;
    saveRun(run);
    sfx.goal();
    this.overlay(`<div class="card">
      <div class="eyebrow">Loyer couvert</div>
      <h2><span class="up big">${signed(seanceGain(run))}</span> sur <span class="n">${quota(run)} $</span></h2>
      <p>Il te reste <b>${plural(run.tradesLeft, 'trade')}</b>. Encaisse maintenant pour gagner <span class="gold">${plural(run.tradesLeft, 'ticket')}</span>, ou continue pour grossir ton capital, au risque de repasser sous le loyer.</p>
      <div class="row-actions">
        <button class="cta primary" type="button" data-act="cash">Encaisser · +${run.tradesLeft} 🎟<span class="key">Entrée</span></button>
        <button class="cta ghost" type="button" data-act="keep">Continuer<span class="key">C</span></button>
      </div>
    </div>`, {
      cash: () => {
        cashOut(run);
        this.renderAll();
        if (run.phase === 'won') this.tierWon();
        else this.seanceWon();
      },
      keep: () => {
        keepTrading(run);
        this.closeOverlay();
        void this.startTrade();
      },
    });
  }

  private bonusChoice(): void {
    const run = this.R;
    saveRun(run);
    const cost = nextBonusCost(run);
    const missing = quota(run) - seanceGain(run);
    this.overlay(`<div class="card">
      <div class="eyebrow">Plus de trades</div>
      <h2>Il manque <span class="down n">${money(missing)}</span> pour le loyer</h2>
      <p>Un trade bonus coûte <span class="gold">${plural(cost, 'ticket')}</span> (le suivant coûtera ${cost + 1}). Tu en as <b>${run.tickets}</b>.</p>
      <div class="row-actions">
        <button class="cta primary" type="button" data-act="buy" ${canBuyBonus(run) ? '' : 'disabled'}>Acheter un trade · −${cost} 🎟<span class="key">Entrée</span></button>
        <button class="cta ghost red" type="button" data-act="quit">Abandonner</button>
      </div>
    </div>`, {
      buy: () => {
        buyBonusTrade(run);
        this.closeOverlay();
        this.renderAll();
        void this.startTrade();
      },
      quit: () => {
        giveUp(run);
        this.tierLost();
      },
    });
  }

  private seanceWon(): void {
    const run = this.R;
    saveRun(run);
    const cashed = run.lastCashOut;
    this.overlay(`<div class="card">
      <div class="eyebrow">Mois ${run.seance + 1} réussi</div>
      <h2><span class="up big">${signed(seanceGain(run))}</span></h2>
      <p>Loyer de ${quota(run)} $ payé${cashed > 0 ? `, avec ${plural(cashed, 'trade')} d'avance : <span class="gold">+${cashed} 🎟</span>` : ''}. Ta série continue : multi actuel <span class="gold">${multiText(currentMulti(run))}</span>.</p>
      <button class="cta primary" type="button" data-act="next">Mois suivant<span class="key">Entrée</span></button>
    </div>`, {
      next: () => {
        nextSeance(run);
        this.renderAll();
        if (run.phase === 'shop') this.shopScreen();
        else this.seanceIntro();
      },
    });
  }

  /** Le Comptoir : boutique entre deux mois (GDD v3, section 6 ; bible : un site un peu louche). */
  private shopScreen(): void {
    const run = this.R;
    const shop = run.shop;
    if (!shop) return this.seanceIntro();
    saveRun(run);
    const t = (id: string | null, word: string): string => (id ? `<dfn data-term="${id}">${word}</dfn>` : word);
    const cut = (price: number): string => `−${Math.max(1, Math.round(gainCut(run, price) * 100))} % de gains`;
    const tools = shop.offer.tools.map((id) => {
      const d = toolDef(id);
      return `<div class="item ${d.rarity}"><b>${d.icon} ${t(d.term, d.name)}</b><em>${RARITY_NAME[d.rarity]} · Outil</em><span>${d.effect}</span>
        <button class="buy" type="button" data-act="tool-${id}" ${canBuyTool(run, id) ? '' : 'disabled'}>${d.price} $ <small>${cut(d.price)}</small></button></div>`;
    });
    const cards = shop.offer.cards.map((id) => {
      const d = cardDef(id);
      return `<div class="item card-item"><b>${d.icon} ${t(d.term, d.name)}</b><em>Carte · usage unique</em><span>${d.effect}</span>
        <button class="buy" type="button" data-act="card-${id}" ${canBuyCard(run, id) ? '' : 'disabled'}>${d.price} $ <small>${cut(d.price)}</small></button></div>`;
    });
    const owned = run.tools.map((id) => {
      const d = toolDef(id);
      return `<span class="owned" title="${d.effect}">${d.icon} ${d.name}<button type="button" data-act="sell-${id}">Revendre +${d.price / 2} $</button></span>`;
    }).join('');
    const hand = run.hand.map((id) => `<span class="owned" title="${cardDef(id).effect}">${cardDef(id).icon} ${cardDef(id).name}</span>`).join('');
    const actions: Record<string, () => void> = {
      leave: () => {
        leaveShop(run);
        this.renderAll();
        this.seanceIntro();
      },
      reroll: () => {
        reroll(run);
        this.renderAll();
        this.shopScreen();
      },
    };
    const after = (fn: () => void) => (): void => {
      fn();
      sfx.goal();
      this.renderAll();
      this.shopScreen();
    };
    for (const id of shop.offer.tools) actions[`tool-${id}`] = after(() => buyTool(run, id));
    for (const id of shop.offer.cards) actions[`card-${id}`] = after(() => buyCard(run, id));
    for (const id of run.tools) actions[`sell-${id}`] = after(() => sellTool(run, id as ToolId));
    this.overlay(`<div class="card wide shop">
      <div class="shop-head"><div><div class="eyebrow">Le Comptoir · avant le mois ${run.seance + 1}</div>
        <h2>Capital <span class="n">${money(run.capital)}</span></h2></div><div class="tickets-big">🎟 ${run.tickets}</div></div>
      <p class="dim">Tout se paie avec ton ${t('capital', 'capital')}. Tes gains suivants baissent d'autant : un achat doit rapporter plus qu'il ne coûte. Le capital ne descend jamais sous ${SHOP.floor} $.</p>
      <h3>Outils <small>effet pour toute la partie · ${run.tools.length}/${SHOP.maxTools}</small></h3>
      <div class="items">${tools.join('') || '<p class="dim">Plus rien à vendre.</p>'}</div>
      <h3>Cartes <small>effet unique, à jouer avant LONG ou SHORT · ${run.hand.length}/${SHOP.maxCards} en main</small></h3>
      <div class="items">${cards.join('') || '<p class="dim">Plus de cartes.</p>'}</div>
      ${owned || hand ? `<div class="owned-list">${owned}${hand}</div>` : ''}
      <div class="row-actions">
        <button class="cta primary" type="button" data-act="leave">Commencer le mois ${run.seance + 1}<span class="key">Entrée</span></button>
        <button class="cta ghost" type="button" data-act="reroll" ${canReroll(run) ? '' : 'disabled'}>Relancer l'offre · ${rerollCost(run)} $</button>
      </div>
    </div>`, actions);
  }

  private tierWon(): void {
    const run = this.R;
    sfx.goal();
    clearRun();
    const before = unlockedItems(this.progress.beaten);
    const record = recordWin(this.progress, run.tier, run.capital);
    saveProgress(this.progress);
    const after = unlockedItems(this.progress.beaten);
    const fresh = [
      ...after.tools.filter((id) => !before.tools.includes(id)).map((id) => toolDef(id)),
      ...after.cards.filter((id) => !before.cards.includes(id)).map((id) => cardDef(id)),
    ].map((d) => `${d.icon} ${d.name}`);
    const hasNext = run.tier < MAX_TIER;
    const actions: Record<string, () => void> = { menu: () => this.menu(), again: () => this.newRun(run.tier) };
    if (hasNext) actions.next = () => this.newRun(run.tier + 1);
    this.overlay(`<div class="card">
      <div class="eyebrow">${getTier(run.tier).name} gagné</div>
      <h2>Tous les loyers sont payés</h2>
      ${this.stats(record)}
      ${hasNext ? `<p><span class="gold">Débloqué :</span> ${getTier(run.tier + 1).name}, ${getTier(run.tier + 1).novelty.toLowerCase()}.</p>` : '<p>Tu as fini la base du jeu. Chaque palier reste rejouable pour battre ton record.</p>'}
      ${fresh.length ? `<p><span class="gold">Nouveau au Comptoir :</span> ${fresh.join(', ')}.</p>` : ''}
      <div class="row-actions">
        ${hasNext ? '<button class="cta primary" type="button" data-act="next">Palier suivant<span class="key">Entrée</span></button>' : ''}
        <button class="cta ${hasNext ? 'ghost' : 'primary'}" type="button" data-act="again">Rejouer ce palier</button>
        <button class="cta ghost" type="button" data-act="menu">Menu</button>
      </div>
    </div>`, actions);
  }

  private tierLost(): void {
    const run = this.R;
    sfx.over();
    clearRun();
    window.setTimeout(() => sfx.sms(), 400);
    this.overlay(`<div class="card">
      <div class="eyebrow">Loyer impayé · mois ${run.seance + 1}</div>
      <div class="sms"><div class="sms-from">Proprio</div>${LANDLORD_SMS.map((m) => `<div class="sms-msg">${m}</div>`).join('')}</div>
      <h2><span class="n">${signed0(seanceGain(run))}</span> sur <span class="n">${quota(run)} $</span></h2>
      ${this.stats(false)}
      <div class="row-actions">
        <button class="cta primary red" type="button" data-act="again">Recommencer le palier<span class="key">Entrée</span></button>
        <button class="cta ghost" type="button" data-act="menu">Menu</button>
      </div>
    </div>`, { again: () => this.newRun(run.tier), menu: () => this.menu() });
  }

  private stats(newRecord: boolean): string {
    const run = this.R;
    const rate = run.stats.trades ? Math.round((run.stats.wins / run.stats.trades) * 100) : 0;
    return `<div class="row">
      <div><span>Capital</span><b class="big">${money0(run.capital)}</b>${newRecord ? '<em class="gold">Record</em>' : ''}</div>
      <div><span>Trades gagnés</span><b class="big">${rate} %</b></div>
      <div><span>Plus gros multi</span><b class="big gold">${multiText(run.stats.bestMulti)}</b></div>
      <div><span>Plus gros gain</span><b class="big">${money0(run.stats.bestGain)}</b></div>
    </div>`;
  }

  // ---------- Rendu ----------

  private setButtons(on: boolean): void {
    for (const id of ['btn-long', 'btn-short']) {
      const b = this.$(id) as HTMLButtonElement;
      b.disabled = !on;
      b.classList.toggle('ready', on);
      b.classList.remove('picked');
    }
  }

  private note(html: string): void {
    this.$('note').innerHTML = html;
  }

  private renderAll(): void {
    this.renderTop();
    this.renderInfo();
    this.renderPills();
    this.renderKit();
    this.draw();
  }

  /** Outils actifs et Cartes en main, sous la jauge. */
  private renderKit(): void {
    const run = this.run;
    const kit = this.$('kit');
    if (!run || (run.tools.length === 0 && run.hand.length === 0)) {
      kit.hidden = true;
      return;
    }
    kit.hidden = false;
    this.$('kit-tools').innerHTML = run.tools
      .map((id) => { const d = toolDef(id); return `<span class="chip" title="${d.name} : ${d.effect}">${d.icon}</span>`; })
      .join('');
    const deciding = this.ui === 'decide' && this.deal !== null;
    this.$('kit-hand').innerHTML = run.hand
      .map((id, i) => {
        const d = cardDef(id);
        const ok = deciding && this.deal !== null && canPlayCard(run, this.deal, id);
        return `<button class="play-card" type="button" data-card="${id}" title="${d.effect}" ${ok ? '' : 'disabled'}><span class="k">${i + 1}</span>${d.icon} ${d.name}</button>`;
      })
      .join('');
  }

  private renderTop(livePrice?: number): void {
    const run = this.run;
    if (!run) return;
    const lastCandle = this.shown[this.shown.length - 1];
    const p = livePrice ?? lastCandle?.c ?? run.market.price;
    const open = this.shown[Math.max(0, this.shown.length - 60)]?.o ?? p;
    const ch = (p / open - 1) * 100;
    const priceEl = this.$('price');
    const chEl = this.$('change');
    priceEl.textContent = p.toFixed(2);
    chEl.textContent = `${ch >= 0 ? '+' : '−'}${Math.abs(ch).toFixed(2).replace('.', ',')} % ${ch >= 0 ? '▲' : '▼'}`;
    priceEl.classList.toggle('neg', ch < 0);
    chEl.classList.toggle('neg', ch < 0);
    this.$('ticker').textContent = `${getTier(run.tier).ticker}/USD`;
    this.$('seance-label').textContent = `Mois ${run.seance + 1}/${seanceCount(run)}`;
    const q = quota(run);
    const g = run.phase === 'intro' ? 0 : seanceGain(run);
    this.$('goal-num').textContent = `${g >= 0 ? '' : '−'}${int(Math.abs(g))} / ${q} $`;
    this.$('bar-fill').style.width = `${Math.max(0, Math.min(100, (g / q) * 100))}%`;
    this.$('bar').classList.toggle('full', g >= q);
    this.$('tickets').textContent = String(run.tickets);
  }

  private renderInfo(livePnl?: number): void {
    const run = this.run;
    if (!run) return;
    this.$('capital').textContent = money(run.capital);
    const pnl = this.$('pnl');
    if (livePnl === undefined) {
      pnl.textContent = '–';
      pnl.className = 'pnl';
    } else {
      pnl.textContent = signed(livePnl);
      pnl.className = `pnl ${livePnl >= 0 ? 'pos' : 'neg'}`;
    }
    this.$('streak').textContent = `${run.streak} · ${multiText(currentMulti(run))}`;
  }

  private renderPills(): void {
    const run = this.run;
    const box = this.$('pills');
    box.innerHTML = '';
    if (!run) return;
    const total = Math.max(RULES.tradesPerSeance, run.results.length + run.tradesLeft);
    for (let i = 0; i < total; i++) {
      const el = document.createElement('div');
      el.className = 'pill';
      const r = run.results[i];
      if (r) {
        el.classList.add(r.gain >= 0 ? 'win' : 'loss');
        el.textContent = `${r.gain >= 0 ? '▲' : '▼'}${int(Math.abs(r.gain))}`;
      } else if (i < run.results.length + run.tradesLeft) {
        el.textContent = i >= RULES.tradesPerSeance ? '🎟' : `T${i + 1}`;
        if (i === run.results.length && run.phase === 'trading') el.classList.add('now');
      } else {
        el.classList.add('skip');
        el.textContent = `T${i + 1}`;
      }
      box.appendChild(el);
    }
  }

  private renderGauge(b: number): void {
    if (b === this.lastGauge) return;
    this.lastGauge = b;
    this.$('buy').textContent = `${b} %`;
    this.$('sell').textContent = `${100 - b} %`;
    this.$('gauge-fill').style.width = `${b}%`;
  }

  private draw(): void {
    const lead = this.deal?.lead ?? null;
    const hints = this.deal?.hints;
    const showRange = lead?.regime === 'range' && this.ui !== 'lead';
    const last = this.forming ?? this.shown[this.shown.length - 1];
    if (last) this.renderGauge(last.b);
    this.chart.draw({
      candles: this.shown,
      forming: this.forming,
      entry: this.entry,
      direction: this.direction,
      range: showRange ? lead.rangeInfo : null,
      sign: this.showSign && lead && lead.signIndex !== null ? { index: lead.signIndex, fake: lead.fake } : null,
      blink: this.ui === 'decide' && this.blinkOn && hints?.flash != null ? hints.flash : null,
      peek: this.ui === 'decide' ? hints?.peek ?? null : null,
    });
  }
}

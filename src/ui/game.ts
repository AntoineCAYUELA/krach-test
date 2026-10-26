// Écran de jeu : relie le moteur (src/engine) à l'affichage. Le moteur règle chaque trade
// d'un coup ; l'écran dévoile ensuite les bougies une par une.
import { GLOSSARY, glossaryEntry } from '../data/glossary.ts';
import { explain } from '../engine/explain.ts';
import { readingFor, type Candle, type Lead } from '../engine/market.ts';
import { MAX_TIER, markSeen, recordWin, type Progress } from '../engine/progress.ts';
import { RULES, isBigTrade, multiplier, type Direction, type Settlement } from '../engine/rules.ts';
import {
  beginTrade, buyBonusTrade, canBuyBonus, cashOut, createRun, currentLevel, finishTrade, giveUp, keepTrading,
  nextBonusCost, nextSeance, quota, remainingToQuota, seanceCount, seanceGain, startSeance, type RunState,
} from '../engine/run.ts';
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
  private lead: Lead | null = null;
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
      reading: this.lead ? readingFor(this.lead) : null,
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
    const actions: Record<string, () => void> = { glossary: () => this.glossary(() => this.menu()) };
    for (const t of TIERS) actions[`tier-${t.id}`] = () => this.newRun(t.id);
    if (saved) actions.resume = () => this.resume(saved);
    this.overlay(`<div class="card menu">
      <div class="logo">KRACH<span>TEST</span></div>
      <p class="tagline">Paie ton loyer en tradant depuis ta chambre. Lis le graphique, choisis LONG ou SHORT, enchaîne les gains.</p>
      ${saved ? `<button class="cta primary" type="button" data-act="resume">Continuer · ${getTier(saved.tier).name}, mois ${saved.seance + 1}<span class="key">Entrée</span></button>` : ''}
      <div class="tiers">${tiers}</div>
      <div class="row-actions"><button class="cta ghost" type="button" data-act="glossary">Glossaire<span class="key">G</span></button></div>
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
    this.run = createRun(tier, seed);
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
      default: clearRun(); return this.menu();
    }
  }

  private resetTradeView(): void {
    this.lead = null;
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
    const lead = beginTrade(run);
    this.lead = lead;
    this.shown = run.market.history.slice(0, run.market.history.length - lead.candles.length);
    for (const c of lead.candles) {
      this.shown.push(c);
      this.draw();
      this.renderTop();
      await wait(this.settings.fast || this.reduceMotion ? 15 : 65);
    }
    this.ui = 'decide';
    this.setButtons(true);
    const first = run.tier === 1 && run.seance === 0 && run.results.length === 0;
    this.note(first
      ? '<b>LONG</b> si tu penses que le prix va monter, <b>SHORT</b> s\'il va baisser. Clavier : ↑ ou ↓.'
      : 'À toi : <b>LONG</b> (↑) ou <b>SHORT</b> (↓) ?');
  }

  private async choose(direction: Direction): Promise<void> {
    if (this.ui !== 'decide' || !this.lead) return;
    const run = this.R;
    const lead = this.lead;
    this.ui = 'trade';
    this.direction = direction;
    sfx.click();
    this.setButtons(false);
    this.$(direction === 'long' ? 'btn-long' : 'btn-short').classList.add('picked');
    const capital = run.capital;
    const streak = run.streak;
    const big = isBigTrade(capital, streak, remainingToQuota(run));
    const outcome = finishTrade(run, lead, direction);
    // Le moteur a déjà réglé le trade : on affiche l'état d'avant pendant l'animation.
    const after = { capital: run.capital, streak: run.streak };
    run.capital = capital;
    run.streak = streak;
    this.entry = { price: outcome.entry, index: this.shown.length - 1 };
    this.note(`Position ${direction === 'long' ? 'LONG' : 'SHORT'} ouverte à ${outcome.entry.toFixed(2)}. Le trade dure 5 bougies.${big ? ' <b class="gold">Gros trade.</b>' : ''}`);
    const sign = direction === 'long' ? 1 : -1;
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
    await this.showResult(capital, streak, outcome.settlement, () => explain(lead, outcome.trade.news, direction, outcome.settlement.raw > 0, currentLevel(run)));
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
    const lostStreak = !win && streakBefore > 0;
    pop.className = 'pop';
    pop.innerHTML = win
      ? `<div class="raw">${signed(r.raw)}</div>${r.multi > 1 ? `<div class="stamp">SÉRIE ${multiText(r.multi)}</div><div class="total">${signed(r.gain)}</div>` : ''}`
      : `<div class="raw">${signed(r.raw)}</div>${lostStreak ? '<div class="stamp">Série perdue</div>' : ''}`;
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
      <p>Loyer de ${quota(run)} $ payé${cashed > 0 ? `, avec ${plural(cashed, 'trade')} d'avance : <span class="gold">+${cashed} 🎟</span>` : ''}. Ta série continue : multi actuel <span class="gold">${multiText(multiplier(run.streak))}</span>.</p>
      <button class="cta primary" type="button" data-act="next">Mois suivant<span class="key">Entrée</span></button>
    </div>`, {
      next: () => {
        nextSeance(run);
        this.renderAll();
        this.seanceIntro();
      },
    });
  }

  private tierWon(): void {
    const run = this.R;
    sfx.goal();
    clearRun();
    const record = recordWin(this.progress, run.tier, run.capital);
    saveProgress(this.progress);
    const hasNext = run.tier < MAX_TIER;
    const actions: Record<string, () => void> = { menu: () => this.menu(), again: () => this.newRun(run.tier) };
    if (hasNext) actions.next = () => this.newRun(run.tier + 1);
    this.overlay(`<div class="card">
      <div class="eyebrow">${getTier(run.tier).name} gagné</div>
      <h2>Tous les loyers sont payés</h2>
      ${this.stats(record)}
      ${hasNext ? `<p><span class="gold">Débloqué :</span> ${getTier(run.tier + 1).name}, ${getTier(run.tier + 1).novelty.toLowerCase()}.</p>` : '<p>Tu as fini la base du jeu. Chaque palier reste rejouable pour battre ton record.</p>'}
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
    this.draw();
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
    this.$('streak').textContent = `${run.streak} · ${multiText(multiplier(run.streak))}`;
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
    const lead = this.lead;
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
    });
  }
}

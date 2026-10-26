// Sons de synthèse (Web Audio), démarrés au premier geste du joueur.
// Les vrais sons (clavier, caisse enregistreuse) et les réactions vocales viendront en fichiers.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.05, delay = 0, slideTo?: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  click(): void {
    tone(660, 0.06, 'square', 0.04);
  },
  tick(up: boolean): void {
    tone(up ? 880 : 620, 0.04, 'triangle', 0.025);
  },
  win(multi: number): void {
    const base = 520 * (1 + (multi - 1) * 0.18);
    [1, 1.26, 1.5, 2].forEach((r, i) => tone(base * r, 0.14, 'square', 0.045, i * 0.07));
  },
  loss(): void {
    tone(220, 0.35, 'sawtooth', 0.04, 0, 90);
  },
  news(): void {
    tone(988, 0.08, 'square', 0.05);
    tone(740, 0.12, 'square', 0.05, 0.1);
  },
  goal(): void {
    [1, 1.26, 1.5, 2, 2.52].forEach((r, i) => tone(440 * r, 0.18, 'square', 0.05, i * 0.09));
  },
  over(): void {
    [330, 262, 196, 131].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.045, i * 0.16));
  },
  /** Battement de cœur des gros trades : deux coups sourds. */
  heartbeat(): void {
    tone(70, 0.12, 'sine', 0.22, 0, 45);
    tone(62, 0.14, 'sine', 0.16, 0.16, 40);
  },
  sms(): void {
    tone(1318, 0.07, 'sine', 0.05);
    tone(1760, 0.1, 'sine', 0.05, 0.09);
  },
};

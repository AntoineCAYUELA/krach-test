// Explication après chaque trade (GDD v3, section 8) : ce qu'a fait le marché, pourquoi,
// et la bonne lecture si le joueur s'est trompé. Les **mots** entre astérisques sont en gras.
import { readingFor, type Lead, type TradeNews } from './market.ts';
import { RULES, type Direction } from './rules.ts';
import { fakeShare, type Level } from './tiers.ts';

const pct = (v: number): string => `${Math.round(v * 100)} %`;

export function explain(lead: Lead, news: TradeNews | null, direction: Direction, won: boolean, level: Level): string {
  if (news) {
    return `**News surprise** : « ${news.title} ». Rien sur le graphique ne pouvait l'annoncer : c'est le risque de tout trade (${pct(level.news)} des trades à ce niveau).`;
  }
  let msg: string;
  if (lead.regime === 'range' && lead.rangeInfo) {
    const high = lead.rangeInfo.endsHigh;
    const lvl = high ? 'la résistance' : 'le support';
    if (!lead.sign) msg = `**Rebond** : le prix a touché ${lvl} et les ${high ? 'vendeurs' : 'acheteurs'} l'ont repoussé.`;
    else if (lead.reverses) msg = `**Cassure annoncée** : le prix collait à ${lvl} avec un volume qui grossissait, les ${high ? 'acheteurs' : 'vendeurs'} sont passés.`;
    else msg = `**Faux signal** : le volume grossissait contre ${lvl}, mais le niveau a tenu (${pct(fakeShare(level))} des signes à ce niveau).`;
  } else {
    const up = lead.regime === 'up';
    const before = lead.candles[lead.candles.length - 1 - (lead.sign ? RULES.signCandles : 0)]?.b ?? 50;
    if (!lead.sign) msg = `Les ${up ? 'acheteurs' : 'vendeurs'} dominaient (${up ? before : 100 - before} %) sans signe d'essoufflement : la ${up ? 'hausse' : 'baisse'} a continué.`;
    else if (lead.reverses) msg = `**Retournement annoncé** : la ${up ? 'hausse' : 'baisse'} ralentissait, longue mèche ${up ? 'haute' : 'basse'} avec un gros volume, et la jauge a basculé côté ${up ? 'vendeurs' : 'acheteurs'}.`;
    else msg = `**Faux signal** : mèche et volume annonçaient un essoufflement, mais les ${up ? 'acheteurs' : 'vendeurs'} sont revenus (${pct(fakeShare(level))} des signes à ce niveau).`;
  }
  const reading = readingFor(lead);
  if (direction !== reading && !won) msg += ` La bonne lecture était **${reading.toUpperCase()}**.`;
  else if (direction !== reading && won) msg += ` Coup de chance : les signes disaient **${reading.toUpperCase()}**.`;
  return msg;
}

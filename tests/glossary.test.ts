// Le glossaire du jeu reprend la section 10 du GDD mot pour mot.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '../src/data/glossary.ts';

/** Lignes du tableau de la section 10 : [terme, définition]. */
function gddGlossary(): [string, string][] {
  const gdd = readFileSync(new URL('../docs/gdd.md', import.meta.url), 'utf8');
  const section = gdd.slice(gdd.indexOf('## 10. Glossaire'), gdd.indexOf('## 11.'));
  return section
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Terme') && !line.startsWith('|---'))
    .map((line) => {
      const cells = line.split(' | ');
      return [cells[0]!.slice(2).trim(), cells.slice(1).join(' | ').replace(/ \|$/, '').trim()];
    });
}

describe('glossaire', () => {
  it('contient chaque terme de la section 10 du GDD, avec sa définition exacte', () => {
    const rows = gddGlossary();
    expect(rows.length).toBeGreaterThan(50);
    const byTerm = new Map(GLOSSARY.map((entry) => [entry.term, entry.definition]));
    for (const [term, definition] of rows) {
      expect(byTerm.get(term), term).toBe(definition);
    }
    expect(GLOSSARY).toHaveLength(rows.length);
  });

  it('a des identifiants uniques', () => {
    expect(new Set(GLOSSARY.map((entry) => entry.id)).size).toBe(GLOSSARY.length);
  });
});

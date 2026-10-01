import { CELLS, ELEMENTS, STEP_HZ, SUMMON_COST, upgradeCost } from './balance';
import { emptyCells } from './board';
import { craftable } from './economy';
import { Game } from './game';
import { EMPTY, canMerge, kindElement, KIND_COUNT } from './kinds';

/** 밸런스 확인용 단순 전략. 조합 → 합성 → 소환 → 도박 → 강화 순. */
export function botTurn(g: Game): void {
  const s = g.s;
  for (const m of craftable(s)) g.command({ type: 'craft', mythic: m });

  // 필드 합성: 같은 종류 쌍을 찾아 합친다
  let merged = true;
  while (merged) {
    merged = false;
    const seen = new Map<number, number>();
    for (let c = 0; c < CELLS; c++) {
      const k = s.field[c];
      if (k === EMPTY || !canMerge(k)) continue;
      const other = seen.get(k);
      if (other !== undefined) {
        g.command({ type: 'move', from: { area: 'field', cell: c }, to: { area: 'field', cell: other } });
        merged = true;
        break;
      }
      seen.set(k, c);
    }
  }
  // 서랍: 서랍 안 합성, 필드에 같은 게 있으면 합성, 빈 칸이 있으면 배치
  for (let k = 0; k < KIND_COUNT; k++) {
    while (s.drawer[k] >= 2 && canMerge(k)) g.command({ type: 'drawerMerge', kind: k });
    if (s.drawer[k] > 0) {
      const same = s.field.indexOf(k);
      const target = same >= 0 && canMerge(k) ? same : emptyCells(s)[0];
      if (target !== undefined) g.command({ type: 'move', from: { area: 'drawer', kind: k }, to: { area: 'field', cell: target } });
    }
  }

  while (s.stones >= 1 && g.command({ type: 'gamble', option: 0 }));

  // 강화: 가장 많이 가진 속성. SP가 넉넉할 때만
  const count = new Array(ELEMENTS).fill(0);
  for (const k of s.field) if (k !== EMPTY && kindElement(k) >= 0) count[kindElement(k)]++;
  const best = count.indexOf(Math.max(...count));
  if (s.sp >= upgradeCost(s.upgrades[best]) + 4 * SUMMON_COST) g.command({ type: 'upgrade', element: best });

  while (s.sp >= SUMMON_COST && g.command({ type: 'summon' }));
  g.drainEvents();
}

export function botRun(seed: number, maxWave = 200): { wave: number; reason: string; seconds: number } {
  const g = Game.create(seed, false);
  while (!g.s.over && g.s.wave < maxWave) {
    if (g.s.tick % (STEP_HZ / 2) === 0) botTurn(g);
    g.step();
  }
  return { wave: g.s.wave, reason: g.s.overReason || 'cap', seconds: Math.round(g.s.tick / STEP_HZ) };
}

import { ELEMENTS, STEP_HZ, SUMMON_COST, upgradeCost } from './balance';
import { autoTurn, defaultAuto } from './auto';
import { Game } from './game';
import { EMPTY, kindElement } from './kinds';

const AUTO = { ...defaultAuto(), enabled: true };

/** 밸런스 확인용: 자동 모드 + 도박(1개짜리) + 가장 많이 가진 속성 강화 */
export function botTurn(g: Game): void {
  const s = g.s;
  while (s.stones >= 1 && g.command({ type: 'gamble', option: 0 }));
  const count = new Array(ELEMENTS).fill(0);
  for (const k of s.field) if (k !== EMPTY && kindElement(k) >= 0) count[kindElement(k)]++;
  const best = count.indexOf(Math.max(...count));
  if (s.sp >= upgradeCost(s.upgrades[best]) + 4 * SUMMON_COST) g.command({ type: 'upgrade', element: best });
  autoTurn(g, AUTO);
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

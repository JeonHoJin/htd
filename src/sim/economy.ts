import {
  ELEMENTS, GAMBLE, MYTHICS, SUMMON_COST, SUMMON_TIER2_CHANCE, UPGRADE_MAX, upgradeCost,
} from './balance';
import { emptyCells, hasSpace, placeNew, setCell } from './board';
import { EMPTY, kindOf, mythicKind } from './kinds';
import { random, randInt } from './rng';
import type { State, World } from './state';

export function summon(w: World): boolean {
  const s = w.s;
  if (s.sp < SUMMON_COST) return w.reject('SP가 부족해요');
  if (!hasSpace(s)) return w.reject('필드와 서랍이 가득 찼어요');
  const element = randInt(s, ELEMENTS);
  const tier = random(s) < SUMMON_TIER2_CHANCE ? 2 : 1;
  const kind = kindOf(element, tier);
  s.sp -= SUMMON_COST;
  const cell = placeNew(w, kind)!;
  w.emit({ type: 'summon', kind, cell });
  return true;
}

export function gamble(w: World, option: number): boolean {
  const s = w.s;
  const g = GAMBLE[option];
  if (!Number.isInteger(option) || !g) return w.reject('잘못된 선택');
  if (s.stones < g.stones) return w.reject('행운석이 부족해요');
  if (!hasSpace(s)) return w.reject('필드와 서랍이 가득 찼어요');
  s.stones -= g.stones;
  w.touch(false);
  if (random(s) >= g.chance) {
    w.emit({ type: 'gamble', win: false, kind: -1, cell: -1 });
    return true;
  }
  const kind = kindOf(randInt(s, ELEMENTS), g.tier);
  const cell = placeNew(w, kind)!;
  w.emit({ type: 'gamble', win: true, kind, cell });
  return true;
}

export function upgrade(w: World, element: number): boolean {
  const s = w.s;
  if (!Number.isInteger(element) || element < 0 || element >= ELEMENTS) return w.reject('잘못된 선택');
  const level = s.upgrades[element];
  if (level >= UPGRADE_MAX) return w.reject('최대 강화예요');
  const cost = upgradeCost(level);
  if (s.sp < cost) return w.reject('SP가 부족해요');
  s.sp -= cost;
  s.upgrades[element] = level + 1;
  w.touch(false);
  w.emit({ type: 'upgrade', element, level: level + 1 });
  return true;
}

/** 조합법의 각 재료가 필드+서랍에 몇 개 있는지 (재료별 보유 수, 중복 재료 고려) */
export function recipeStatus(s: State, mythic: number): { have: boolean[]; ready: boolean } {
  const recipe = MYTHICS[mythic].recipe;
  const used = new Map<number, number>();
  const have = recipe.map(([el, tier]) => {
    const kind = kindOf(el, tier);
    const total = s.field.filter((k) => k === kind).length + s.drawer[kind];
    const n = (used.get(kind) ?? 0) + 1;
    used.set(kind, n);
    return total >= n;
  });
  return { have, ready: have.every(Boolean) };
}

export function craftable(s: State): number[] {
  const out: number[] = [];
  for (let m = 0; m < MYTHICS.length; m++) if (recipeStatus(s, m).ready) out.push(m);
  return out;
}

/** 재료는 필드 먼저, 부족분만 서랍에서. 결과는 첫 번째로 소모된 필드 칸에 놓는다. */
export function craft(w: World, mythic: number): boolean {
  const s = w.s;
  if (!Number.isInteger(mythic) || !MYTHICS[mythic]) return w.reject('잘못된 선택');
  if (!recipeStatus(s, mythic).ready) return w.reject('재료가 부족해요');
  let firstCell = -1;
  for (const [el, tier] of MYTHICS[mythic].recipe) {
    const kind = kindOf(el, tier);
    const cell = s.field.indexOf(kind);
    if (cell >= 0) {
      setCell(w, cell, EMPTY);
      if (firstCell < 0) firstCell = cell;
    } else {
      s.drawer[kind]--;
    }
  }
  const kind = mythicKind(mythic);
  let cell: number;
  if (firstCell >= 0) {
    cell = firstCell;
    setCell(w, cell, kind);
  } else if (emptyCells(s).length > 0) {
    cell = placeNew(w, kind)!;
  } else {
    // 재료가 모두 서랍에서 나왔으므로 서랍에 자리가 있다
    s.drawer[kind]++;
    cell = -1;
  }
  w.touch(true);
  w.emit({ type: 'craft', mythic, cell });
  return true;
}

import { CELLS, COLS, MYTHICS, ROWS, SUMMON_COST } from './balance';
import { drawerCap, drawerTotal, hasSpace } from './board';
import { CARDS, cardOf, elementOf } from './cards';
import { recipeStatus } from './economy';
import type { Game } from './game';
import { EMPTY, KIND_COUNT, canMerge, kindElement, kindOf, kindTier } from './kinds';
import type { State } from './state';
import { canSkipWave } from './waves';

/** 자동 모드 설정. 플레이어와 같은 명령만 내리므로 sim 규칙은 그대로다. */
export interface AutoSettings {
  enabled: boolean;
  summon: boolean;
  merge: boolean; // 합성 + 조합
  place: boolean;
  /** 적을 모두 처치하면 대기 시간 없이 다음 웨이브 */
  skip: boolean;
  /** 카드가 제시되면 알아서 고른다 */
  cards: boolean;
  /** 목표 신화. -1 = 완성에 가장 가까운 신화 */
  target: number;
}

export const defaultAuto = (): AutoSettings => ({ enabled: false, summon: true, merge: true, place: true, skip: true, cards: false, target: -1 });

function ownedCounts(s: State): number[] {
  const count = s.drawer.slice();
  for (const k of s.field) if (k !== EMPTY) count[k]++;
  return count;
}

/** 조합법 완성까지 모자란 양을 ▲ 개수로 환산 (같은 속성의 하위 단계 보유분은 차감) */
export function recipeDistance(s: State, mythic: number): number {
  const count = ownedCounts(s);
  let total = 0;
  for (const [el, tier] of MYTHICS[mythic].recipe) {
    const kind = kindOf(el, tier);
    if (count[kind] > 0) {
      count[kind]--;
      continue;
    }
    let missing = 2 ** (tier - 1);
    for (let t = tier - 1; t >= 1 && missing > 0; t--) {
      const k = kindOf(el, t);
      const use = Math.min(count[k], Math.floor(missing / 2 ** (t - 1)));
      count[k] -= use;
      missing -= use * 2 ** (t - 1);
    }
    total += missing;
  }
  return total;
}

export function pickTarget(s: State, cfg: AutoSettings): number {
  if (cfg.target >= 0 && cfg.target < MYTHICS.length) return cfg.target;
  let best = 0;
  let bestD = Infinity;
  for (let m = 0; m < MYTHICS.length; m++) {
    const d = recipeDistance(s, m);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** 0 = 바깥 테두리(적 경로와 가장 가까움), 2 = 가운데 */
export const ringOf = (cell: number) => {
  const c = cell % COLS;
  const r = Math.floor(cell / COLS);
  return Math.min(c, r, COLS - 1 - c, ROWS - 1 - r);
};

/** 목표 재료는 필요 개수만큼 보호, 재료 속성의 하위 단계는 우선 합성 */
function mergeOnce(g: Game, target: number): boolean {
  const s = g.s;
  const count = ownedCounts(s);
  const protect = new Array(KIND_COUNT).fill(0);
  const wantTier = new Array(6).fill(0); // 속성별 목표 재료 최고 단계
  for (const [el, tier] of MYTHICS[target].recipe) {
    protect[kindOf(el, tier)]++;
    wantTier[el] = Math.max(wantTier[el], tier);
  }

  let pick = -1;
  let pickScore = Infinity;
  for (let k = 0; k < KIND_COUNT; k++) {
    if (!canMerge(k) || count[k] - protect[k] < 2) continue;
    const el = kindElement(k);
    const tier = kindTier(k);
    const towardTarget = tier < wantTier[el];
    const score = (towardTarget ? 0 : 10) + tier;
    if (score < pickScore) {
      pick = k;
      pickScore = score;
    }
  }
  if (pick < 0) return false;

  // 필드 칸은 안쪽 → 바깥쪽으로 합쳐 결과가 바깥에 남게 한다
  const cells: number[] = [];
  for (let c = 0; c < CELLS; c++) if (s.field[c] === pick) cells.push(c);
  cells.sort((a, b) => ringOf(a) - ringOf(b));
  if (cells.length >= 2) {
    return g.command({ type: 'move', from: { area: 'field', cell: cells[cells.length - 1] }, to: { area: 'field', cell: cells[0] } });
  }
  if (cells.length === 1) {
    return g.command({ type: 'move', from: { area: 'drawer', kind: pick }, to: { area: 'field', cell: cells[0] } });
  }
  return g.command({ type: 'drawerMerge', kind: pick });
}

/** 서랍 유닛을 빈 칸으로: 높은 단계(신화 우선)를 바깥 칸부터 */
function placeOnce(g: Game): boolean {
  const s = g.s;
  let best = -1;
  for (let k = 0; k < KIND_COUNT; k++) {
    if (s.drawer[k] <= 0) continue;
    if (best < 0 || kindTier(k) > kindTier(best)) best = k;
  }
  if (best < 0) return false;
  let cell = -1;
  for (let c = 0; c < CELLS; c++) {
    if (s.field[c] === EMPTY && (cell < 0 || ringOf(c) < ringOf(cell))) cell = c;
  }
  if (cell < 0) return false;
  return g.command({ type: 'move', from: { area: 'drawer', kind: best }, to: { area: 'field', cell } });
}

/** 카드 점수: 등급 + 목표 신화·주력 속성과 맞는 속성 카드 우대 */
export function pickCardIndex(s: State, cfg: AutoSettings): number {
  const target = pickTarget(s, cfg);
  const wanted = new Set(MYTHICS[target].recipe.map(([el]) => el));
  const count = new Array(6).fill(0);
  for (const k of s.field) if (k !== EMPTY && kindElement(k) >= 0) count[kindElement(k)]++;
  const main = count.indexOf(Math.max(...count));
  let best = 0;
  let bestScore = -Infinity;
  s.cardOffer.forEach((code, i) => {
    const def = CARDS[cardOf(code)];
    let score = def.rarity + 1;
    if (def.perElement) score += (wanted.has(elementOf(code)) ? 2 : 0) + (elementOf(code) === main ? 1 : 0);
    if (def.name === '큰 서랍' && drawerTotal(s) < drawerCap(s) / 2) score -= 2;
    if (def.name === '재활용') score -= 1;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

const LOOP_GUARD = 64;

/** 한 번의 자동 판단. 조합 → 합성 → 배치 → 소환 → (새 유닛으로) 합성 → 배치 */
export function autoTurn(g: Game, cfg: AutoSettings): void {
  const s = g.s;
  if (!cfg.enabled || s.over) return;
  g.quiet = true;
  try {
    autoSteps(g, cfg);
  } finally {
    g.quiet = false;
  }
}

function autoSteps(g: Game, cfg: AutoSettings): void {
  const s = g.s;
  if (cfg.cards && s.cardOffer.length > 0) g.command({ type: 'pickCard', index: pickCardIndex(s, cfg) });
  const run = (f: () => boolean) => {
    for (let i = 0; i < LOOP_GUARD && f(); i++);
  };
  const mergeAll = () => {
    if (!cfg.merge) return;
    // 목표는 판단 한 번 동안 고정한다 (도중에 바뀌면 보호하던 재료를 합쳐버릴 수 있다)
    let target = pickTarget(s, cfg);
    if (recipeStatus(s, target).ready && g.command({ type: 'craft', mythic: target })) target = pickTarget(s, cfg);
    run(() => mergeOnce(g, target));
    if (recipeStatus(s, target).ready) g.command({ type: 'craft', mythic: target });
  };
  const placeAll = () => {
    if (cfg.place) run(() => placeOnce(g));
  };
  mergeAll();
  placeAll();
  if (cfg.summon) run(() => s.sp >= SUMMON_COST && hasSpace(s) && g.command({ type: 'summon' }));
  mergeAll();
  placeAll();
  if (cfg.skip && canSkipWave(s)) g.command({ type: 'skipWave' });
}


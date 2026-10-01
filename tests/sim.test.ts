import { describe, expect, it } from 'vitest';
import {
  BOSS_EVERY, BOSS_TIME_LIMIT, CELLS, DRAWER_CAP, EARTH, FIRE, LIGHT, DARK, LOSE_ENEMY_COUNT, MYTHICS,
  SUMMON_COST, STEP_HZ, WATER, WIND, affinity, ADVANTAGE, DISADVANTAGE, SELL_REFUND, FIRST_WAVE_DELAY,
  WAVE_INTERVAL,
} from '../src/sim/balance';
import { drawerTotal } from '../src/sim/board';
import { damage } from '../src/sim/combat';
import { recipeStatus } from '../src/sim/economy';
import { Game } from '../src/sim/game';
import { EMPTY, kindOf, mythicKind } from '../src/sim/kinds';
import type { GameEvent } from '../src/sim/state';

const fire1 = kindOf(FIRE, 1);
const fire2 = kindOf(FIRE, 2);
const water1 = kindOf(WATER, 1);

function game(seed = 1) {
  return Game.create(seed, false);
}
function fillField(g: Game, kind: (i: number) => number) {
  for (let i = 0; i < CELLS; i++) g.s.field[i] = kind(i);
}
const events = (g: Game, type: GameEvent['type']) => g.drainEvents().filter((e) => e.type === type);
const runSeconds = (g: Game, sec: number) => {
  for (let i = 0; i < sec * STEP_HZ; i++) g.step();
};

describe('합성/이동/교환', () => {
  it('같은 속성·단계를 드롭하면 속성 유지하고 단계 +1, 원래 칸은 빈다', () => {
    const g = game();
    g.s.field[0] = fire1;
    g.s.field[1] = fire1;
    expect(g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'field', cell: 1 } })).toBe(true);
    expect(g.s.field[1]).toBe(fire2);
    expect(g.s.field[0]).toBe(EMPTY);
  });

  it('속성이 다르면 교환한다', () => {
    const g = game();
    g.s.field[0] = fire1;
    g.s.field[1] = water1;
    g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'field', cell: 1 } });
    expect(g.s.field[0]).toBe(water1);
    expect(g.s.field[1]).toBe(fire1);
  });

  it('단계가 다르면 교환한다', () => {
    const g = game();
    g.s.field[0] = fire1;
    g.s.field[1] = fire2;
    g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'field', cell: 1 } });
    expect(g.s.field[0]).toBe(fire2);
    expect(g.s.field[1]).toBe(fire1);
  });

  it('5단계(원)끼리는 합성하지 않고 교환만 한다', () => {
    const g = game();
    const fire5 = kindOf(FIRE, 5);
    g.s.field[0] = fire5;
    g.s.field[1] = fire5;
    g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'field', cell: 1 } });
    expect(g.s.field[0]).toBe(fire5);
    expect(g.s.field[1]).toBe(fire5);
  });

  it('빈 칸으로 드롭하면 이동한다', () => {
    const g = game();
    g.s.field[0] = fire1;
    g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'field', cell: 35 } });
    expect(g.s.field[0]).toBe(EMPTY);
    expect(g.s.field[35]).toBe(fire1);
  });

  it('잘못된 칸 번호는 거절하고 상태를 바꾸지 않는다', () => {
    const g = game();
    g.s.field[0] = fire1;
    expect(g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'field', cell: 99 } })).toBe(false);
    expect(g.command({ type: 'move', from: { area: 'field', cell: 1.5 }, to: { area: 'field', cell: 0 } })).toBe(false);
    expect(g.s.field[0]).toBe(fire1);
  });
});

describe('서랍', () => {
  it('필드 → 서랍 보관, 서랍 가득이면 거절', () => {
    const g = game();
    g.s.field[0] = fire1;
    g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'drawer' } });
    expect(g.s.drawer[fire1]).toBe(1);
    expect(g.s.field[0]).toBe(EMPTY);
    g.s.drawer[water1] = DRAWER_CAP - 1;
    g.s.field[0] = fire1;
    expect(g.command({ type: 'move', from: { area: 'field', cell: 0 }, to: { area: 'drawer' } })).toBe(false);
    expect(g.s.field[0]).toBe(fire1);
  });

  it('서랍 → 필드: 같은 유닛이면 합성, 빈 칸이면 배치, 다른 유닛이면 교환(밀려난 유닛은 서랍)', () => {
    const g = game();
    g.s.drawer[fire1] = 3;
    g.s.field[0] = fire1;
    g.s.field[1] = water1;
    g.command({ type: 'move', from: { area: 'drawer', kind: fire1 }, to: { area: 'field', cell: 0 } });
    expect(g.s.field[0]).toBe(fire2);
    g.command({ type: 'move', from: { area: 'drawer', kind: fire1 }, to: { area: 'field', cell: 2 } });
    expect(g.s.field[2]).toBe(fire1);
    g.command({ type: 'move', from: { area: 'drawer', kind: fire1 }, to: { area: 'field', cell: 1 } });
    expect(g.s.field[1]).toBe(fire1);
    expect(g.s.drawer[fire1]).toBe(0);
    expect(g.s.drawer[water1]).toBe(1);
  });

  it('서랍 안 합성: 2개 → 다음 단계 1개', () => {
    const g = game();
    g.s.drawer[fire1] = 3;
    expect(g.command({ type: 'drawerMerge', kind: fire1 })).toBe(true);
    expect(g.s.drawer[fire1]).toBe(1);
    expect(g.s.drawer[fire2]).toBe(1);
    expect(g.command({ type: 'drawerMerge', kind: fire1 })).toBe(false);
  });

  it('서랍에 없는 유닛을 꺼내면 거절', () => {
    const g = game();
    expect(g.command({ type: 'move', from: { area: 'drawer', kind: fire1 }, to: { area: 'field', cell: 0 } })).toBe(false);
    expect(g.command({ type: 'move', from: { area: 'drawer', kind: 999 }, to: { area: 'field', cell: 0 } })).toBe(false);
  });
});

describe('소환', () => {
  it('비용은 고정이다', () => {
    const g = game();
    const sp0 = g.s.sp;
    for (let i = 0; i < 5; i++) g.command({ type: 'summon' });
    expect(g.s.sp).toBe(sp0 - 5 * SUMMON_COST);
    expect(g.s.field.filter((k) => k !== EMPTY)).toHaveLength(5);
  });

  it('필드가 가득 차면 서랍으로, 둘 다 가득이면 거절', () => {
    const g = game();
    g.s.sp = 10_000;
    fillField(g, (i) => kindOf(i % 6, 3));
    g.command({ type: 'summon' });
    expect(drawerTotal(g.s)).toBe(1);
    g.s.drawer[water1] += DRAWER_CAP - 1;
    expect(g.command({ type: 'summon' })).toBe(false);
  });

  it('SP가 부족하면 거절', () => {
    const g = game();
    g.s.sp = SUMMON_COST - 1;
    expect(g.command({ type: 'summon' })).toBe(false);
  });
});

describe('판매', () => {
  it('필드와 서랍 판매 시 단계별 환급', () => {
    const g = game();
    g.s.field[0] = fire2;
    g.s.drawer[fire1] = 2;
    const sp0 = g.s.sp;
    g.command({ type: 'sell', slot: { area: 'field', cell: 0 } });
    g.command({ type: 'sell', slot: { area: 'drawer', kind: fire1 } });
    expect(g.s.sp).toBe(sp0 + SELL_REFUND[2] + SELL_REFUND[1]);
    expect(g.s.field[0]).toBe(EMPTY);
    expect(g.s.drawer[fire1]).toBe(1);
  });
});

describe('신화 조합', () => {
  const m = 0; // 폭풍증기: 불⬢ + 물⬢ + 바람⬟
  const [a, b, c] = MYTHICS[m].recipe.map(([el, t]) => kindOf(el, t));

  it('필드와 서랍 재료를 합쳐 센다', () => {
    const g = game();
    g.s.field[3] = a;
    g.s.drawer[b] = 1;
    expect(recipeStatus(g.s, m).ready).toBe(false);
    g.s.drawer[c] = 1;
    expect(recipeStatus(g.s, m).ready).toBe(true);
  });

  it('필드 재료를 먼저 소모하고, 결과는 첫 번째로 소모된 필드 칸에 놓인다', () => {
    const g = game();
    g.s.field[10] = b;
    g.s.field[5] = a;
    g.s.drawer[a] = 1;
    g.s.drawer[c] = 1;
    expect(g.command({ type: 'craft', mythic: m })).toBe(true);
    expect(g.s.field[5]).toBe(mythicKind(m)); // 조합법 첫 재료(a)가 놓였던 칸
    expect(g.s.field[10]).toBe(EMPTY);
    expect(g.s.drawer[a]).toBe(1); // 필드 우선이므로 서랍의 a는 남는다
    expect(g.s.drawer[c]).toBe(0);
  });

  it('재료가 모두 서랍이고 필드가 가득이면 결과는 서랍으로', () => {
    const g = game();
    fillField(g, () => kindOf(EARTH, 1));
    g.s.drawer[a] = 1;
    g.s.drawer[b] = 1;
    g.s.drawer[c] = 1;
    g.command({ type: 'craft', mythic: m });
    expect(g.s.drawer[mythicKind(m)]).toBe(1);
    expect(drawerTotal(g.s)).toBe(1);
  });

  it('재료가 모두 서랍이고 필드에 빈 칸이 있으면 필드로', () => {
    const g = game();
    g.s.drawer[a] = 1;
    g.s.drawer[b] = 1;
    g.s.drawer[c] = 1;
    g.command({ type: 'craft', mythic: m });
    expect(g.s.field.filter((k) => k === mythicKind(m))).toHaveLength(1);
  });

  it('재료가 부족하면 거절', () => {
    const g = game();
    g.s.field[0] = a;
    expect(g.command({ type: 'craft', mythic: m })).toBe(false);
    expect(g.s.field[0]).toBe(a);
  });
});

describe('도박', () => {
  it('확률 분포가 설정과 비슷하다 (고정 시드)', () => {
    const g = game(42);
    let wins = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      g.s.stones = 1;
      g.s.field.fill(EMPTY);
      g.drainEvents();
      g.command({ type: 'gamble', option: 0 });
      if (events(g, 'gamble').some((e) => e.type === 'gamble' && e.win)) wins++;
    }
    expect(wins / N).toBeGreaterThan(0.56);
    expect(wins / N).toBeLessThan(0.64);
  });

  it('성공하면 해당 단계가 나오고 행운석이 차감된다', () => {
    const g = game(7);
    g.s.stones = 300;
    for (let i = 0; i < 100; i++) {
      g.s.field.fill(EMPTY);
      g.command({ type: 'gamble', option: 2 });
    }
    expect(g.s.stones).toBe(0);
    const wins = g.drainEvents().filter((e) => e.type === 'gamble' && e.win);
    expect(wins.length).toBeGreaterThan(0);
    for (const e of wins) if (e.type === 'gamble') expect(e.kind % 5).toBe(3); // 4단계
  });

  it('행운석이 부족하면 거절', () => {
    const g = game();
    expect(g.command({ type: 'gamble', option: 1 })).toBe(false);
  });
});

describe('상성', () => {
  it('불>바람>땅>물>불, 빛<->암', () => {
    expect(affinity(FIRE, WIND)).toBe(ADVANTAGE);
    expect(affinity(WIND, EARTH)).toBe(ADVANTAGE);
    expect(affinity(EARTH, WATER)).toBe(ADVANTAGE);
    expect(affinity(WATER, FIRE)).toBe(ADVANTAGE);
    expect(affinity(WIND, FIRE)).toBe(DISADVANTAGE);
    expect(affinity(LIGHT, DARK)).toBe(ADVANTAGE);
    expect(affinity(DARK, LIGHT)).toBe(ADVANTAGE);
    expect(affinity(FIRE, EARTH)).toBe(1);
    expect(affinity(-1, FIRE)).toBe(1);
  });

  it('데미지에 상성과 방어력·방어력 감소가 반영된다', () => {
    const g = game();
    const e = g.s.enemies[0];
    Object.assign(e, { alive: true, hp: 1000, maxHp: 1000, element: WIND, armor: 0.2, shredT: 0, shred: 0 });
    damage(g, e, 100, FIRE);
    expect(e.hp).toBeCloseTo(1000 - 100 * 1.5 * 0.8);
    Object.assign(e, { hp: 1000, shredT: 1, shred: 0.5 });
    damage(g, e, 100, -1);
    expect(e.hp).toBeCloseTo(900);
  });
});

describe('웨이브와 패배', () => {
  it('첫 웨이브가 지연 후 시작되고 적이 스폰된다', () => {
    const g = game();
    runSeconds(g, FIRST_WAVE_DELAY + 0.1);
    expect(g.s.wave).toBe(1);
    runSeconds(g, 1);
    expect(g.s.enemyCount).toBeGreaterThan(0);
  });

  it('적이 100마리 이상이면 패배', () => {
    const g = game();
    for (let i = 0; i < LOSE_ENEMY_COUNT; i++) Object.assign(g.s.enemies[i], { alive: true, hp: 1e9, speed: 1 });
    g.step();
    expect(g.s.over).toBe(true);
    expect(g.s.overReason).toBe('overrun');
  });

  it('보스를 제한시간 안에 못 잡으면 패배', () => {
    const g = game();
    // 유닛이 없으니 보스를 잡을 수 없다. 일반 적 누적으로 먼저 지지 않도록 일반 적은 계속 제거한다
    const clearRegulars = () => {
      for (const e of g.s.enemies) if (!e.boss) e.alive = false;
    };
    const steps = (FIRST_WAVE_DELAY + WAVE_INTERVAL * (BOSS_EVERY - 1) + 0.1) * STEP_HZ;
    for (let i = 0; i < steps; i++) {
      g.step();
      clearRegulars();
    }
    expect(g.s.wave).toBe(BOSS_EVERY);
    for (let i = 0; i < (BOSS_TIME_LIMIT - 1) * STEP_HZ; i++) {
      g.step();
      clearRegulars();
    }
    expect(g.s.over).toBe(false);
    runSeconds(g, 2);
    expect(g.s.over).toBe(true);
    expect(g.s.overReason).toBe('boss');
  });

  it('패배 후에는 명령과 step이 무시된다', () => {
    const g = game();
    g.s.over = true;
    expect(g.command({ type: 'summon' })).toBe(false);
    const tick = g.s.tick;
    g.step();
    expect(g.s.tick).toBe(tick);
  });
});

describe('결정론과 저장', () => {
  function play(g: Game) {
    for (let t = 0; t < 60 * STEP_HZ; t++) {
      if (t % 30 === 0) g.command({ type: 'summon' });
      g.step();
    }
  }

  it('같은 시드 + 같은 명령 → 같은 상태', () => {
    const a = game(123);
    const b = game(123);
    play(a);
    play(b);
    expect(a.serialize()).toBe(b.serialize());
  });

  it('직렬화 왕복 후 같은 진행', () => {
    const a = game(5);
    play(a);
    const b = Game.deserialize(a.serialize(), false)!;
    expect(b).not.toBeNull();
    // 투사체는 저장하지 않으므로 둘 다 비우고 비교
    for (const p of a.s.projectiles) p.alive = false;
    for (let i = 0; i < 600; i++) {
      a.step();
      b.step();
    }
    expect(b.serialize()).toBe(a.serialize());
  });

  it('깨진 저장 데이터는 거절', () => {
    const good = JSON.parse(game().serialize());
    expect(Game.deserialize('not json')).toBeNull();
    expect(Game.deserialize('null')).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...good, v: 999 }))).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...good, field: [1, 2, 3] }))).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...good, sp: -5 }))).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...good, drawer: good.drawer.map(() => 20) }))).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...good, enemies: [{ hp: 'x' }] }))).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...good, over: true }))).toBeNull();
    expect(Game.deserialize(JSON.stringify(good))).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { autoTurn, defaultAuto, pickTarget, recipeDistance, ringOf } from '../src/sim/auto';
import { CELLS, EARTH, FIRE, MYTHICS, SUMMON_COST, WATER, WIND } from '../src/sim/balance';
import { drawerTotal } from '../src/sim/board';
import { Game } from '../src/sim/game';
import { EMPTY, kindOf, mythicKind } from '../src/sim/kinds';

const on = (over: Partial<ReturnType<typeof defaultAuto>> = {}) => ({ ...defaultAuto(), enabled: true, ...over });
const game = () => {
  const g = Game.create(3, false);
  g.s.sp = 0;
  return g;
};
const count = (g: Game, kind: number) => g.s.field.filter((k) => k === kind).length + g.s.drawer[kind];

// 신화 0 폭풍증기: 불⬢ + 물⬢ + 바람⬟
const fire4 = kindOf(FIRE, 4);
const water4 = kindOf(WATER, 4);
const wind3 = kindOf(WIND, 3);

describe('자동 모드', () => {
  it('꺼져 있으면 아무것도 하지 않는다', () => {
    const g = game();
    g.s.sp = 1000;
    autoTurn(g, defaultAuto());
    expect(g.s.field.every((k) => k === EMPTY)).toBe(true);
  });

  it('SP가 있으면 소환한다', () => {
    const g = game();
    g.s.sp = SUMMON_COST * 3;
    autoTurn(g, on({ merge: false }));
    expect(g.s.sp).toBe(0);
    expect(g.s.field.filter((k) => k !== EMPTY)).toHaveLength(3);
  });

  it('목표 재료는 필요한 개수만큼 보호하고 더 합성하지 않는다', () => {
    const g = game();
    g.s.field[0] = fire4;
    g.s.field[1] = fire4;
    autoTurn(g, on({ target: 0, summon: false }));
    expect(count(g, fire4)).toBe(2); // 보호 1개 → 여분 1개뿐이라 합성 안 함
    g.s.field[2] = fire4;
    autoTurn(g, on({ target: 0, summon: false }));
    expect(count(g, fire4)).toBe(1); // 여분 2개 → 합성
  });

  it('목표와 무관한 속성도 같은 쌍이면 합친다', () => {
    const g = game();
    const earth1 = kindOf(EARTH, 1);
    g.s.field[7] = earth1;
    g.s.field[14] = earth1;
    autoTurn(g, on({ target: 0, summon: false }));
    expect(count(g, earth1)).toBe(0);
    expect(count(g, kindOf(EARTH, 2))).toBe(1);
  });

  it('필드 합성 결과는 바깥쪽 칸에 남는다', () => {
    const g = game();
    const earth1 = kindOf(EARTH, 1);
    g.s.field[14] = earth1; // 안쪽 링
    g.s.field[0] = earth1; // 바깥 링
    autoTurn(g, on({ target: 0, summon: false }));
    expect(g.s.field[0]).toBe(kindOf(EARTH, 2));
    expect(g.s.field[14]).toBe(EMPTY);
  });

  it('재료가 다 모이면 조합한다 (필드 + 서랍)', () => {
    const g = game();
    g.s.field[5] = fire4;
    g.s.drawer[water4] = 1;
    g.s.field[20] = wind3;
    autoTurn(g, on({ target: 0, summon: false, place: false }));
    expect(g.s.field[5]).toBe(mythicKind(0));
  });

  it('서랍 유닛을 높은 단계부터 바깥 빈 칸에 배치한다', () => {
    const g = game();
    for (let c = 0; c < CELLS; c++) g.s.field[c] = ringOf(c) === 0 ? kindOf(EARTH, 5) : EMPTY;
    g.s.field[0] = EMPTY; // 바깥 빈 칸 하나
    g.s.drawer[kindOf(WIND, 1)] = 1;
    g.s.drawer[mythicKind(1)] = 1;
    autoTurn(g, on({ summon: false, merge: false }));
    expect(g.s.field[0]).toBe(mythicKind(1));
    expect(drawerTotal(g.s)).toBe(0); // 남은 하나는 안쪽 칸으로
  });

  it('적이 없으면 자동으로 다음 웨이브, 끄면 넘기지 않는다', () => {
    const g = game();
    autoTurn(g, on({ skip: false }));
    g.step();
    expect(g.s.wave).toBe(0);
    autoTurn(g, on());
    g.step();
    expect(g.s.wave).toBe(1);
  });

  it('목표 자동 선택: 완성에 가장 가까운 신화', () => {
    const g = game();
    g.s.field[0] = fire4;
    g.s.field[1] = water4;
    expect(recipeDistance(g.s, 0)).toBe(4); // 바람⬟ = ▲4개 분량
    expect(pickTarget(g.s, on())).toBe(0);
    expect(pickTarget(g.s, on({ target: 3 }))).toBe(3);
  });

  it('하위 단계 보유분을 거리에서 차감한다', () => {
    const g = game();
    const before = recipeDistance(g.s, 0);
    g.s.field[0] = kindOf(WIND, 2);
    expect(recipeDistance(g.s, 0)).toBe(before - 2);
    expect(MYTHICS[0].recipe).toContainEqual([WIND, 3]);
  });

  it('자동 모드로 오래 돌려도 상태가 유효하다', () => {
    const g = Game.create(9, false);
    const cfg = on({ cards: true });
    for (let t = 0; t < 60 * 60 * 5 && !g.s.over; t++) {
      if (t % 30 === 0 || g.s.cardOffer.length > 0) autoTurn(g, cfg);
      g.step();
    }
    expect(Game.deserialize(g.serialize(), false) ?? g.s.over).toBeTruthy();
    expect(g.s.wave).toBeGreaterThan(10);
  });
});

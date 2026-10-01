import { describe, expect, it } from 'vitest';
import { autoTurn, defaultAuto } from '../src/sim/auto';
import { DRAWER_CAP, FIRE, STEP_HZ, WATER, WAVE_CLEAR_SP } from '../src/sim/balance';
import { drawerCap } from '../src/sim/board';
import { CARDS, CARD_EVERY, cardOf, codeOf, rollOffer } from '../src/sim/cards';
import { damage, unitDamage } from '../src/sim/combat';
import { Game } from '../src/sim/game';
import { kindOf } from '../src/sim/kinds';

const idx = (name: string) => CARDS.findIndex((c) => c.name === name);
const code = (name: string, el = 7) => codeOf(idx(name), CARDS[idx(name)].perElement ? el : 7);
const game = (seed = 1) => Game.create(seed, false);

/** 웨이브 n이 시작될 때까지 진행 (중간 카드는 첫 장 선택, 적은 제거) */
function toWave(g: Game, n: number) {
  while (g.s.wave < n) {
    if (g.s.cardOffer.length > 0) g.command({ type: 'pickCard', index: 0 });
    g.step();
    for (const e of g.s.enemies) e.alive = false;
  }
}

describe('카드 제시', () => {
  it(`${CARD_EVERY}웨이브마다 3장이 제시되고, 고를 때까지 sim이 멈춘다`, () => {
    const g = game();
    toWave(g, CARD_EVERY - 1);
    expect(g.s.cardOffer).toHaveLength(0);
    toWave(g, CARD_EVERY);
    expect(g.s.cardOffer).toHaveLength(3);
    const tick = g.s.tick;
    for (let i = 0; i < STEP_HZ; i++) g.step();
    expect(g.s.tick).toBe(tick);
    expect(g.command({ type: 'pickCard', index: 1 })).toBe(true);
    expect(g.s.cardOffer).toHaveLength(0);
    expect(g.s.picks).toHaveLength(1);
    g.step();
    expect(g.s.tick).toBe(tick + 1);
  });

  it('제시되는 3장은 서로 다른 카드다', () => {
    const g = game(11);
    for (let i = 0; i < 500; i++) {
      const offer = rollOffer(g.s);
      expect(new Set(offer.map(cardOf)).size).toBe(offer.length);
    }
  });

  it('최대 보유 수에 도달한 카드는 제시되지 않는다', () => {
    const g = game(5);
    g.s.picks = [code('쌍둥이 합성'), code('큰 서랍'), code('큰 서랍')];
    for (let i = 0; i < 500; i++) {
      for (const c of rollOffer(g.s)) {
        expect(cardOf(c)).not.toBe(idx('쌍둥이 합성'));
        expect(cardOf(c)).not.toBe(idx('큰 서랍'));
      }
    }
  });

  it('카드가 없으면 고를 수 없다', () => {
    expect(game().command({ type: 'pickCard', index: 0 })).toBe(false);
  });
});

describe('카드 효과', () => {
  it('행운석 카드는 즉시 +3', () => {
    const g = game();
    g.s.cardOffer = [code('네잎클로버')];
    g.command({ type: 'pickCard', index: 0 });
    expect(g.s.stones).toBe(3);
  });

  it('속성 강화는 해당 속성 데미지만 올린다', () => {
    const g = game();
    const fire = kindOf(FIRE, 2);
    const water = kindOf(WATER, 2);
    const f0 = unitDamage(fire, g.s);
    const w0 = unitDamage(water, g.s);
    g.s.picks.push(code('속성 강화', FIRE));
    expect(unitDamage(fire, g.s)).toBeCloseTo(f0 * 1.3);
    expect(unitDamage(water, g.s)).toBeCloseTo(w0);
  });

  it('큰 서랍은 서랍 용량 +5, 전리품은 클리어 보상 +50', () => {
    const g = game();
    g.s.picks.push(code('큰 서랍'), code('전리품'));
    expect(drawerCap(g.s)).toBe(DRAWER_CAP + 5);
    g.s.wave = 1;
    Object.assign(g.s.enemies[0], { alive: true, wave: 1, hp: 1, maxHp: 1, armor: 0 });
    damage(g, g.s.enemies[0], 10, -1);
    const clear = g.drainEvents().find((e) => e.type === 'waveClear');
    expect(clear && clear.type === 'waveClear' && clear.sp).toBe(WAVE_CLEAR_SP + 50);
  });

  it('쌍둥이 합성: 약 10% 확률로 2단계 상승', () => {
    const g = game(21);
    g.s.picks.push(code('쌍둥이 합성'));
    const fire1 = kindOf(FIRE, 1);
    let jumps = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      g.s.drawer.fill(0);
      g.s.drawer[fire1] = 2;
      g.command({ type: 'drawerMerge', kind: fire1 });
      if (g.s.drawer[kindOf(FIRE, 3)] === 1) jumps++;
    }
    expect(jumps / N).toBeGreaterThan(0.08);
    expect(jumps / N).toBeLessThan(0.12);
  });
});

describe('저장', () => {
  it('v2 저장 데이터는 카드 없이 이전된다', () => {
    const g = game();
    const raw = JSON.parse(g.serialize());
    delete raw.picks;
    delete raw.cardOffer;
    raw.v = 2;
    const loaded = Game.deserialize(JSON.stringify(raw), false);
    expect(loaded).not.toBeNull();
    expect(loaded!.s.picks).toEqual([]);
  });

  it('카드 상태 왕복 + 잘못된 카드는 거절', () => {
    const g = game();
    g.s.picks = [code('지옥불'), code('속사', WATER)];
    g.s.cardOffer = [code('망원경'), code('현상금'), code('균열')];
    const back = Game.deserialize(g.serialize(), false)!;
    expect(back.s.picks).toEqual(g.s.picks);
    expect(back.s.cardOffer).toEqual(g.s.cardOffer);
    const raw = JSON.parse(g.serialize());
    expect(Game.deserialize(JSON.stringify({ ...raw, picks: [9999] }), false)).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...raw, picks: [code('지옥불'), code('지옥불')] }), false)).toBeNull();
    expect(Game.deserialize(JSON.stringify({ ...raw, cardOffer: [1, 2, 3, 4] }), false)).toBeNull();
  });
});

describe('자동 카드 선택', () => {
  it('토글이 켜져 있을 때만 고른다', () => {
    const g = game();
    g.s.cardOffer = [code('현상금'), code('지옥불'), code('전리품')];
    autoTurn(g, { ...defaultAuto(), enabled: true, summon: false });
    expect(g.s.cardOffer).toHaveLength(3);
    autoTurn(g, { ...defaultAuto(), enabled: true, summon: false, cards: true });
    expect(g.s.cardOffer).toHaveLength(0);
    expect(g.s.picks).toEqual([code('지옥불')]); // 전설 우선
  });
});

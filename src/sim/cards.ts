import { ELEMENTS, ELEMENT_NAMES } from './balance';
import { random, randInt } from './rng';
import type { State, World } from './state';

// 로그라이트 카드. 선택은 State.picks에 정수 코드(card * 8 + element)로 쌓이고,
// 효과는 picks에서 계산한 Mods로 전투·경제 공식에 반영된다.

export const CARD_EVERY = 5;
export const OFFER_SIZE = 3;
const RARITY_WEIGHTS = [0.6, 0.3, 0.1];
export const RARITY_NAMES = ['일반', '희귀', '전설'];
const NO_ELEMENT = 7;

export interface CardDef {
  name: string;
  rarity: 0 | 1 | 2;
  /** 속성별 카드면 제시할 때 속성이 정해진다 */
  perElement?: boolean;
  /** 최대 보유 수 (없으면 무제한) */
  max?: number;
  desc: (element: string) => string;
}

export const CARDS: CardDef[] = [
  { name: '속성 강화', rarity: 0, perElement: true, desc: (e) => `${e} 공격력 +30%` },
  { name: '속사', rarity: 0, perElement: true, desc: (e) => `${e} 공격속도 +25%` },
  { name: '전리품', rarity: 0, desc: () => '웨이브 클리어 보상 +50 SP' },
  { name: '현상금', rarity: 0, desc: () => '처치 SP +1' },
  { name: '큰 서랍', rarity: 0, max: 2, desc: () => '서랍 +5칸' },
  { name: '네잎클로버', rarity: 0, desc: () => '행운석 +3 (즉시)' },
  { name: '망원경', rarity: 1, max: 3, desc: () => '모든 유닛 사거리 +0.3' },
  { name: '행운의 소환', rarity: 1, max: 3, desc: () => '소환 시 2단계 확률 +10%p' },
  { name: '보스 사냥꾼', rarity: 1, desc: () => '보스에게 주는 피해 +40%' },
  { name: '신화의 숨결', rarity: 1, desc: () => '신화 공격력 +30%' },
  { name: '재활용', rarity: 1, max: 1, desc: () => '판매 환급 2배' },
  { name: '쌍둥이 합성', rarity: 2, max: 1, desc: () => '합성 시 10% 확률로 2단계 상승' },
  { name: '지옥불', rarity: 2, max: 1, desc: () => '화상 피해 2배' },
  { name: '영구동토', rarity: 2, max: 1, desc: () => '물 공격이 20% 확률로 기절(0.5초)' },
  { name: '폭풍 연쇄', rarity: 2, max: 1, desc: () => '바람 연쇄 +2' },
  { name: '공명', rarity: 2, max: 1, desc: () => '빛 버프 2배' },
  { name: '균열', rarity: 2, max: 1, desc: () => '암 방어력 감소 +0.15' },
];

export const DRAWER_CARD = 4;

const C = {
  atk: 0, speed: 1, clear: 2, kill: 3, drawer: 4, stones: 5, range: 6, jackpot: 7, boss: 8, mythic: 9,
  recycle: 10, twin: 11, hellfire: 12, permafrost: 13, storm: 14, resonance: 15, rift: 16,
} as const;

export const cardOf = (code: number) => code >> 3;
export const elementOf = (code: number) => code & 7;
export const codeOf = (card: number, element: number) => (card << 3) | element;

export function isValidCode(code: unknown): code is number {
  if (!Number.isInteger(code) || (code as number) < 0) return false;
  const def = CARDS[cardOf(code as number)];
  const el = elementOf(code as number);
  return !!def && (def.perElement ? el < ELEMENTS : el === NO_ELEMENT);
}

export function cardName(code: number): string {
  return CARDS[cardOf(code)].name;
}

export function cardDesc(code: number): string {
  const def = CARDS[cardOf(code)];
  return def.desc(def.perElement ? ELEMENT_NAMES[elementOf(code)] : '');
}

export interface Mods {
  dmg: number[];
  speed: number[];
  range: number;
  clearSp: number;
  killSp: number;
  drawerCap: number;
  tier2Chance: number;
  bossDmg: number;
  mythicDmg: number;
  sellMult: number;
  twinChance: number;
  burnMult: number;
  frostStunChance: number;
  windChains: number;
  auraMult: number;
  shredAdd: number;
}

function compute(picks: number[]): Mods {
  const m: Mods = {
    dmg: new Array(ELEMENTS).fill(0), speed: new Array(ELEMENTS).fill(0), range: 0, clearSp: 0, killSp: 0,
    drawerCap: 0, tier2Chance: 0, bossDmg: 0, mythicDmg: 0, sellMult: 1, twinChance: 0, burnMult: 1,
    frostStunChance: 0, windChains: 0, auraMult: 1, shredAdd: 0,
  };
  for (const code of picks) {
    const el = elementOf(code);
    switch (cardOf(code)) {
      case C.atk: m.dmg[el] += 0.3; break;
      case C.speed: m.speed[el] += 0.25; break;
      case C.clear: m.clearSp += 50; break;
      case C.kill: m.killSp += 1; break;
      case C.drawer: m.drawerCap += 5; break;
      case C.range: m.range += 0.3; break;
      case C.jackpot: m.tier2Chance += 0.1; break;
      case C.boss: m.bossDmg += 0.4; break;
      case C.mythic: m.mythicDmg += 0.3; break;
      case C.recycle: m.sellMult = 2; break;
      case C.twin: m.twinChance = 0.1; break;
      case C.hellfire: m.burnMult = 2; break;
      case C.permafrost: m.frostStunChance = 0.2; break;
      case C.storm: m.windChains = 2; break;
      case C.resonance: m.auraMult = 2; break;
      case C.rift: m.shredAdd = 0.15; break;
    }
  }
  return m;
}

// picks는 늘어나기만 하므로 길이로 캐시를 무효화한다
const cache = new WeakMap<State, { n: number; m: Mods }>();
export function mods(s: State): Mods {
  const c = cache.get(s);
  if (c && c.n === s.picks.length) return c.m;
  const m = compute(s.picks);
  cache.set(s, { n: s.picks.length, m });
  return m;
}

const owned = (s: State, card: number) => s.picks.filter((p) => cardOf(p) === card).length;

/** 서로 다른 카드 3장 (등급 60/30/10, 최대 보유 수에 도달한 카드는 제외) */
export function rollOffer(s: State): number[] {
  const offer: number[] = [];
  const taken = new Set<number>();
  const available = (card: number) => {
    const def = CARDS[card];
    return !taken.has(card) && (def.max === undefined || owned(s, card) < def.max);
  };
  for (let i = 0; i < OFFER_SIZE; i++) {
    const r = random(s);
    let rarity = r < RARITY_WEIGHTS[0] ? 0 : r < RARITY_WEIGHTS[0] + RARITY_WEIGHTS[1] ? 1 : 2;
    let pool: number[] = [];
    for (let tries = 0; tries < 3 && pool.length === 0; tries++, rarity = (rarity + 2) % 3) {
      pool = CARDS.map((_, k) => k).filter((k) => CARDS[k].rarity === rarity && available(k));
    }
    if (pool.length === 0) break;
    const card = pool[randInt(s, pool.length)];
    taken.add(card);
    offer.push(codeOf(card, CARDS[card].perElement ? randInt(s, ELEMENTS) : NO_ELEMENT));
  }
  return offer;
}

export function offerCards(w: World): void {
  const offer = rollOffer(w.s);
  if (offer.length === 0) return;
  w.s.cardOffer = offer;
  w.touch(false);
  w.emit({ type: 'cardOffer', wave: w.s.wave });
}

export function pickCard(w: World, index: number): boolean {
  const s = w.s;
  if (s.cardOffer.length === 0) return w.reject('고를 카드가 없어요');
  if (!Number.isInteger(index) || index < 0 || index >= s.cardOffer.length) return w.reject('잘못된 선택');
  const code = s.cardOffer[index];
  s.picks.push(code);
  s.cardOffer = [];
  if (cardOf(code) === C.stones) s.stones += 3;
  w.touch(true);
  w.emit({ type: 'card', code });
  return true;
}

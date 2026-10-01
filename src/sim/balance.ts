// 모든 밸런스 수치. 조정은 이 파일에서만 한다.

export const COLS = 6;
export const ROWS = 6;
export const CELLS = COLS * ROWS;
export const DRAWER_CAP = 20;

export const STEP_HZ = 60;
export const DT = 1 / STEP_HZ;

// 속성: 0 불, 1 물, 2 바람, 3 땅, 4 빛, 5 암
export const FIRE = 0;
export const WATER = 1;
export const WIND = 2;
export const EARTH = 3;
export const LIGHT = 4;
export const DARK = 5;
export const ELEMENTS = 6;
export const ELEMENT_NAMES = ['불', '물', '바람', '땅', '빛', '암'];
export const ELEMENT_ICONS = ['🔥', '💧', '🌪', '🪨', '✨', '🌑'];
export const ELEMENT_COLORS = [0xff5a3c, 0x3ca8ff, 0x4ee6a0, 0xd9a050, 0xffe45c, 0xa45cff];

export const MAX_TIER = 5;
export const TIER_NAMES = ['', '삼각', '사각', '오각', '육각', '원'];

// 경제
export const START_SP = 100;
export const SUMMON_COST = 10;
export const SUMMON_TIER2_CHANCE = 0.05;
export const SELL_REFUND = [0, 5, 12, 28, 60, 130];
export const MYTHIC_SELL_REFUND = 200;
export const WAVE_START_SP = 10;
export const killSp = (wave: number) => 1 + Math.floor(wave / 8);
export const bossKillSp = (wave: number) => 40 + 4 * wave;

export const GAMBLE = [
  { stones: 1, chance: 0.6, tier: 2 },
  { stones: 2, chance: 0.25, tier: 3 },
  { stones: 3, chance: 0.1, tier: 4 },
];
export const STONES_PER_BOSS = 2;
export const STONES_EVERY_N_WAVES = 5;

export const UPGRADE_MAX = 30;
export const upgradeCost = (level: number) => 30 + 20 * level;
export const upgradeMult = (level: number) => 1 + 0.12 * level;

// 상성: 불 > 바람 > 땅 > 물 > 불, 빛 <-> 암
export const ADVANTAGE = 1.5;
export const DISADVANTAGE = 0.7;
const BEATS = [WIND, FIRE, EARTH, WATER, DARK, LIGHT];
export function affinity(attacker: number, defender: number): number {
  if (attacker < 0 || defender < 0) return 1;
  if (BEATS[attacker] === defender) return ADVANTAGE;
  if (BEATS[defender] === attacker) return DISADVANTAGE;
  return 1;
}

// 경로: 필드 바깥 사각 테두리, 시계 방향
export const PATH_MARGIN = 0.6;
export const PATH_SIDE = COLS + 2 * PATH_MARGIN;
export const PATH_LENGTH = 4 * PATH_SIDE;

// 웨이브
export const FIRST_WAVE_DELAY = 6;
export const WAVE_INTERVAL = 20;
export const SPAWN_WINDOW = 10;
export const BOSS_EVERY = 10;
export const BOSS_TIME_LIMIT = 60;
export const LOSE_ENEMY_COUNT = 100;
export const enemiesInWave = (wave: number) => 10 + Math.floor(wave / 2);
export const enemyHp = (wave: number) => Math.round(24 * Math.pow(1.17, wave - 1));
export const enemyArmor = (wave: number) => Math.min(0.45, 0.01 * (wave - 1));
export const ENEMY_SPEED = 1.5;
export const BOSS_HP_MULT = 30;
export const BOSS_SPEED_MULT = 0.6;
export const BOSS_ARMOR_BONUS = 0.1;
export const BOSS_CC_MULT = 0.3;

// 유닛
export const TIER_DMG_MULT = [0, 1, 2.6, 6.5, 16, 40];
export const TIER_RANGE_BONUS = 0.2;
export const PROJECTILE_SPEED = 11;
export const HIT_RADIUS = 0.3;

export interface ElementStats {
  damage: number;
  interval: number;
  range: number;
}

export const ELEMENT_STATS: ElementStats[] = [
  { damage: 10, interval: 0.8, range: 3.0 }, // 불
  { damage: 8, interval: 0.8, range: 3.0 }, // 물
  { damage: 5, interval: 0.4, range: 2.7 }, // 바람
  { damage: 22, interval: 1.6, range: 3.4 }, // 땅
  { damage: 9, interval: 0.8, range: 2.8 }, // 빛
  { damage: 9, interval: 0.9, range: 3.2 }, // 암
];

export const BURN_RATIO = 0.4; // 초당, 타격 데미지 대비
export const BURN_TIME = 2.5;
export const slowAmount = (tier: number) => 0.3 + 0.05 * tier;
export const SLOW_TIME = 1.5;
export const windChains = (tier: number) => 1 + Math.floor(tier / 2);
export const WIND_CHAIN_RANGE = 1.4;
export const WIND_CHAIN_FALLOFF = 0.6;
export const stunChance = (tier: number) => 0.08 + 0.03 * tier;
export const STUN_TIME = 0.6;
export const lightAura = (tier: number) => 0.06 * tier;
export const LIGHT_AURA_CAP = 0.6;
export const darkShred = (tier: number) => 0.1 + 0.05 * tier;
export const SHRED_TIME = 3;

// 신화
export type MythicPattern = 'nova' | 'quake' | 'beam' | 'chain' | 'frost';

export interface Mythic {
  name: string;
  recipe: [element: number, tier: number][];
  pattern: MythicPattern;
  damage: number;
  interval: number;
  range: number;
  color: number;
}

export const MYTHICS: Mythic[] = [
  { name: '폭풍증기', recipe: [[FIRE, 4], [WATER, 4], [WIND, 3]], pattern: 'nova', damage: 500, interval: 1.0, range: 2.8, color: 0xff8a5c },
  { name: '대지분쇄', recipe: [[EARTH, 4], [FIRE, 3], [DARK, 3]], pattern: 'quake', damage: 1400, interval: 3.0, range: 3.6, color: 0xe0b060 },
  { name: '일식', recipe: [[LIGHT, 4], [DARK, 4], [WATER, 3]], pattern: 'beam', damage: 1100, interval: 0.6, range: 4.2, color: 0xd0a0ff },
  { name: '천둥폭풍', recipe: [[WIND, 4], [LIGHT, 3], [EARTH, 3]], pattern: 'chain', damage: 420, interval: 0.4, range: 3.6, color: 0x9ff0ff },
  { name: '빙하시대', recipe: [[WATER, 4], [DARK, 3], [LIGHT, 3]], pattern: 'frost', damage: 350, interval: 1.2, range: 3.4, color: 0xb8e8ff },
];

export const QUAKE_STUN = 1.0;
export const BEAM_SHRED = 0.4;
export const CHAIN_COUNT = 6;
export const CHAIN_RANGE = 1.8;
export const CHAIN_FALLOFF = 0.8;
export const FROST_SLOW = 0.5;
export const FROST_TIME = 2;

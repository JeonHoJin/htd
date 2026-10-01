import { CELLS, ELEMENTS, FIRST_WAVE_DELAY, START_SP } from './balance';
import { EMPTY, KIND_COUNT } from './kinds';

export const STATE_VERSION = 3;
export const ENEMY_POOL = 128;
export const PROJECTILE_POOL = 256;

export interface Enemy {
  alive: boolean;
  id: number;
  dist: number;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  element: number;
  /** 스폰된 웨이브 (클리어 판정용) */
  wave: number;
  boss: boolean;
  slowT: number;
  slow: number;
  stunT: number;
  burnT: number;
  burnDps: number;
  shredT: number;
  shred: number;
}

export interface Projectile {
  alive: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  target: number;
  targetId: number;
  damage: number;
  kind: number;
}

export interface State {
  v: number;
  rng: number;
  tick: number;
  field: number[];
  cooldown: number[];
  drawer: number[];
  sp: number;
  stones: number;
  upgrades: number[];
  wave: number;
  waveElement: number;
  nextElement: number;
  waveTimer: number;
  spawnLeft: number;
  spawnTimer: number;
  spawnInterval: number;
  bossId: number;
  bossTimer: number;
  enemies: Enemy[];
  nextEnemyId: number;
  enemyCount: number;
  projectiles: Projectile[];
  kills: number;
  /** 고른 카드 코드 (cards.ts) */
  picks: number[];
  /** 제시 중인 카드. 비어 있지 않으면 sim이 멈춘다 */
  cardOffer: number[];
  over: boolean;
  overReason: '' | 'overrun' | 'boss';
}

export const newEnemy = (): Enemy => ({
  alive: false, id: 0, dist: 0, x: 0, y: 0, px: 0, py: 0, hp: 0, maxHp: 0, armor: 0, speed: 0,
  element: 0, wave: 0, boss: false, slowT: 0, slow: 0, stunT: 0, burnT: 0, burnDps: 0, shredT: 0, shred: 0,
});

export const newProjectile = (): Projectile => ({
  alive: false, x: 0, y: 0, px: 0, py: 0, target: 0, targetId: 0, damage: 0, kind: 0,
});

export function createState(seed: number): State {
  const s: State = {
    v: STATE_VERSION,
    rng: seed | 0,
    tick: 0,
    field: new Array(CELLS).fill(EMPTY),
    cooldown: new Array(CELLS).fill(0),
    drawer: new Array(KIND_COUNT).fill(0),
    sp: START_SP,
    stones: 0,
    upgrades: new Array(ELEMENTS).fill(0),
    wave: 0,
    waveElement: -1,
    nextElement: 0,
    waveTimer: FIRST_WAVE_DELAY,
    spawnLeft: 0,
    spawnTimer: 0,
    spawnInterval: 0,
    bossId: 0,
    bossTimer: 0,
    enemies: Array.from({ length: ENEMY_POOL }, newEnemy),
    nextEnemyId: 1,
    enemyCount: 0,
    projectiles: Array.from({ length: PROJECTILE_POOL }, newProjectile),
    kills: 0,
    picks: [],
    cardOffer: [],
    over: false,
    overReason: '',
  };
  return s;
}

export type Slot = { area: 'field'; cell: number } | { area: 'drawer'; kind: number };
export type Target = { area: 'field'; cell: number } | { area: 'drawer' };

export type Command =
  | { type: 'summon' }
  | { type: 'move'; from: Slot; to: Target }
  | { type: 'drawerMerge'; kind: number }
  | { type: 'sell'; slot: Slot }
  | { type: 'gamble'; option: number }
  | { type: 'upgrade'; element: number }
  | { type: 'craft'; mythic: number }
  | { type: 'skipWave' }
  | { type: 'pickCard'; index: number };

/** cell -1 = 서랍 */
export type GameEvent =
  | { type: 'summon'; kind: number; cell: number }
  | { type: 'merge'; kind: number; cell: number }
  | { type: 'craft'; mythic: number; cell: number }
  | { type: 'gamble'; win: boolean; kind: number; cell: number }
  | { type: 'sell'; kind: number; refund: number }
  | { type: 'upgrade'; element: number; level: number }
  | { type: 'wave'; wave: number; element: number; boss: boolean }
  | { type: 'stones'; amount: number }
  | { type: 'bossKilled'; wave: number }
  | { type: 'waveClear'; wave: number; sp: number }
  | { type: 'cardOffer'; wave: number }
  | { type: 'card'; code: number }
  | { type: 'gameOver'; wave: number; reason: 'overrun' | 'boss' }
  | { type: 'reject'; reason: string };

export type Fx =
  | { t: 'ring'; x: number; y: number; r: number; color: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: number }
  | { t: 'hit'; x: number; y: number; color: number }
  | { t: 'death'; x: number; y: number; boss: boolean };

/** sim 모듈들이 공유하는 실행 컨텍스트 (Game이 구현) */
export interface World {
  s: State;
  aura: Float32Array;
  emit(e: GameEvent): void;
  fx(f: Fx): void;
  /** 필드/서랍/강화 등 구조 변경 */
  touch(fieldChanged: boolean): void;
  reject(reason: string): false;
}

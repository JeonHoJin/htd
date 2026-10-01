import { CELLS, DRAWER_CAP, ELEMENTS, UPGRADE_MAX } from './balance';
import { drawerMerge, move, sell } from './board';
import { computeAura, stepEnemies, stepProjectiles, stepUnits } from './combat';
import { craft, gamble, summon, upgrade } from './economy';
import { EMPTY, KIND_COUNT, isValidKind } from './kinds';
import {
  ENEMY_POOL, PROJECTILE_POOL, STATE_VERSION, createState, newEnemy, newProjectile,
  type Command, type Enemy, type Fx, type GameEvent, type State, type World,
} from './state';
import { checkOverrun, skipWave, stepWaves } from './waves';

const EVENT_CAP = 256;
const FX_CAP = 512;

export class Game implements World {
  s: State;
  aura = new Float32Array(CELLS);
  /** 필드/서랍/강화/행운석 등 UI 구조가 바뀔 때마다 증가 */
  version = 0;
  private events: GameEvent[] = [];
  private fxQueue: Fx[] = [];
  private auraDirty = true;
  /** 자동 모드가 내린 명령의 거절은 토스트로 보이지 않게 한다 */
  quiet = false;

  constructor(state: State, readonly fxEnabled = true) {
    this.s = state;
  }

  static create(seed: number, fxEnabled = true): Game {
    return new Game(createState(seed), fxEnabled);
  }

  step(): void {
    if (this.s.over) return;
    if (this.auraDirty) {
      computeAura(this);
      this.auraDirty = false;
    }
    stepWaves(this);
    if (this.s.over) return;
    stepEnemies(this);
    stepUnits(this);
    stepProjectiles(this);
    checkOverrun(this);
    this.s.tick++;
  }

  command(c: Command): boolean {
    if (this.s.over) return false;
    switch (c.type) {
      case 'summon': return summon(this);
      case 'move': return move(this, c.from, c.to);
      case 'drawerMerge': return drawerMerge(this, c.kind);
      case 'sell': return sell(this, c.slot);
      case 'gamble': return gamble(this, c.option);
      case 'upgrade': return upgrade(this, c.element);
      case 'craft': return craft(this, c.mythic);
      case 'skipWave': return skipWave(this);
    }
    return false;
  }

  emit(e: GameEvent): void {
    if (this.events.length >= EVENT_CAP) this.events.shift();
    this.events.push(e);
  }

  fx(f: Fx): void {
    if (this.fxEnabled && this.fxQueue.length < FX_CAP) this.fxQueue.push(f);
  }

  touch(fieldChanged: boolean): void {
    this.version++;
    if (fieldChanged) this.auraDirty = true;
  }

  reject(reason: string): false {
    if (!this.quiet) this.emit({ type: 'reject', reason });
    return false;
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  drainFx(): Fx[] {
    const out = this.fxQueue;
    this.fxQueue = [];
    return out;
  }

  /** 투사체는 저장하지 않는다(복원 시 사라짐). */
  serialize(): string {
    const s = this.s;
    return JSON.stringify({ ...s, enemies: s.enemies.filter((e) => e.alive), projectiles: [] });
  }

  /** 신뢰할 수 없는 입력. 검증에 실패하면 null. */
  static deserialize(json: string, fxEnabled = true): Game | null {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return null;
    }
    const s = validateState(raw);
    return s ? new Game(s, fxEnabled) : null;
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const numArray = (v: unknown, len: number, ok: (x: unknown) => boolean): v is number[] =>
  Array.isArray(v) && v.length === len && v.every(ok);

const ENEMY_NUM_KEYS = [
  'dist', 'x', 'y', 'hp', 'maxHp', 'armor', 'speed', 'slowT', 'slow', 'stunT', 'burnT', 'burnDps', 'shredT', 'shred',
] as const;

function validateEnemy(v: unknown): Enemy | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const e = newEnemy();
  for (const k of ENEMY_NUM_KEYS) {
    if (!isNum(r[k]) || Math.abs(r[k] as number) > 1e12) return null;
    e[k] = r[k] as number;
  }
  if (!isInt(r.id, 0, 2 ** 31) || !isInt(r.element, 0, ELEMENTS - 1) || typeof r.boss !== 'boolean') return null;
  if (!isInt(r.wave, 0, 2 ** 31)) return null;
  e.id = r.id;
  e.element = r.element;
  e.wave = r.wave;
  e.boss = r.boss;
  e.alive = true;
  e.px = e.x;
  e.py = e.y;
  return e.hp > 0 ? e : null;
}

export function validateState(v: unknown): State | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (r.v !== STATE_VERSION) return null;
  if (!numArray(r.field, CELLS, (k) => k === EMPTY || isValidKind(k as number))) return null;
  if (!numArray(r.cooldown, CELLS, isNum)) return null;
  if (!numArray(r.drawer, KIND_COUNT, (n) => isInt(n, 0, DRAWER_CAP))) return null;
  if ((r.drawer as number[]).reduce((a, b) => a + b, 0) > DRAWER_CAP) return null;
  if (!numArray(r.upgrades, ELEMENTS, (n) => isInt(n, 0, UPGRADE_MAX))) return null;
  for (const k of ['sp', 'stones', 'wave', 'nextEnemyId', 'kills', 'tick'] as const) {
    if (!isInt(r[k], 0, 2 ** 31)) return null;
  }
  if (!isInt(r.rng, -(2 ** 31), 2 ** 31)) return null;
  if (!isInt(r.waveElement, -1, ELEMENTS - 1) || !isInt(r.nextElement, 0, ELEMENTS - 1)) return null;
  for (const k of ['waveTimer', 'spawnTimer', 'spawnInterval', 'bossTimer'] as const) {
    if (!isNum(r[k]) || Math.abs(r[k] as number) > 1e6) return null;
  }
  if (!isInt(r.spawnLeft, 0, 1000) || !isInt(r.bossId, 0, 2 ** 31)) return null;
  if (r.over !== false) return null; // 끝난 판은 저장하지 않는다
  if (!Array.isArray(r.enemies) || r.enemies.length > ENEMY_POOL) return null;

  const s = createState(0);
  const enemies = r.enemies.map(validateEnemy);
  if (enemies.some((e) => e === null)) return null;
  s.enemies = [...(enemies as Enemy[]), ...Array.from({ length: ENEMY_POOL - enemies.length }, newEnemy)];
  s.projectiles = Array.from({ length: PROJECTILE_POOL }, newProjectile);
  s.enemyCount = enemies.length;
  s.rng = r.rng as number;
  s.tick = r.tick as number;
  s.field = r.field as number[];
  s.cooldown = r.cooldown as number[];
  s.drawer = r.drawer as number[];
  s.sp = r.sp as number;
  s.stones = r.stones as number;
  s.upgrades = r.upgrades as number[];
  s.wave = r.wave as number;
  s.waveElement = r.waveElement as number;
  s.nextElement = r.nextElement as number;
  s.waveTimer = r.waveTimer as number;
  s.spawnLeft = r.spawnLeft as number;
  s.spawnTimer = r.spawnTimer as number;
  s.spawnInterval = r.spawnInterval as number;
  s.bossId = r.bossId as number;
  s.bossTimer = r.bossTimer as number;
  s.nextEnemyId = r.nextEnemyId as number;
  s.kills = r.kills as number;
  return s;
}

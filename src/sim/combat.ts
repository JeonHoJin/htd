import {
  BEAM_SHRED, BOSS_CC_MULT, BURN_RATIO, BURN_TIME, CELLS, CHAIN_COUNT, CHAIN_FALLOFF, CHAIN_RANGE, COLS,
  DARK, DT, EARTH, ELEMENT_COLORS, ELEMENT_STATS, FIRE, FROST_SLOW, FROST_TIME, HIT_RADIUS, LIGHT,
  LIGHT_AURA_CAP, MYTHICS, PATH_LENGTH, PATH_MARGIN, PATH_SIDE, PROJECTILE_SPEED, QUAKE_STUN, SHRED_TIME,
  SLOW_TIME, STONES_PER_BOSS, STUN_TIME, TIER_DMG_MULT, TIER_RANGE_BONUS, WATER, WIND, WIND_CHAIN_FALLOFF,
  WIND_CHAIN_RANGE, affinity, bossKillSp, darkShred, killSp, lightAura, slowAmount, stunChance, upgradeMult,
  windChains,
} from './balance';
import { EMPTY, isMythic, kindElement, kindTier, mythicIndex } from './kinds';
import { random } from './rng';
import { checkWaveClear } from './waves';
import type { Enemy, World } from './state';

export const cellX = (cell: number) => (cell % COLS) + 0.5;
export const cellY = (cell: number) => Math.floor(cell / COLS) + 0.5;

/** 경로 위 거리 → 좌표 (시계 방향, 좌상단 모서리에서 시작) */
export function pathPoint(dist: number, out: { x: number; y: number }): void {
  const s = dist % PATH_LENGTH;
  const m = PATH_MARGIN;
  const L = PATH_SIDE;
  if (s < L) {
    out.x = -m + s;
    out.y = -m;
  } else if (s < 2 * L) {
    out.x = COLS + m;
    out.y = -m + (s - L);
  } else if (s < 3 * L) {
    out.x = COLS + m - (s - 2 * L);
    out.y = COLS + m;
  } else {
    out.x = -m;
    out.y = COLS + m - (s - 3 * L);
  }
}

export function unitRange(kind: number): number {
  if (isMythic(kind)) return MYTHICS[mythicIndex(kind)].range;
  return ELEMENT_STATS[kindElement(kind)].range + TIER_RANGE_BONUS * (kindTier(kind) - 1);
}

export function computeAura(w: World): void {
  const { field } = w.s;
  w.aura.fill(0);
  for (let c = 0; c < CELLS; c++) {
    const k = field[c];
    if (k === EMPTY || kindElement(k) !== LIGHT) continue;
    const bonus = lightAura(kindTier(k));
    const cx = c % COLS;
    const cy = Math.floor(c / COLS);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= COLS || y >= COLS) continue;
        const n = y * COLS + x;
        w.aura[n] = Math.min(LIGHT_AURA_CAP, w.aura[n] + bonus);
      }
    }
  }
}

function frontInRange(w: World, x: number, y: number, range: number): number {
  const r2 = range * range;
  let best = -1;
  let bestDist = -1;
  const es = w.s.enemies;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy <= r2 && e.dist > bestDist) {
      best = i;
      bestDist = e.dist;
    }
  }
  return best;
}

/** 이미 맞은 적(hit)을 제외하고 (x,y)에서 가장 가까운 적 */
function nearestExcept(w: World, x: number, y: number, range: number, hit: number[], hitLen: number): number {
  let best = -1;
  let bestD = range * range;
  const es = w.s.enemies;
  outer: for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.alive) continue;
    for (let h = 0; h < hitLen; h++) if (hit[h] === i) continue outer;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

function kill(w: World, e: Enemy): void {
  const s = w.s;
  e.alive = false;
  s.kills++;
  if (e.boss) {
    s.sp += bossKillSp(s.wave);
    s.stones += STONES_PER_BOSS;
    s.bossTimer = 0;
    w.touch(false);
    w.emit({ type: 'bossKilled', wave: s.wave });
    w.emit({ type: 'stones', amount: STONES_PER_BOSS });
  } else {
    s.sp += killSp(s.wave);
  }
  checkWaveClear(w, e.wave);
  w.fx({ t: 'death', x: e.x, y: e.y, boss: e.boss });
}

/** element -1 = 무속성(상성 없음) */
export function damage(w: World, e: Enemy, amount: number, element: number): void {
  if (!e.alive) return;
  const armor = Math.max(0, e.armor - (e.shredT > 0 ? e.shred : 0));
  e.hp -= amount * affinity(element, e.element) * (1 - armor);
  if (e.hp <= 0) kill(w, e);
}

const ccTime = (e: Enemy, t: number) => (e.boss ? t * BOSS_CC_MULT : t);

function applyBurn(e: Enemy, dps: number): void {
  e.burnDps = e.burnT > 0 ? Math.max(e.burnDps, dps) : dps;
  e.burnT = BURN_TIME;
}
function applySlow(e: Enemy, amount: number, time: number): void {
  e.slow = e.slowT > 0 ? Math.max(e.slow, amount) : amount;
  e.slowT = Math.max(e.slowT, time);
}
function applyStun(e: Enemy, time: number): void {
  e.stunT = Math.max(e.stunT, ccTime(e, time));
}
function applyShred(e: Enemy, amount: number): void {
  e.shred = e.shredT > 0 ? Math.max(e.shred, amount) : amount;
  e.shredT = SHRED_TIME;
}

const pt = { x: 0, y: 0 };

export function stepEnemies(w: World): void {
  let count = 0;
  for (const e of w.s.enemies) {
    if (!e.alive) continue;
    if (e.burnT > 0) {
      e.burnT -= DT;
      damage(w, e, e.burnDps * DT, -1);
      if (!e.alive) continue;
    }
    if (e.slowT > 0) e.slowT -= DT;
    if (e.shredT > 0) e.shredT -= DT;
    e.px = e.x;
    e.py = e.y;
    if (e.stunT > 0) {
      e.stunT -= DT;
    } else {
      e.dist += e.speed * (e.slowT > 0 ? 1 - e.slow : 1) * DT;
      pathPoint(e.dist, pt);
      e.x = pt.x;
      e.y = pt.y;
    }
    count++;
  }
  w.s.enemyCount = count;
}

const hitBuf: number[] = new Array(CHAIN_COUNT + 2).fill(-1);

function fireRegular(w: World, cell: number, kind: number, target: number): void {
  const s = w.s;
  const el = kindElement(kind);
  const tier = kindTier(kind);
  const dmg = ELEMENT_STATS[el].damage * TIER_DMG_MULT[tier] * upgradeMult(s.upgrades[el]) * (1 + w.aura[cell]);
  let p = null;
  for (const q of s.projectiles) {
    if (!q.alive) {
      p = q;
      break;
    }
  }
  const e = s.enemies[target];
  if (!p) {
    onHit(w, kind, dmg, target);
    return;
  }
  p.alive = true;
  p.x = p.px = cellX(cell);
  p.y = p.py = cellY(cell);
  p.target = target;
  p.targetId = e.id;
  p.damage = dmg;
  p.kind = kind;
}

function onHit(w: World, kind: number, dmg: number, target: number): void {
  const s = w.s;
  const e = s.enemies[target];
  const el = kindElement(kind);
  const tier = kindTier(kind);
  w.fx({ t: 'hit', x: e.x, y: e.y, color: ELEMENT_COLORS[el] });
  switch (el) {
    case FIRE:
      applyBurn(e, dmg * BURN_RATIO);
      break;
    case WATER:
      applySlow(e, slowAmount(tier), SLOW_TIME);
      break;
    case EARTH:
      if (random(s) < stunChance(tier)) applyStun(e, STUN_TIME);
      break;
    case DARK:
      applyShred(e, darkShred(tier));
      break;
  }
  const x = e.x;
  const y = e.y;
  damage(w, e, dmg, el);
  if (el === WIND) {
    hitBuf[0] = target;
    let fromX = x;
    let fromY = y;
    let d = dmg;
    const n = windChains(tier);
    for (let k = 1; k <= n; k++) {
      const j = nearestExcept(w, fromX, fromY, WIND_CHAIN_RANGE, hitBuf, k);
      if (j < 0) break;
      hitBuf[k] = j;
      const t = s.enemies[j];
      d *= WIND_CHAIN_FALLOFF;
      w.fx({ t: 'line', x1: fromX, y1: fromY, x2: t.x, y2: t.y, color: ELEMENT_COLORS[WIND] });
      fromX = t.x;
      fromY = t.y;
      damage(w, t, d, WIND);
    }
  }
}

function fireMythic(w: World, cell: number, kind: number): boolean {
  const s = w.s;
  const m = MYTHICS[mythicIndex(kind)];
  const x = cellX(cell);
  const y = cellY(cell);
  const dmg = m.damage * upgradeMult(s.upgrades[m.recipe[0][0]]) * (1 + w.aura[cell]);
  const front = frontInRange(w, x, y, m.range);
  if (front < 0) return false;

  if (m.pattern === 'beam' || m.pattern === 'chain') {
    const e = s.enemies[front];
    w.fx({ t: 'line', x1: x, y1: y, x2: e.x, y2: e.y, color: m.color });
    if (m.pattern === 'beam') {
      applyShred(e, BEAM_SHRED);
      damage(w, e, dmg, -1);
      return true;
    }
    hitBuf[0] = front;
    let fromX = e.x;
    let fromY = e.y;
    let d = dmg;
    damage(w, e, d, -1);
    for (let k = 1; k <= CHAIN_COUNT; k++) {
      const j = nearestExcept(w, fromX, fromY, CHAIN_RANGE, hitBuf, k);
      if (j < 0) break;
      hitBuf[k] = j;
      const t = s.enemies[j];
      d *= CHAIN_FALLOFF;
      w.fx({ t: 'line', x1: fromX, y1: fromY, x2: t.x, y2: t.y, color: m.color });
      fromX = t.x;
      fromY = t.y;
      damage(w, t, d, -1);
    }
    return true;
  }

  // 범위형: nova / quake / frost
  w.fx({ t: 'ring', x, y, r: m.range, color: m.color });
  const r2 = m.range * m.range;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > r2) continue;
    if (m.pattern === 'nova') applyBurn(e, dmg * BURN_RATIO * 0.5);
    else if (m.pattern === 'quake') applyStun(e, QUAKE_STUN);
    else applySlow(e, FROST_SLOW, FROST_TIME);
    damage(w, e, dmg, -1);
  }
  return true;
}

export function stepUnits(w: World): void {
  const { field, cooldown } = w.s;
  for (let cell = 0; cell < CELLS; cell++) {
    const kind = field[cell];
    if (kind === EMPTY) continue;
    if (cooldown[cell] > 0) {
      cooldown[cell] -= DT;
      if (cooldown[cell] > 0) continue;
    }
    if (isMythic(kind)) {
      if (fireMythic(w, cell, kind)) cooldown[cell] += MYTHICS[mythicIndex(kind)].interval;
      else cooldown[cell] = 0;
      continue;
    }
    const target = frontInRange(w, cellX(cell), cellY(cell), unitRange(kind));
    if (target < 0) {
      cooldown[cell] = 0;
      continue;
    }
    fireRegular(w, cell, kind, target);
    cooldown[cell] += ELEMENT_STATS[kindElement(kind)].interval;
  }
}

export function stepProjectiles(w: World): void {
  const step = PROJECTILE_SPEED * DT;
  for (const p of w.s.projectiles) {
    if (!p.alive) continue;
    const e = w.s.enemies[p.target];
    if (!e.alive || e.id !== p.targetId) {
      p.alive = false;
      continue;
    }
    p.px = p.x;
    p.py = p.y;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= step + HIT_RADIUS) {
      p.alive = false;
      onHit(w, p.kind, p.damage, p.target);
      continue;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
  }
}

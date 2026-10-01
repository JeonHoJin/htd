import {
  BOSS_ARMOR_BONUS, BOSS_EVERY, BOSS_HP_MULT, BOSS_SPEED_MULT, BOSS_TIME_LIMIT, DT, ELEMENTS, ENEMY_SPEED,
  LOSE_ENEMY_COUNT, SPAWN_WINDOW, STONES_EVERY_N_WAVES, WAVE_INTERVAL, WAVE_START_SP, enemiesInWave,
  enemyArmor, enemyHp,
} from './balance';
import { pathPoint } from './combat';
import { randInt } from './rng';
import type { Enemy, World } from './state';

const pt = { x: 0, y: 0 };

function spawn(w: World, boss: boolean): Enemy | null {
  const s = w.s;
  let e: Enemy | null = null;
  for (const q of s.enemies) {
    if (!q.alive) {
      e = q;
      break;
    }
  }
  if (!e) return null;
  const hp = enemyHp(s.wave) * (boss ? BOSS_HP_MULT : 1);
  pathPoint(0, pt);
  e.alive = true;
  e.id = s.nextEnemyId++;
  e.dist = 0;
  e.x = e.px = pt.x;
  e.y = e.py = pt.y;
  e.hp = e.maxHp = hp;
  e.armor = enemyArmor(s.wave) + (boss ? BOSS_ARMOR_BONUS : 0);
  e.speed = ENEMY_SPEED * (boss ? BOSS_SPEED_MULT : 1);
  e.element = s.waveElement;
  e.boss = boss;
  e.slowT = e.slow = e.stunT = e.burnT = e.burnDps = e.shredT = e.shred = 0;
  s.enemyCount++;
  return e;
}

function startWave(w: World): void {
  const s = w.s;
  s.wave++;
  s.waveTimer += WAVE_INTERVAL;
  s.waveElement = s.nextElement;
  s.nextElement = randInt(s, ELEMENTS);
  s.sp += WAVE_START_SP;
  const boss = s.wave % BOSS_EVERY === 0;
  if (s.wave % STONES_EVERY_N_WAVES === 0) {
    s.stones++;
    w.emit({ type: 'stones', amount: 1 });
  }
  if (boss) {
    const e = spawn(w, true);
    if (e) {
      s.bossId = e.id;
      s.bossTimer = BOSS_TIME_LIMIT;
    }
  } else {
    const n = enemiesInWave(s.wave);
    s.spawnLeft = n;
    s.spawnInterval = SPAWN_WINDOW / n;
    s.spawnTimer = 0;
  }
  w.touch(false);
  w.emit({ type: 'wave', wave: s.wave, element: s.waveElement, boss });
}

export function stepWaves(w: World): void {
  const s = w.s;
  s.waveTimer -= DT;
  if (s.waveTimer <= 0) startWave(w);
  if (s.spawnLeft > 0) {
    s.spawnTimer -= DT;
    while (s.spawnTimer <= 0 && s.spawnLeft > 0) {
      spawn(w, false);
      s.spawnLeft--;
      s.spawnTimer += s.spawnInterval;
    }
  }
  if (s.bossTimer > 0) {
    s.bossTimer -= DT;
    if (s.bossTimer <= 0) {
      const alive = s.enemies.some((e) => e.alive && e.id === s.bossId);
      if (alive) return gameOver(w, 'boss');
      s.bossTimer = 0;
    }
  }
}

export function checkOverrun(w: World): void {
  if (w.s.enemyCount >= LOSE_ENEMY_COUNT) gameOver(w, 'overrun');
}

function gameOver(w: World, reason: 'overrun' | 'boss'): void {
  const s = w.s;
  if (s.over) return;
  s.over = true;
  s.overReason = reason;
  w.touch(false);
  w.emit({ type: 'gameOver', wave: s.wave, reason });
}

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  CELLS, COLS, ELEMENT_COLORS, ELEMENT_STATS, MYTHICS, PATH_LENGTH, PATH_MARGIN, PATH_SIDE, ROWS,
} from '../sim/balance';
import { cellX, cellY, unitRange } from '../sim/combat';
import type { Game } from '../sim/game';
import { EMPTY, isMythic, kindElement, kindTier, mythicIndex } from '../sim/kinds';
import { ENEMY_POOL, PROJECTILE_POOL, type Fx } from '../sim/state';
import { makeTextures, type Textures } from './textures';

export interface ViewState {
  selectedCell: number;
  dragCell: number;
  hoverCell: number;
}

/** 필드 바깥 여백 포함 월드 크기 (경로 + 적 크기) */
const WORLD_MIN = -PATH_MARGIN - 0.55;
const WORLD_SIZE = COLS + 2 * (PATH_MARGIN + 0.55);
const PARTICLES = 400;
const UNIT_SIZE = 0.74;
/** Graphics는 월드 단위가 작으면 원이 각지게 그려지므로 K배로 그리고 축소한다 */
const K = 100;

interface Particle {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface TimedFx {
  fx: Fx;
  t: number;
  max: number;
}

export const kindColor = (kind: number) =>
  isMythic(kind) ? MYTHICS[mythicIndex(kind)].color : ELEMENT_COLORS[kindElement(kind)];

export class Renderer {
  private world = new Container();
  private plates: Sprite[] = [];
  private glows: Sprite[] = [];
  private units: Sprite[] = [];
  private enemies: Sprite[] = [];
  private hpBg: Sprite[] = [];
  private hpFill: Sprite[] = [];
  private projectiles: Sprite[] = [];
  private particleSprites: Sprite[] = [];
  private particles: Particle[] = [];
  private fxG = new Graphics();
  private rangeG = new Graphics();
  private timedFx: TimedFx[] = [];
  private flash = new Float32Array(CELLS);
  private rangeKey = '';
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private lastW = 0;
  private lastH = 0;
  private time = 0;

  private constructor(
    private app: Application,
    private tex: Textures,
    private host: HTMLElement,
  ) {}

  static async create(canvas: HTMLCanvasElement, host: HTMLElement): Promise<Renderer> {
    const app = new Application();
    await app.init({
      canvas,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      background: '#0b0d17',
      preference: 'webgl',
      autoStart: false,
    });
    app.ticker.stop();
    const r = new Renderer(app, makeTextures(app.renderer), host);
    r.build();
    return r;
  }

  private build(): void {
    const { tex, world } = this;
    this.app.stage.addChild(world);

    world.addChild(this.track());

    const plateLayer = new Container();
    const glowLayer = new Container();
    const unitLayer = new Container();
    const enemyLayer = new Container();
    const hpLayer = new Container();
    const projLayer = new Container();
    const partLayer = new Container();
    world.addChild(plateLayer, this.rangeG, glowLayer, unitLayer, enemyLayer, hpLayer, projLayer, partLayer, this.fxG);
    this.fxG.blendMode = 'add';
    this.fxG.scale.set(1 / K);
    this.rangeG.scale.set(1 / K);

    const sprite = (t: Texture, layer: Container, size: number, add = false) => {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.setSize(size);
      if (add) s.blendMode = 'add';
      layer.addChild(s);
      return s;
    };

    for (let c = 0; c < CELLS; c++) {
      const p = sprite(tex.plate, plateLayer, 0.98);
      p.position.set(cellX(c), cellY(c));
      this.plates.push(p);
      const g = sprite(tex.glow, glowLayer, 1.3, true);
      g.position.set(cellX(c), cellY(c));
      this.glows.push(g);
      const u = sprite(tex.shapes[1], unitLayer, UNIT_SIZE);
      u.position.set(cellX(c), cellY(c));
      this.units.push(u);
    }
    for (let i = 0; i < ENEMY_POOL; i++) {
      this.enemies.push(sprite(tex.enemy, enemyLayer, 0.42));
      const bg = sprite(Texture.WHITE, hpLayer, 1);
      bg.tint = 0x000000;
      bg.alpha = 0.6;
      this.hpBg.push(bg);
      const fill = sprite(Texture.WHITE, hpLayer, 1);
      fill.anchor.set(0, 0.5);
      this.hpFill.push(fill);
    }
    for (let i = 0; i < PROJECTILE_POOL; i++) this.projectiles.push(sprite(tex.dot, projLayer, 0.26, true));
    for (let i = 0; i < PARTICLES; i++) {
      this.particleSprites.push(sprite(tex.dot, partLayer, 0.14, true));
      this.particles.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0 });
    }
    for (const list of [this.enemies, this.hpBg, this.hpFill, this.projectiles, this.particleSprites]) {
      for (const s of list) s.visible = false;
    }
  }

  private track(): Graphics {
    const m = PATH_MARGIN * K;
    const side = PATH_SIDE * K;
    const band = 0.31 * K;
    const g = new Graphics();
    g.scale.set(1 / K);
    // 도로: 바깥 둥근 사각형에서 안쪽을 비운다
    g.roundRect(-m - band, -m - band, side + 2 * band, side + 2 * band, 0.5 * K).fill({ color: 0x161c38 });
    g.roundRect(-m + band, -m + band, side - 2 * band, side - 2 * band, 0.2 * K).fill({ color: 0x0b0d17 });
    g.roundRect(-m, -m, side, side, 0.3 * K).stroke({ width: 0.025 * K, color: 0x34407a });
    // 진행 방향 표시
    const arrow = (x: number, y: number, dx: number, dy: number) => {
      const s = 0.12;
      g.moveTo((x - dx * s - dy * s) * K, (y - dy * s + dx * s) * K)
        .lineTo((x + dx * s) * K, (y + dy * s) * K)
        .lineTo((x - dx * s + dy * s) * K, (y - dy * s - dx * s) * K)
        .stroke({ width: 0.04 * K, color: 0x4a5aa0, cap: 'round', join: 'round' });
    };
    const pm = PATH_MARGIN;
    for (let i = 1; i < 6; i += 2) {
      arrow(i + 0.5, -pm, 1, 0);
      arrow(COLS + pm, i + 0.5, 0, 1);
      arrow(COLS - i - 0.5, ROWS + pm, -1, 0);
      arrow(-pm, ROWS - i - 0.5, 0, -1);
    }
    return g;
  }

  private layout(): void {
    // iOS는 회전 시 resize 이벤트가 레이아웃 갱신보다 먼저 올 수 있다.
    // 이벤트 대신 매 프레임 실제 영역 크기와 비교해 맞춘다.
    const hw = Math.max(1, this.host.clientWidth);
    const hh = Math.max(1, this.host.clientHeight);
    if (hw !== this.app.screen.width || hh !== this.app.screen.height) this.app.renderer.resize(hw, hh);
    const { width, height } = this.app.screen;
    if (width === this.lastW && height === this.lastH) return;
    this.lastW = width;
    this.lastH = height;
    this.scale = Math.min(width, height) / WORLD_SIZE;
    this.offsetX = (width - WORLD_SIZE * this.scale) / 2 - WORLD_MIN * this.scale;
    this.offsetY = (height - WORLD_SIZE * this.scale) / 2 - WORLD_MIN * this.scale;
    this.world.scale.set(this.scale);
    this.world.position.set(this.offsetX, this.offsetY);
  }

  /** 화면 좌표 → 필드 칸 (필드 밖이면 -1) */
  cellAt(clientX: number, clientY: number): number {
    const rect = this.app.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.offsetX) / this.scale;
    const y = (clientY - rect.top - this.offsetY) / this.scale;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
    return Math.floor(y) * COLS + Math.floor(x);
  }

  flashCell(cell: number): void {
    if (cell >= 0 && cell < CELLS) this.flash[cell] = 1;
  }

  render(game: Game, alpha: number, view: ViewState, dt: number): void {
    this.layout();
    this.time += dt;
    const s = game.s;

    for (const f of game.drainFx()) this.addFx(f);

    // 유닛
    for (let c = 0; c < CELLS; c++) {
      const kind = s.field[c];
      const plate = this.plates[c];
      const unit = this.units[c];
      const glow = this.glows[c];
      this.flash[c] = Math.max(0, this.flash[c] - dt * 2.5);
      plate.tint = c === view.hoverCell ? 0x7c8cff : c === view.selectedCell ? 0xffffff : 0xb0b8ff;
      plate.alpha = c === view.hoverCell || c === view.selectedCell ? 1 : 0.55 + this.flash[c] * 0.45;
      if (kind === EMPTY) {
        unit.visible = glow.visible = false;
        continue;
      }
      const tier = kindTier(kind);
      const mythic = isMythic(kind);
      const color = kindColor(kind);
      unit.visible = glow.visible = true;
      unit.texture = this.tex.shapes[mythic ? 0 : tier];
      unit.tint = color;
      glow.tint = color;
      const interval = mythic ? MYTHICS[mythicIndex(kind)].interval : ELEMENT_STATS[kindElement(kind)].interval;
      const recoil = Math.max(0, s.cooldown[c] / interval - 0.85) * 0.6;
      const size = UNIT_SIZE * (1 + recoil + this.flash[c] * 0.25);
      unit.setSize(size);
      unit.rotation = mythic ? this.time * 0.8 : 0;
      unit.alpha = c === view.dragCell ? 0.3 : 1;
      const tierGlow = mythic ? 6 : tier;
      glow.setSize(0.85 + 0.09 * tierGlow + (mythic ? Math.sin(this.time * 4) * 0.08 : 0));
      glow.alpha = (0.08 + 0.045 * tierGlow) * (c === view.dragCell ? 0.3 : 1);
    }

    this.drawRange(game, view.selectedCell);

    // 적
    for (let i = 0; i < ENEMY_POOL; i++) {
      const e = s.enemies[i];
      const spr = this.enemies[i];
      const bg = this.hpBg[i];
      const fill = this.hpFill[i];
      if (!e.alive) {
        spr.visible = bg.visible = fill.visible = false;
        continue;
      }
      spr.visible = bg.visible = fill.visible = true;
      let x = e.px + (e.x - e.px) * alpha;
      let y = e.py + (e.y - e.py) * alpha;
      // 같은 경로에 겹치지 않도록 id 기반으로 살짝 옆으로
      const jitter = ((((e.id * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.26;
      const side = Math.floor((e.dist % PATH_LENGTH) / PATH_SIDE);
      if (side % 2 === 0) y += jitter;
      else x += jitter;
      const size = e.boss ? 0.95 + Math.sin(this.time * 5) * 0.05 : 0.42;
      spr.texture = e.boss ? this.tex.boss : this.tex.enemy;
      spr.setSize(size);
      spr.position.set(x, y);
      // 기절하면 회전이 멈추고, 감속되면 흐려진다
      if (e.stunT <= 0) spr.rotation += dt * (e.boss ? 0.6 : 1.5) * (e.slowT > 0 ? 1 - e.slow : 1);
      spr.tint = ELEMENT_COLORS[e.element];
      spr.alpha = e.slowT > 0 ? 0.65 : 1;
      const w = e.boss ? 1.1 : 0.5;
      const h = e.boss ? 0.1 : 0.065;
      const by = y - size * 0.62;
      bg.position.set(x, by);
      bg.setSize(w + 0.04, h + 0.04);
      const ratio = Math.max(0, e.hp / e.maxHp);
      fill.position.set(x - w / 2, by);
      fill.setSize(w * ratio, h);
      fill.tint = e.boss ? 0xff4a6a : ratio > 0.5 ? 0x6cf0a8 : ratio > 0.25 ? 0xffc04a : 0xff5a5a;
    }

    // 투사체
    for (let i = 0; i < PROJECTILE_POOL; i++) {
      const p = s.projectiles[i];
      const spr = this.projectiles[i];
      if (!p.alive) {
        spr.visible = false;
        continue;
      }
      spr.visible = true;
      spr.position.set(p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha);
      spr.tint = kindColor(p.kind);
      spr.setSize(0.16 + 0.04 * kindTier(p.kind));
    }

    this.updateParticles(dt);
    this.drawFx(dt);
    this.app.render();
  }

  private drawRange(game: Game, cell: number): void {
    const kind = cell >= 0 ? game.s.field[cell] : EMPTY;
    const key = `${cell}:${kind}`;
    if (key === this.rangeKey) return;
    this.rangeKey = key;
    this.rangeG.clear();
    if (kind === EMPTY) return;
    this.rangeG
      .circle(cellX(cell) * K, cellY(cell) * K, unitRange(kind) * K)
      .fill({ color: kindColor(kind), alpha: 0.07 })
      .stroke({ width: 0.03 * K, color: kindColor(kind), alpha: 0.6 });
  }

  private addFx(f: Fx): void {
    if (f.t === 'hit') {
      this.burst(f.x, f.y, 3, 1.2, 0.25);
      return;
    }
    if (f.t === 'death') {
      this.burst(f.x, f.y, f.boss ? 40 : 8, f.boss ? 3 : 1.8, f.boss ? 0.8 : 0.4);
      return;
    }
    if (this.timedFx.length > 80) return;
    this.timedFx.push({ fx: f, t: 0, max: f.t === 'ring' ? 0.35 : 0.16 });
  }

  private burst(x: number, y: number, n: number, speed: number, life: number): void {
    let made = 0;
    for (let i = 0; i < PARTICLES && made < n; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.life = p.max = life * (0.6 + Math.random() * 0.4);
      made++;
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < PARTICLES; i++) {
      const p = this.particles[i];
      const spr = this.particleSprites[i];
      if (p.life <= 0) {
        spr.visible = false;
        continue;
      }
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      spr.visible = true;
      spr.position.set(p.x, p.y);
      spr.alpha = Math.max(0, p.life / p.max);
      spr.tint = 0xffe0b0;
    }
  }

  private drawFx(dt: number): void {
    const g = this.fxG;
    g.clear();
    let w = 0;
    for (const item of this.timedFx) {
      item.t += dt;
      if (item.t >= item.max) continue;
      this.timedFx[w++] = item;
      const k = item.t / item.max;
      const f = item.fx;
      if (f.t === 'ring') {
        g.circle(f.x * K, f.y * K, f.r * (0.3 + 0.7 * k) * K).stroke({ width: (0.12 * (1 - k) + 0.02) * K, color: f.color, alpha: 1 - k });
      } else if (f.t === 'line') {
        g.moveTo(f.x1 * K, f.y1 * K).lineTo(f.x2 * K, f.y2 * K).stroke({ width: (0.09 * (1 - k) + 0.02) * K, color: f.color, alpha: 1 - k });
      }
    }
    this.timedFx.length = w;
  }
}


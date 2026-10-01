import { Graphics, type Renderer, type Texture } from 'pixi.js';

/** 텍스처 한 변의 픽셀 수. 스프라이트는 월드 단위로 축소해서 쓴다. */
export const TEX = 128;

export interface Textures {
  shapes: Texture[]; // index = tier (1..5), 0 = 신화 별
  glow: Texture;
  plate: Texture;
  enemy: Texture;
  boss: Texture;
  dot: Texture;
}

function polygon(sides: number, r: number, rotation = -Math.PI / 2): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push(TEX / 2 + Math.cos(a) * r, TEX / 2 + Math.sin(a) * r);
  }
  return pts;
}

function star(points: number, outer: number, inner: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(TEX / 2 + Math.cos(a) * r, TEX / 2 + Math.sin(a) * r);
  }
  return pts;
}

/** 네온 도형: 반투명 면 + 굵은 외곽선 + 작은 심 */
function neon(g: Graphics, outline: number[] | null, core: number[] | null, circleR = 0): Graphics {
  if (outline) {
    g.poly(outline).fill({ color: 0xffffff, alpha: 0.22 }).stroke({ width: 9, color: 0xffffff, join: 'round' });
  } else {
    g.circle(TEX / 2, TEX / 2, circleR).fill({ color: 0xffffff, alpha: 0.22 }).stroke({ width: 9, color: 0xffffff });
  }
  if (core) g.poly(core).fill({ color: 0xffffff, alpha: 0.9 });
  else g.circle(TEX / 2, TEX / 2, circleR * 0.32).fill({ color: 0xffffff, alpha: 0.9 });
  return g;
}

export function makeTextures(renderer: Renderer): Textures {
  const gen = (g: Graphics) => {
    // 텍스처 크기를 TEX로 고정하기 위한 투명 경계
    g.rect(0, 0, TEX, TEX).fill({ color: 0, alpha: 0.001 });
    const t = renderer.generateTexture({ target: g, resolution: 1, antialias: true });
    g.destroy();
    return t;
  };

  const R = 50;
  const shapes: Texture[] = [
    gen(neon(new Graphics(), star(5, 58, 24), star(5, 22, 9))),
    gen(neon(new Graphics(), polygon(3, R + 6, -Math.PI / 2), polygon(3, 16))),
    gen(neon(new Graphics(), polygon(4, R, -Math.PI / 4), polygon(4, 15, -Math.PI / 4))),
    gen(neon(new Graphics(), polygon(5, R), polygon(5, 15))),
    gen(neon(new Graphics(), polygon(6, R, 0), polygon(6, 15, 0))),
    gen(neon(new Graphics(), null, null, R - 2)),
  ];

  const glowG = new Graphics();
  for (let i = 0; i < 20; i++) glowG.circle(TEX / 2, TEX / 2, 64 - i * 3).fill({ color: 0xffffff, alpha: 0.045 });
  const glow = gen(glowG);

  const plate = gen(
    new Graphics()
      .roundRect(6, 6, TEX - 12, TEX - 12, 22)
      .fill({ color: 0xffffff, alpha: 0.07 })
      .stroke({ width: 3, color: 0xffffff, alpha: 0.16 }),
  );

  const enemy = gen(
    new Graphics()
      .poly(star(8, 54, 40))
      .fill({ color: 0xffffff })
      .circle(TEX / 2, TEX / 2, 22)
      .fill({ color: 0x000000, alpha: 0.45 }),
  );
  const boss = gen(
    new Graphics()
      .poly(star(12, 62, 44))
      .fill({ color: 0xffffff })
      .circle(TEX / 2, TEX / 2, 30)
      .fill({ color: 0x000000, alpha: 0.5 })
      .circle(TEX / 2, TEX / 2, 14)
      .fill({ color: 0xffffff }),
  );

  const dotG = new Graphics();
  for (let i = 0; i < 10; i++) dotG.circle(TEX / 2, TEX / 2, 30 - i * 3).fill({ color: 0xffffff, alpha: 0.12 + i * 0.05 });
  const dot = gen(dotG);

  return { shapes, glow, plate, enemy, boss, dot };
}

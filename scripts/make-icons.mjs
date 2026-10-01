// 앱 아이콘 PNG 생성 (의존성 없음): 어두운 배경 + 네온 육각형 + 삼각형 심
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel((x + 0.5) / size, (y + 0.5) / size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 정다각형 SDF (음수 = 안쪽) */
function polySdf(px, py, sides, r, rot) {
  let d = -Infinity;
  const apothem = r * Math.cos(Math.PI / sides);
  for (let i = 0; i < sides; i++) {
    const a = rot + ((i + 0.5) / sides) * Math.PI * 2;
    d = Math.max(d, px * Math.cos(a) + py * Math.sin(a) - apothem);
  }
  return d;
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v) => Math.max(0, Math.min(1, v));

function pixel(u, v) {
  const x = u - 0.5;
  const y = v - 0.5;
  // 배경: 남색 비네트
  const vign = clamp(1 - Math.hypot(x, y) * 1.3);
  let r = mix(8, 22, vign);
  let g = mix(10, 28, vign);
  let b = mix(20, 58, vign);
  const add = (cr, cg, cb, k) => {
    r = Math.min(255, r + cr * k);
    g = Math.min(255, g + cg * k);
    b = Math.min(255, b + cb * k);
  };
  const hex = Math.abs(polySdf(x, y, 6, 0.3, 0));
  add(124, 140, 255, Math.exp(-hex / 0.03) * 0.8); // 글로우
  add(255, 255, 255, clamp(1 - hex / 0.012)); // 외곽선
  const tri = polySdf(x, y + 0.01, 3, 0.12, -Math.PI / 2);
  add(255, 90, 60, clamp(-tri / 0.006)); // 불 삼각형
  add(255, 120, 80, Math.exp(-Math.max(0, tri) / 0.03) * 0.5);
  return [r, g, b];
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, png(size, pixel));
  console.log('wrote', name);
}

// mulberry32. 상태는 State.rng(uint32)에 둬서 직렬화와 결정론을 보장한다.
export interface RngHolder {
  rng: number;
}

export function random(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (h: RngHolder, n: number) => Math.floor(random(h) * n);

// localStorage 래퍼. 같은 origin을 다른 앱과 공유하므로 모든 키에 접두사를 붙인다.
// 저장된 값은 신뢰하지 않는다: 크기를 제한하고, 호출자가 구조를 검증한다.
import { MYTHICS } from './sim/balance';
import { defaultAuto, type AutoSettings } from './sim/auto';

const PREFIX = 'htd:';
const MAX_BYTES = 256 * 1024;

export function load(key: string): string | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v !== null && v.length <= MAX_BYTES ? v : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  if (value.length > MAX_BYTES) return;
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // 저장 공간 부족·사파리 개인정보 보호 모드 등: 조용히 무시
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // 무시
  }
}

export function clearAll(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // 무시
  }
}

export interface Meta {
  best: number;
  discovered: boolean[];
  speed: 1 | 2;
  fps: boolean;
  auto: AutoSettings;
}

export function loadMeta(): Meta {
  const meta: Meta = { best: 0, discovered: MYTHICS.map(() => false), speed: 1, fps: false, auto: defaultAuto() };
  try {
    const raw: unknown = JSON.parse(load('meta') ?? 'null');
    if (typeof raw !== 'object' || raw === null) return meta;
    const r = raw as Record<string, unknown>;
    if (Number.isInteger(r.best) && (r.best as number) >= 0 && (r.best as number) < 1e6) meta.best = r.best as number;
    const d = r.discovered;
    if (Array.isArray(d)) meta.discovered = meta.discovered.map((_, i) => d[i] === true);
    if (r.speed === 2) meta.speed = 2;
    if (r.fps === true) meta.fps = true;
    const a = r.auto;
    if (typeof a === 'object' && a !== null) {
      const o = a as Record<string, unknown>;
      for (const k of ['enabled', 'summon', 'merge', 'place', 'skip'] as const) if (typeof o[k] === 'boolean') meta.auto[k] = o[k] as boolean;
      if (Number.isInteger(o.target) && (o.target as number) >= -1 && (o.target as number) < MYTHICS.length) meta.auto.target = o.target as number;
    }
  } catch {
    // 깨진 데이터는 기본값으로
  }
  return meta;
}

export const saveMeta = (meta: Meta) => save('meta', JSON.stringify(meta));

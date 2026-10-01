import { ELEMENT_ICONS, ELEMENT_NAMES, MYTHICS, TIER_NAMES } from '../sim/balance';
import { isMythic, kindElement, kindTier, mythicIndex } from '../sim/kinds';

export function shapeClass(kind: number): string {
  return isMythic(kind) ? 'shape m' : `shape t${kindTier(kind)} e${kindElement(kind)}`;
}

export function shapeEl(kind: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = shapeClass(kind);
  return el;
}

export function unitName(kind: number): string {
  if (isMythic(kind)) return `✸ ${MYTHICS[mythicIndex(kind)].name}`;
  const el = kindElement(kind);
  const tier = kindTier(kind);
  return `${ELEMENT_ICONS[el]} ${ELEMENT_NAMES[el]} ${TIER_NAMES[tier]} (${tier}단계)`;
}

/** 텍스트 노드만 쓰는 작은 DOM 헬퍼. 외부 데이터를 HTML로 넣지 않는다. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; disabled?: boolean } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.className) el.className = props.className;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.disabled && el instanceof HTMLButtonElement) el.disabled = true;
  for (const c of children) el.append(c);
  return el;
}

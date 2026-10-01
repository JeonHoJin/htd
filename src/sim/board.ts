import { CELLS, DRAWER_CAP, MYTHIC_SELL_REFUND, SELL_REFUND } from './balance';
import { canMerge, EMPTY, isMythic, isValidKind, kindTier } from './kinds';
import { randInt } from './rng';
import type { Slot, State, Target, World } from './state';

export const isCell = (cell: unknown): cell is number =>
  Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < CELLS;

export function drawerTotal(s: State): number {
  let n = 0;
  for (const c of s.drawer) n += c;
  return n;
}

export function emptyCells(s: State): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) if (s.field[i] === EMPTY) out.push(i);
  return out;
}

export const hasSpace = (s: State) => s.field.includes(EMPTY) || drawerTotal(s) < DRAWER_CAP;

/** 새 유닛을 무작위 빈 칸에, 없으면 서랍에 넣는다. 반환: 칸(-1 = 서랍), 공간이 없으면 null */
export function placeNew(w: World, kind: number): number | null {
  const s = w.s;
  const empty = emptyCells(s);
  if (empty.length > 0) {
    const cell = empty[randInt(s, empty.length)];
    setCell(w, cell, kind);
    return cell;
  }
  if (drawerTotal(s) < DRAWER_CAP) {
    s.drawer[kind]++;
    w.touch(false);
    return -1;
  }
  return null;
}

export function setCell(w: World, cell: number, kind: number): void {
  w.s.field[cell] = kind;
  w.s.cooldown[cell] = 0;
  w.touch(true);
}

const drawerHas = (s: State, kind: number) => isValidKind(kind) && s.drawer[kind] > 0;

/** 드래그 결과: 합성 / 이동 / 교환 / 보관 */
export function move(w: World, from: Slot, to: Target): boolean {
  const s = w.s;
  if (from.area === 'field') {
    if (!isCell(from.cell) || s.field[from.cell] === EMPTY) return w.reject('잘못된 위치');
    const kind = s.field[from.cell];
    if (to.area === 'drawer') {
      if (drawerTotal(s) >= DRAWER_CAP) return w.reject('서랍이 가득 찼어요');
      s.drawer[kind]++;
      setCell(w, from.cell, EMPTY);
      return true;
    }
    if (!isCell(to.cell) || to.cell === from.cell) return w.reject('잘못된 위치');
    const other = s.field[to.cell];
    if (other === kind && canMerge(kind)) {
      setCell(w, to.cell, kind + 1);
      setCell(w, from.cell, EMPTY);
      w.emit({ type: 'merge', kind: kind + 1, cell: to.cell });
      return true;
    }
    // 빈 칸이면 이동, 아니면 교환
    setCell(w, to.cell, kind);
    setCell(w, from.cell, other);
    return true;
  }

  if (!drawerHas(s, from.kind)) return w.reject('서랍에 없는 유닛');
  const kind = from.kind;
  if (to.area === 'drawer') return false;
  if (!isCell(to.cell)) return w.reject('잘못된 위치');
  const other = s.field[to.cell];
  s.drawer[kind]--;
  if (other === kind && canMerge(kind)) {
    setCell(w, to.cell, kind + 1);
    w.emit({ type: 'merge', kind: kind + 1, cell: to.cell });
    return true;
  }
  if (other !== EMPTY) s.drawer[other]++; // 밀려난 유닛은 서랍으로
  setCell(w, to.cell, kind);
  return true;
}

export function drawerMerge(w: World, kind: number): boolean {
  const s = w.s;
  if (!isValidKind(kind) || s.drawer[kind] < 2) return w.reject('같은 유닛이 2개 필요해요');
  if (!canMerge(kind)) return w.reject('더 합성할 수 없어요');
  s.drawer[kind] -= 2;
  s.drawer[kind + 1]++;
  w.touch(false);
  w.emit({ type: 'merge', kind: kind + 1, cell: -1 });
  return true;
}

export const refundOf = (kind: number) => (isMythic(kind) ? MYTHIC_SELL_REFUND : SELL_REFUND[kindTier(kind)]);

export function sell(w: World, slot: Slot): boolean {
  const s = w.s;
  let kind: number;
  if (slot.area === 'field') {
    if (!isCell(slot.cell) || s.field[slot.cell] === EMPTY) return w.reject('잘못된 위치');
    kind = s.field[slot.cell];
    setCell(w, slot.cell, EMPTY);
  } else {
    if (!drawerHas(s, slot.kind)) return w.reject('서랍에 없는 유닛');
    kind = slot.kind;
    s.drawer[kind]--;
    w.touch(false);
  }
  const refund = refundOf(kind);
  s.sp += refund;
  w.emit({ type: 'sell', kind, refund });
  return true;
}

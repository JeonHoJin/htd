import type { Renderer, ViewState } from './render/renderer';
import type { Game } from './sim/game';
import { EMPTY } from './sim/kinds';
import type { Command, Slot, Target } from './sim/state';
import { shapeClass } from './ui/icons';
import type { UI } from './ui/ui';

const DRAG_THRESHOLD = 8;

interface Press {
  pointerId: number;
  x: number;
  y: number;
  from: Slot | null; // null = 빈 곳을 누름
  fromDrawer: boolean;
}

/** 탭(선택)과 드래그(합성/이동/교환/보관)를 하나의 흐름으로 처리한다. */
export class Input {
  readonly view: ViewState = { selectedCell: -1, dragCell: -1, hoverCell: -1 };
  private press: Press | null = null;
  private dragging = false;

  constructor(
    stage: HTMLElement,
    private drawer: HTMLElement,
    drawerList: HTMLElement,
    private ghost: HTMLElement,
    private renderer: Renderer,
    private ui: UI,
    private game: () => Game,
    private command: (c: Command) => boolean,
  ) {
    stage.addEventListener('pointerdown', (e) => this.onStageDown(e));
    drawerList.addEventListener('pointerdown', (e) => this.onDrawerDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.reset());
    // iOS 롱프레스 메뉴·확대 방지
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    drawerList.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 매 프레임: 선택 상태를 렌더러용 view에 반영 */
  sync(): void {
    const sel = this.ui.selection;
    this.view.selectedCell = sel?.area === 'field' ? sel.cell : -1;
  }

  private onStageDown(e: PointerEvent): void {
    if (this.game().s.over || this.press) return;
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    const from: Slot | null = cell >= 0 && this.game().s.field[cell] !== EMPTY ? { area: 'field', cell } : null;
    this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from, fromDrawer: false };
  }

  private onDrawerDown(e: PointerEvent): void {
    if (this.game().s.over || this.press) return;
    const stack = (e.target as HTMLElement).closest<HTMLElement>('.stack');
    if (!stack) return;
    const kind = Number(stack.dataset.kind);
    this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from: { area: 'drawer', kind }, fromDrawer: true };
  }

  private onMove(e: PointerEvent): void {
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId) return;
    if (!this.dragging) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD || !p.from) return;
      // 서랍에서 가로로 움직이면 스크롤로 양보
      if (p.fromDrawer && Math.abs(dx) > Math.abs(dy)) {
        this.press = null;
        return;
      }
      this.startDrag(p.from);
    }
    this.ghost.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`;
    const overDrawer = this.isOverDrawer(e.clientX, e.clientY);
    this.drawer.classList.toggle('drop-hover', overDrawer && p.from?.area === 'field');
    this.view.hoverCell = overDrawer ? -1 : this.renderer.cellAt(e.clientX, e.clientY);
  }

  private startDrag(from: Slot): void {
    const s = this.game().s;
    const kind = from.area === 'field' ? s.field[from.cell] : from.kind;
    this.dragging = true;
    this.ui.select(null);
    this.ghost.className = shapeClass(kind);
    this.ghost.hidden = false;
    this.view.dragCell = from.area === 'field' ? from.cell : -1;
  }

  private onUp(e: PointerEvent): void {
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId) return;
    if (this.dragging && p.from) {
      const target = this.dropTarget(e.clientX, e.clientY);
      if (target) this.command({ type: 'move', from: p.from, to: target });
    } else {
      this.tap(p.from);
    }
    this.reset();
  }

  private tap(from: Slot | null): void {
    const sel = this.ui.selection;
    const same =
      sel && from && sel.area === from.area &&
      (sel.area === 'field' ? sel.cell === (from as typeof sel).cell : sel.kind === (from as typeof sel).kind);
    this.ui.select(same ? null : from);
  }

  private dropTarget(x: number, y: number): Target | null {
    if (this.isOverDrawer(x, y)) return { area: 'drawer' };
    const cell = this.renderer.cellAt(x, y);
    return cell >= 0 ? { area: 'field', cell } : null;
  }

  private isOverDrawer(x: number, y: number): boolean {
    const r = this.drawer.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private reset(): void {
    this.press = null;
    this.dragging = false;
    this.ghost.hidden = true;
    this.drawer.classList.remove('drop-hover');
    this.view.dragCell = -1;
    this.view.hoverCell = -1;
  }
}

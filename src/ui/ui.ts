import {
  DRAWER_CAP, ELEMENT_ICONS, ELEMENT_NAMES, ELEMENT_STATS, ELEMENTS, GAMBLE, LOSE_ENEMY_COUNT, MYTHICS,
  SUMMON_COST, TIER_DMG_MULT, TIER_NAMES, UPGRADE_MAX, upgradeCost, upgradeMult,
} from '../sim/balance';
import { drawerTotal, hasSpace, refundOf } from '../sim/board';
import { unitRange } from '../sim/combat';
import { craftable, recipeStatus } from '../sim/economy';
import type { Game } from '../sim/game';
import { EMPTY, KIND_COUNT, canMerge, isMythic, kindElement, kindOf, kindTier, mythicIndex, mythicKind } from '../sim/kinds';
import type { Command, GameEvent, Slot } from '../sim/state';
import type { Meta } from '../storage';
import { h, shapeClass, shapeEl, unitName } from './icons';

export type Selection = Slot | null;
type SheetKind = 'gamble' | 'upgrade' | 'craft' | 'pause' | 'over';

export interface UiActions {
  command(c: Command): boolean;
  setPaused(paused: boolean): void;
  setSpeed(speed: 1 | 2): void;
  setFps(on: boolean): void;
  newGame(): void;
  flashCell(cell: number): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const EFFECTS = ['화상', '감속', '연쇄', '기절', '주변 버프', '방어력 감소'];
const PATTERNS: Record<string, string> = {
  nova: '주변 폭발 + 화상',
  quake: '광역 기절',
  beam: '강력한 광선 + 방어력 감소',
  chain: '연쇄 번개',
  frost: '광역 감속',
};

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export class UI {
  selection: Selection = null;
  private lastVersion = -1;
  private sheet: SheetKind | null = null;
  private refreshers: (() => void)[] = [];
  private confirmNewGame = false;

  private el = {
    wave: $('hud-wave').querySelector('b')!,
    next: $('hud-next').querySelector('b')!,
    nextEl: $('hud-next').querySelector('.el') as HTMLElement,
    meterFill: $('enemy-meter').querySelector('.meter-fill') as HTMLElement,
    meterText: $('enemy-meter').querySelector('span')!,
    boss: $('hud-boss'),
    bossText: $('hud-boss').querySelector('b')!,
    sp: $('hud-sp').querySelector('b')!,
    stones: $('hud-stones').querySelector('b')!,
    kills: $('hud-kills').querySelector('b')!,
    speed: $<HTMLButtonElement>('btn-speed'),
    drawerCount: $('drawer-count'),
    drawerList: $('drawer-list'),
    summon: $<HTMLButtonElement>('btn-summon'),
    gamble: $<HTMLButtonElement>('btn-gamble'),
    craft: $<HTMLButtonElement>('btn-craft'),
    selection: $('selection'),
    bar: $('bar'),
    selIcon: $('sel-icon'),
    selName: $('sel-name'),
    selStats: $('sel-stats'),
    selMerge: $<HTMLButtonElement>('sel-merge'),
    selSell: $<HTMLButtonElement>('sel-sell'),
    sheet: $('sheet'),
    sheetTitle: $('sheet-title'),
    sheetBody: $('sheet-body'),
    toasts: $('toasts'),
  };

  constructor(
    private game: () => Game,
    private actions: UiActions,
    private meta: Meta,
  ) {
    setText($('summon-cost'), `SP ${SUMMON_COST}`);
    this.el.summon.addEventListener('click', () => actions.command({ type: 'summon' }));
    this.el.gamble.addEventListener('click', () => this.toggleSheet('gamble'));
    $('btn-upgrade').addEventListener('click', () => this.toggleSheet('upgrade'));
    this.el.craft.addEventListener('click', () => this.toggleSheet('craft'));
    $('btn-pause').addEventListener('click', () => this.openSheet('pause'));
    $('sheet-close').addEventListener('click', () => this.closeSheet());
    this.el.speed.addEventListener('click', () => {
      this.meta.speed = this.meta.speed === 1 ? 2 : 1;
      actions.setSpeed(this.meta.speed);
    });
    this.el.selSell.addEventListener('click', () => {
      if (this.selection && actions.command({ type: 'sell', slot: this.selection })) this.select(null);
    });
    $('sel-close').addEventListener('click', () => this.select(null));
    this.el.selMerge.addEventListener('click', () => {
      const sel = this.selection;
      if (sel?.area === 'drawer') actions.command({ type: 'drawerMerge', kind: sel.kind });
    });
  }

  get sheetOpen(): SheetKind | null {
    return this.sheet;
  }

  select(sel: Selection): void {
    this.selection = sel;
    this.lastVersion = -1;
  }

  /** 매 프레임 호출. 값이 바뀐 곳만 DOM을 건드린다. */
  update(): void {
    const g = this.game();
    const s = g.s;
    setText(this.el.wave, String(s.wave));
    setText(this.el.next, `${Math.max(0, Math.ceil(s.waveTimer))}s`);
    setText(this.el.nextEl, ELEMENT_ICONS[s.nextElement]);
    const ratio = Math.min(1, s.enemyCount / LOSE_ENEMY_COUNT);
    const width = `${(ratio * 100).toFixed(0)}%`;
    if (this.el.meterFill.style.width !== width) this.el.meterFill.style.width = width;
    setText(this.el.meterText, `적 ${s.enemyCount}/${LOSE_ENEMY_COUNT}`);
    this.el.boss.hidden = s.bossTimer <= 0;
    if (s.bossTimer > 0) setText(this.el.bossText, `${Math.ceil(s.bossTimer)}s`);
    setText(this.el.sp, String(s.sp));
    setText(this.el.stones, String(s.stones));
    setText(this.el.kills, String(s.kills));
    setText(this.el.speed, `${this.meta.speed}×`);
    this.el.summon.disabled = s.sp < SUMMON_COST || !hasSpace(s) || s.over;

    if (g.version !== this.lastVersion) {
      this.lastVersion = g.version;
      this.renderDrawer();
      this.renderSelection();
      this.el.craft.classList.toggle('glow', craftable(s).length > 0);
      this.el.gamble.classList.toggle('glow', s.stones >= 1);
      if (this.sheet && this.sheet !== 'pause' && this.sheet !== 'over') this.renderSheet();
    }
    for (const r of this.refreshers) r();
  }

  private renderDrawer(): void {
    const s = this.game().s;
    setText(this.el.drawerCount, `${drawerTotal(s)}/${DRAWER_CAP}`);
    const list = this.el.drawerList;
    list.replaceChildren();
    for (let k = 0; k < KIND_COUNT; k++) {
      const n = s.drawer[k];
      if (n <= 0) continue;
      const stack = h('div', { className: 'stack' }, [shapeEl(k), h('span', { className: 'count', text: `×${n}` })]);
      stack.dataset.kind = String(k);
      if (this.selection?.area === 'drawer' && this.selection.kind === k) stack.classList.add('selected');
      list.append(stack);
    }
    if (!list.childElementCount) list.append(h('div', { className: 'drawer-empty', text: '필드가 가득 차면 소환한 유닛이 여기로 와요' }));
  }

  private renderSelection(): void {
    const s = this.game().s;
    const sel = this.selection;
    let kind = EMPTY;
    let count = 0;
    if (sel?.area === 'field') kind = s.field[sel.cell];
    if (sel?.area === 'drawer') {
      count = s.drawer[sel.kind];
      kind = count > 0 ? sel.kind : EMPTY;
    }
    if (kind === EMPTY) {
      this.selection = null;
      this.el.selection.hidden = true;
      this.el.bar.classList.remove('selecting');
      return;
    }
    this.el.selection.hidden = false;
    this.el.bar.classList.add('selecting');
    this.el.selIcon.className = shapeClass(kind);
    setText(this.el.selName, unitName(kind) + (count > 1 ? ` ×${count}` : ''));
    const dmg = isMythic(kind)
      ? MYTHICS[mythicIndex(kind)].damage * upgradeMult(s.upgrades[MYTHICS[mythicIndex(kind)].recipe[0][0]])
      : ELEMENT_STATS[kindElement(kind)].damage * TIER_DMG_MULT[kindTier(kind)] * upgradeMult(s.upgrades[kindElement(kind)]);
    const effect = isMythic(kind) ? PATTERNS[MYTHICS[mythicIndex(kind)].pattern] : EFFECTS[kindElement(kind)];
    setText(this.el.selStats, `공격 ${Math.round(dmg)} · 사거리 ${unitRange(kind).toFixed(1)} · ${effect}`);
    setText(this.el.selSell, `판매 +${refundOf(kind)}`);
    this.el.selMerge.hidden = !(sel?.area === 'drawer' && count >= 2 && canMerge(kind));
  }

  toggleSheet(kind: SheetKind): void {
    if (this.sheet === kind) this.closeSheet();
    else this.openSheet(kind);
  }

  openSheet(kind: SheetKind): void {
    this.sheet = kind;
    this.confirmNewGame = false;
    if (kind === 'pause' || kind === 'over') this.actions.setPaused(true);
    this.el.sheet.hidden = false;
    this.renderSheet();
  }

  closeSheet(): void {
    if (this.sheet === 'over') return;
    const wasPause = this.sheet === 'pause';
    this.sheet = null;
    this.refreshers = [];
    this.el.sheet.hidden = true;
    if (wasPause) this.actions.setPaused(false);
  }

  private renderSheet(): void {
    const body = this.el.sheetBody;
    body.replaceChildren();
    this.refreshers = [];
    switch (this.sheet) {
      case 'gamble': return this.gambleSheet(body);
      case 'upgrade': return this.upgradeSheet(body);
      case 'craft': return this.craftSheet(body);
      case 'pause': return this.pauseSheet(body);
      case 'over': return this.overSheet(body);
    }
  }

  private gambleSheet(body: HTMLElement): void {
    setText(this.el.sheetTitle, `도박 · 행운석 🍀 ${this.game().s.stones}`);
    GAMBLE.forEach((opt, i) => {
      const btn = h('button', { className: 'btn go', text: `🍀 ${opt.stones}` });
      btn.addEventListener('click', () => this.actions.command({ type: 'gamble', option: i }));
      this.refreshers.push(() => {
        const s = this.game().s;
        btn.disabled = s.stones < opt.stones || !hasSpace(s);
      });
      body.append(
        h('div', { className: 'row' }, [
          shapeEl(kindOf(0, opt.tier)),
          h('div', { className: 'grow' }, [
            h('div', { text: `${Math.round(opt.chance * 100)}% 확률로 ${TIER_NAMES[opt.tier]}(${opt.tier}단계)` }),
            h('div', { className: 'dim', text: '속성은 무작위' }),
          ]),
          btn,
        ]),
      );
    });
    body.append(h('div', { className: 'dim', text: '행운석: 5웨이브마다 1개, 보스 처치 시 2개' }));
  }

  private upgradeSheet(body: HTMLElement): void {
    setText(this.el.sheetTitle, '강화 · 속성별 공격력');
    for (let el = 0; el < ELEMENTS; el++) {
      const level = this.game().s.upgrades[el];
      const max = level >= UPGRADE_MAX;
      const btn = h('button', { className: 'btn go', text: max ? 'MAX' : `SP ${upgradeCost(level)}` });
      btn.addEventListener('click', () => this.actions.command({ type: 'upgrade', element: el }));
      this.refreshers.push(() => {
        btn.disabled = max || this.game().s.sp < upgradeCost(level);
      });
      body.append(
        h('div', { className: 'row' }, [
          shapeEl(kindOf(el, 1)),
          h('div', { className: 'grow' }, [
            h('div', { text: `${ELEMENT_ICONS[el]} ${ELEMENT_NAMES[el]} Lv.${level}` }),
            h('div', { className: 'dim', text: `공격력 ×${upgradeMult(level).toFixed(2)} · ${EFFECTS[el]}` }),
          ]),
          btn,
        ]),
      );
    }
  }

  private craftSheet(body: HTMLElement): void {
    setText(this.el.sheetTitle, '신화 조합법');
    const s = this.game().s;
    MYTHICS.forEach((m, i) => {
      const status = recipeStatus(s, i);
      const chips = m.recipe.map(([el, tier], j) =>
        h('span', { className: `chip${status.have[j] ? ' ok' : ''}` }, [
          shapeEl(kindOf(el, tier)),
          `${ELEMENT_NAMES[el]} ${tier}단계`,
        ]),
      );
      const btn = h('button', { className: 'btn go', text: '조합', disabled: !status.ready });
      btn.addEventListener('click', () => this.actions.command({ type: 'craft', mythic: i }));
      body.append(
        h('div', { className: 'row' }, [
          shapeEl(mythicKind(i)),
          h('div', { className: 'grow' }, [
            h('div', { text: `${m.name}${this.meta.discovered[i] ? '' : ' · 미발견'}` }),
            h('div', { className: 'dim', text: PATTERNS[m.pattern] }),
            h('div', { className: 'chips' }, chips),
          ]),
          btn,
        ]),
      );
    });
    body.append(h('div', { className: 'dim', text: '재료는 필드에서 먼저, 모자라면 서랍에서 가져와요' }));
  }

  private pauseSheet(body: HTMLElement): void {
    setText(this.el.sheetTitle, '일시정지');
    const resume = h('button', { className: 'btn go', text: '계속하기' });
    resume.addEventListener('click', () => this.closeSheet());
    const speed = h('button', { className: 'btn', text: `배속 ${this.meta.speed}×` });
    speed.addEventListener('click', () => {
      this.meta.speed = this.meta.speed === 1 ? 2 : 1;
      this.actions.setSpeed(this.meta.speed);
      setText(speed, `배속 ${this.meta.speed}×`);
    });
    const fps = h('button', { className: 'btn', text: `FPS 표시 ${this.meta.fps ? '켬' : '끔'}` });
    fps.addEventListener('click', () => {
      this.meta.fps = !this.meta.fps;
      this.actions.setFps(this.meta.fps);
      setText(fps, `FPS 표시 ${this.meta.fps ? '켬' : '끔'}`);
    });
    const restart = h('button', { className: 'btn danger', text: '새 게임' });
    restart.addEventListener('click', () => {
      if (!this.confirmNewGame) {
        this.confirmNewGame = true;
        setText(restart, '정말 새로 시작할까요? 한 번 더 누르세요');
        return;
      }
      this.actions.newGame();
    });
    body.append(resume, speed, fps, restart, this.helpCard());
  }

  private helpCard(): HTMLElement {
    const lines = [
      '소환: SP로 무작위 속성의 도형을 소환해요. 필드가 가득 차면 서랍으로 가요.',
      '합성: 같은 속성·같은 단계 도형을 끌어서 겹치면 다음 단계가 돼요. ▲→■→⬟→⬢→●',
      '이동: 빈 칸으로 끌면 이동, 다른 도형 위로 끌면 자리를 바꿔요. 서랍으로 끌면 보관해요.',
      '판매: 도형을 탭한 뒤 판매 버튼을 눌러요.',
      '상성: 불>바람>땅>물>불, 빛↔암. 다음 웨이브 속성이 위에 보여요.',
      `패배: 적이 ${LOSE_ENEMY_COUNT}마리 쌓이거나, 보스를 60초 안에 못 잡으면 끝나요.`,
    ];
    return h('div', { className: 'row' }, [h('div', { className: 'grow dim' }, lines.map((t) => h('div', { text: t })))]);
  }

  private overSheet(body: HTMLElement): void {
    const s = this.game().s;
    setText(this.el.sheetTitle, s.overReason === 'boss' ? '보스를 막지 못했어요' : '적이 너무 많아요');
    const again = h('button', { className: 'btn go', text: '다시 하기' });
    again.addEventListener('click', () => this.actions.newGame());
    body.append(
      h('div', { className: 'center' }, [
        h('div', { className: 'dim', text: '도달 웨이브' }),
        h('div', { className: 'big-num', text: String(s.wave) }),
        h('div', { className: 'dim', text: `최고 기록 ${this.meta.best} · 처치 ${s.kills}` }),
      ]),
      again,
    );
  }

  forceCloseSheet(): void {
    this.sheet = null;
    this.refreshers = [];
    this.el.sheet.hidden = true;
  }

  handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'reject':
          this.toast(e.reason, 'bad');
          break;
        case 'merge':
        case 'summon':
          this.actions.flashCell(e.cell);
          if (e.type === 'summon' && e.cell < 0) this.toast('필드가 가득 차서 서랍으로 들어갔어요');
          break;
        case 'craft':
          this.actions.flashCell(e.cell);
          this.toast(`✸ 신화 「${MYTHICS[e.mythic].name}」 탄생!`, 'gold');
          break;
        case 'gamble':
          if (e.win) {
            this.actions.flashCell(e.cell);
            this.toast(`🍀 성공! ${unitName(e.kind)}`, 'gold');
          } else {
            this.toast('🍀 꽝...');
          }
          break;
        case 'sell':
          this.toast(`판매 +${e.refund} SP`);
          break;
        case 'wave':
          if (e.boss) this.toast(`보스 등장! ${ELEMENT_ICONS[e.element]} 60초 안에 처치하세요`, 'bad');
          break;
        case 'stones':
          this.toast(`🍀 행운석 +${e.amount}`, 'good');
          break;
        case 'waveClear':
          this.toast(`웨이브 ${e.wave} 클리어 +${e.sp} SP`, 'good');
          break;
        case 'bossKilled':
          this.toast('보스 처치!', 'gold');
          break;
      }
    }
  }

  toast(text: string, tone: '' | 'good' | 'bad' | 'gold' = ''): void {
    const list = this.el.toasts;
    while (list.childElementCount >= 3) list.firstElementChild!.remove();
    const t = h('div', { className: `toast ${tone}`, text });
    list.append(t);
    setTimeout(() => t.remove(), 1800);
  }
}

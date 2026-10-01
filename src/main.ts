import 'pixi.js/unsafe-eval'; // CSP에서 eval 없이 동작하게 하는 폴리필 (렌더러 초기화 전에)
import './style.css';
import { installErrorBoundary } from './errors';
import { Input } from './input';
import { autoTurn } from './sim/auto';
import { Renderer } from './render/renderer';
import { DT } from './sim/balance';
import { Game } from './sim/game';
import { load, loadMeta, remove, save, saveMeta } from './storage';
import { registerServiceWorker } from './sw-register';
import { UI } from './ui/ui';

const MAX_STEPS_PER_FRAME = 12;
const AUTOSAVE_MS = 10_000;
/** 자동 모드 판단 주기 (게임 시간 0.5초) */
const AUTO_EVERY_STEPS = 30;
/** style.css의 #rotate 조건과 같아야 한다 */
const LANDSCAPE = window.matchMedia('(orientation: landscape) and (max-height: 500px)');

function frameBust(): boolean {
  if (window.top === window.self) return false;
  try {
    window.top!.location.href = window.self.location.href;
  } catch {
    document.body.replaceChildren();
  }
  return true;
}

function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] | 0;
}

async function start(): Promise<void> {
  if (frameBust()) return;
  installErrorBoundary();
  registerServiceWorker();

  const meta = loadMeta();
  const saved = load('run');
  let game = (saved && Game.deserialize(saved)) || Game.create(newSeed());
  const resumed = game.s.tick > 0;

  let paused = false;
  let speed: 1 | 2 = meta.speed;
  let acc = 0;
  let last = performance.now();
  const fpsEl = document.getElementById('fps')!;
  fpsEl.hidden = !meta.fps;

  const stage = document.getElementById('stage')!;
  const renderer = await Renderer.create(document.getElementById('board') as HTMLCanvasElement, stage);

  const saveRun = () => {
    if (game.s.over) remove('run');
    else save('run', game.serialize());
  };

  const ui = new UI(() => game, {
    command: (c) => game.command(c),
    setPaused: (p) => {
      paused = p;
      if (p) saveRun();
    },
    setSpeed: (s) => {
      speed = s;
      saveMeta(meta);
    },
    saveMeta: () => saveMeta(meta),
    setFps: (on) => {
      fpsEl.hidden = !on;
      saveMeta(meta);
    },
    newGame: () => {
      remove('run');
      game = Game.create(newSeed());
      acc = 0;
      ui.select(null);
      ui.forceCloseSheet();
      paused = false;
    },
    flashCell: (cell) => renderer.flashCell(cell),
  }, meta);

  const input = new Input(
    stage,
    document.getElementById('drawer')!,
    document.getElementById('drawer-list')!,
    document.getElementById('ghost')!,
    renderer,
    ui,
    () => game,
    (c) => game.command(c),
  );

  // iOS는 백그라운드로 간 PWA를 자주 종료한다: 숨겨질 때 저장하고,
  // 실제로 백그라운드에 있다 돌아오면(1초 이상) 일시정지 상태로 보여준다
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = performance.now();
      saveRun();
    } else if (hiddenAt && performance.now() - hiddenAt > 1000 && !game.s.over && !ui.sheetOpen) {
      ui.openSheet('pause');
    }
  });
  window.addEventListener('pagehide', saveRun);
  setInterval(() => {
    if (!paused) saveRun();
  }, AUTOSAVE_MS);

  if (resumed) ui.openSheet('pause');

  let frames = 0;
  let fpsTime = last;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const running = !paused && !game.s.over && !LANDSCAPE.matches;
    if (running) {
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && n < MAX_STEPS_PER_FRAME) {
        game.step();
        if (meta.auto.enabled && game.s.tick % AUTO_EVERY_STEPS === 0 && !input.busy) autoTurn(game, meta.auto);
        acc -= DT;
        n++;
      }
      if (n === MAX_STEPS_PER_FRAME) acc = 0;
    }
    input.sync();
    renderer.render(game, running ? acc / DT : 1, input.view, running ? dt : 0);

    const events = game.drainEvents();
    ui.handleEvents(events);
    for (const e of events) {
      if (e.type === 'craft' && !meta.discovered[e.mythic]) {
        meta.discovered[e.mythic] = true;
        saveMeta(meta);
      }
      if (e.type === 'gameOver') {
        meta.best = Math.max(meta.best, e.wave);
        saveMeta(meta);
        remove('run');
        ui.select(null);
        ui.openSheet('over');
      }
    }
    ui.update();

    frames++;
    if (now - fpsTime >= 500) {
      if (!fpsEl.hidden) fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsTime))} fps`;
      frames = 0;
      fpsTime = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void start();

import { clearAll } from './storage';

const CACHE_PREFIX = 'htd-';

/** 에러 바운더리: 처리되지 않은 오류가 나면 새로고침/초기화 오버레이를 띄운다. */
export function installErrorBoundary(): void {
  const show = () => {
    const el = document.getElementById('fatal');
    if (el) el.hidden = false;
  };
  window.addEventListener('error', show);
  window.addEventListener('unhandledrejection', show);
  document.getElementById('fatal-reload')?.addEventListener('click', () => location.reload());
  document.getElementById('fatal-reset')?.addEventListener('click', async () => {
    clearAll();
    try {
      for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
    } catch {
      // caches 미지원 환경
    }
    location.reload();
  });
}

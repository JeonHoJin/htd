import { h } from './ui/icons';

/** service worker 등록 + 새 버전 감지 시 업데이트 배너 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const url = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker
    .register(url, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      const offer = (worker: ServiceWorker) => showBanner(() => worker.postMessage('skipWaiting'));
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
    })
    .catch(() => {
      // 오프라인 지원만 빠질 뿐 게임은 동작한다
    });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function showBanner(onUpdate: () => void): void {
  if (document.getElementById('update-banner')) return;
  const btn = h('button', { className: 'btn go', text: '업데이트' });
  btn.addEventListener('click', onUpdate);
  const banner = h('div', { className: 'card update-banner' }, [h('span', { text: '새 버전이 있어요' }), btn]);
  banner.id = 'update-banner';
  document.body.append(banner);
}

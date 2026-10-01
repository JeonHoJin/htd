# 도형 디펜스 (htd)

도형을 소환하고 합성하는 싱글 오프라인 랜덤 디펜스. 아이폰 Safari에서 홈 화면에 추가해 앱처럼 실행한다.

- 플레이: https://jeonhojin.github.io/htd/
- 설치: Safari에서 열기 → 공유 → **홈 화면에 추가**
- 설계: [docs/superpowers/specs/2026-10-02-htd-design.md](docs/superpowers/specs/2026-10-02-htd-design.md)

## 개발

```sh
npm install
npm run dev        # 같은 와이파이의 아이폰에서 http://<맥 IP>:5173/htd/ 로 접속
npm test           # sim 단위 테스트
npm run balance    # 자동 플레이 봇으로 도달 웨이브 분포 출력
npm run build      # dist/ (CSP + service worker 포함)
```

밸런스 수치는 모두 `src/sim/balance.ts`에 있다.

## 구조

- `src/sim/` — 순수 TS 게임 로직. 결정론적(시드 RNG, 60Hz 고정 스텝), 브라우저 API를 쓰지 않는다.
- `src/render/` — PixiJS 렌더러. sim 상태를 읽기만 한다.
- `src/ui/`, `src/input.ts` — HTML HUD·서랍·시트, 탭/드래그 제스처.
- `src/sw-template.js` — 빌드 시 `dist/sw.js`로 생성되는 오프라인 캐시.

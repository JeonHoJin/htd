import { it } from 'vitest';
import { botRun } from '../src/sim/bot';

const out = (line: string) => process.stdout.write(line + '\n');

// npm run balance — 자동 플레이로 도달 웨이브 분포를 출력한다
it('balance report', () => {
  const N = Number(process.env.RUNS ?? 40);
  const results = Array.from({ length: N }, (_, i) => botRun(1000 + i));
  const waves = results.map((r) => r.wave).sort((a, b) => a - b);
  const pct = (p: number) => waves[Math.min(N - 1, Math.floor(p * N))];
  const reasons: Record<string, number> = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const minutes = results.reduce((a, r) => a + r.seconds, 0) / N / 60;
  out(`runs=${N} min=${waves[0]} p25=${pct(0.25)} median=${pct(0.5)} p75=${pct(0.75)} max=${waves[N - 1]}`);
  out(`lose reasons ${JSON.stringify(reasons)}  avg minutes ${minutes.toFixed(1)}`);
}, 600_000);

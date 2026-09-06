import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

/**
 * CLAUDE.md 규칙 1 · 계산 엔진은 순수 함수다.
 * React·Supabase·fetch·Date.now() 를 import 하지 않는다. 기준일도 인자로만 받는다.
 * 이 테스트가 깨지면 UI·서버·테스트가 같은 함수를 부른다는 전제가 무너진 것이다.
 */
describe('엔진 순수성', () => {
  // 주석은 검사에서 뺀다 — 규칙을 적어 둔 문장 자체가 걸리면 안 된다.
  const stripComments = (code: string): string =>
    code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const sources = files(SRC).map((p) => [p, stripComments(readFileSync(p, 'utf8'))] as const);

  it('src 밖의 무언가를 import 하지 않는다 (의존성 0)', () => {
    for (const [p, code] of sources) {
      const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      const foreign = imports.filter((i) => !i.startsWith('.'));
      expect(foreign, `${p} 가 외부 모듈을 부른다`).toEqual([]);
    }
  });

  it('현재 시각을 읽지 않는다 — 기준일은 인자다', () => {
    for (const [p, code] of sources) {
      expect(code, `${p} 에 Date.now()`).not.toMatch(/Date\.now\s*\(/);
      expect(code, `${p} 에 new Date() (인자 없는 호출)`).not.toMatch(/new Date\s*\(\s*\)/);
      expect(code, `${p} 에 performance.now()`).not.toMatch(/performance\.now\s*\(/);
    }
  });

  it('브라우저·네트워크·저장소에 손대지 않는다', () => {
    for (const [p, code] of sources) {
      for (const banned of ['fetch(', 'localStorage', 'document.', 'window.', 'process.env']) {
        expect(code.includes(banned), `${p} 에 ${banned}`).toBe(false);
      }
    }
  });

  it('같은 입력이면 같은 결과가 나온다', async () => {
    const { runCashflow } = await import('../src/index');
    const { baseInput } = await import('./fixture');
    expect(JSON.stringify(runCashflow(baseInput()))).toBe(JSON.stringify(runCashflow(baseInput())));
  });
});

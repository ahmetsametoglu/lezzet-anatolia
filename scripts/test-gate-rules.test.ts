import { describe, expect, it } from 'vitest';
import {
  FULL_TRIGGERS,
  fullTriggerOf,
  healthVerdict,
  normalizePath,
  parseHistory,
  parseReason,
} from './test-gate-rules.mjs';

// Commit kapısının kararları (bkz. modül künyesi). Asıl iddialar: veritabanını koddan bağımsız
// değiştiren yol tam paketi tetikler; kod yolu tetiklemez (seçimi `vitest related` yapar); tam paket
// gerekçesiz koşmaz; sağlık koşusu aynı HEAD'de tekrarlanmaz.

describe('fullTriggerOf', () => {
  it.each([
    'supabase/migrations/20260915000000_ornek.sql',
    'supabase/config.toml',
    'scripts/seed.ts',
    'scripts/seed/catalog.ts',
    'packages/database/src/testing/cleanup.ts',
    'vitest.config.ts',
    'vitest.setup.ts',
    'vitest.setup.unit.ts',
    'scripts/shared-test-run.mjs',
    'scripts/test-gate-rules.mjs',
    'pnpm-lock.yaml',
    'package.json',
  ])('%s tam paketi tetikler', (path) => {
    expect(fullTriggerOf([path])?.path).toBe(path);
  });

  it.each([
    'apps/mobile-customer/src/screens/support/tickets-screen.tsx',
    'apps/web/app/(customer)/[locale]/cart/cart.mobile.tsx',
    // Entegrasyon zincirinde — ama seçimi `related` yapar, tam paket tetiği değildir.
    'packages/domain-core/src/pricing/auto-price.ts',
    'packages/database/src/services/supply.ts',
    // Paketin dışa aktarma haritası; bağımlılık sürümü değişince kilit dosyası da değişir.
    'packages/i18n/package.json',
    'docs/build/08-musteri-app.md',
    'scripts/ui-shot.mjs',
  ])('%s tetiklemez', (path) => {
    expect(fullTriggerOf([path])).toBeNull();
  });

  it('karışık listede ilk tetikleyeni sebebiyle döner', () => {
    expect(fullTriggerOf(['docs/a.md', './supabase/migrations/1.sql', 'package.json'])).toEqual({
      path: 'supabase/migrations/1.sql',
      why: expect.any(String),
    });
  });

  it('her tetiğin sebebi yazılı', () => {
    for (const trigger of FULL_TRIGGERS) expect(trigger.why.length).toBeGreaterThan(0);
  });
});

describe('normalizePath', () => {
  it('./ önekini ve ters ayracı düşürür', () => {
    expect(normalizePath('./scripts\\seed.ts')).toBe('scripts/seed.ts');
  });
});

describe('parseReason', () => {
  it('gerekçesiz çağrıyı reddeder', () => {
    expect(parseReason(['node', 'shared-test-run.mjs'])).toBeNull();
  });

  it('sağlık ve commit gerekçesini tanır', () => {
    expect(parseReason(['--reason=health'])).toEqual({ kind: 'health', text: 'health' });
    expect(parseReason(['--reason=commit:package.json'])).toEqual({ kind: 'commit', text: 'commit:package.json' });
  });

  it('boş ya da tanımsız gerekçeyi reddeder', () => {
    expect(parseReason(['--reason='])).toBeNull();
    expect(parseReason(['--reason=commit:'])).toBeNull();
    expect(parseReason(['--reason=saglik'])).toBeNull();
  });
});

describe('parseHistory', () => {
  it('yarım satırı atlar, geçmişin geri kalanını okur', () => {
    const text = [
      '{"reason":"health","status":"passed","head":"a"}',
      '{"reason":"hea',
      '',
      '{"reason":"commit:x","status":"failed","head":"b"}',
    ].join('\n');
    expect(parseHistory(text).map((entry) => entry.reason)).toEqual(['health', 'commit:x']);
  });
});

describe('healthVerdict', () => {
  const passed = (head: string) => ({ reason: 'health', status: 'passed', head, startedAt: 't1' });

  it("HEAD son geçen sağlık koşusundan beri değişmediyse koşmaz", () => {
    expect(healthVerdict([passed('abc')], 'abc')).toEqual({ run: false, since: 't1' });
  });

  it('HEAD değiştiyse koşar', () => {
    expect(healthVerdict([passed('abc')], 'def')).toEqual({ run: true });
  });

  it("son sağlık koşusu düştüyse aynı HEAD'de yeniden koşar", () => {
    expect(healthVerdict([{ ...passed('abc'), status: 'failed' }], 'abc')).toEqual({ run: true });
  });

  it('commit koşuları sağlık kararını etkilemez', () => {
    const history = [passed('abc'), { reason: 'commit:package.json', status: 'failed', head: 'abc' }];
    expect(healthVerdict(history, 'abc')).toEqual({ run: false, since: 't1' });
  });

  it('HEAD okunamadıysa engellemez', () => {
    expect(healthVerdict([passed('abc')], null)).toEqual({ run: true });
  });
});

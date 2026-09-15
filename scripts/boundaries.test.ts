import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * `pnpm boundaries`in gerçekten ısırdığını sınar: kalıplar depcruise'un ürettiği çözülmüş yol biçimine karşı denenir, çünkü
 * depcruise'u koşturmak yalnız "bugün ihlal var mı"yı cevaplar ve temiz depoda her hâlde yeşil döner. İddialar kuraldan yazılır,
 * yapılandırmanın bugün ne dediğinden değil: kalıp modül adına geri çevrilir ya da bir paket yanlışlıkla serbest kalırsa
 * kırmızıya döner.
 */

const config = createRequire(import.meta.url)('../.dependency-cruiser.cjs') as {
  forbidden: { name: string; from: { path: string }; to: { path: string } }[];
};

/** Kural adıyla alınır — sırası değişirse test yine doğru kuralı bulur. */
function kural(name: string) {
  const found = config.forbidden.find((r) => r.name === name);
  if (!found) throw new Error(`.dependency-cruiser.cjs içinde "${name}" kuralı YOK`);
  return { from: new RegExp(found.from.path), to: new RegExp(found.to.path) };
}

/** depcruise'un bir workspace importu için ürettiği çözülmüş yol. */
const cozulmus = (paket: string) => `packages/${paket}/src/index.ts`;

describe('kapsam kuralları çözülmüş yolu görür (asıl arıza buydu)', () => {
  const senaryolar = [
    { kural: 'types-is-pure', kaynak: 'packages/types/src/entities/order.schema.ts', yasak: ['helper', 'domain-core', 'database'], serbest: ['types'] },
    { kural: 'domain-core-scope', kaynak: 'packages/domain-core/src/order/status-machine.ts', yasak: ['database', 'application', 'ai'], serbest: ['types', 'helper', 'domain-core'] },
    { kural: 'database-scope', kaynak: 'packages/database/src/services/bundle.test.ts', yasak: ['domain-core', 'application', 'ai'], serbest: ['types', 'helper', 'database'] },
    { kural: 'ai-scope', kaynak: 'packages/ai/src/client.ts', yasak: ['database', 'domain-core', 'helper'], serbest: ['types', 'ai'] },
  ] as const;

  for (const s of senaryolar) {
    describe(s.kural, () => {
      const r = kural(s.kural);

      it('kaynak paketi kuralın kapsamına girer', () => {
        expect(r.from.test(s.kaynak)).toBe(true);
      });

      for (const paket of s.yasak) {
        it(`yasak hedefi YAKALAR: → ${paket}`, () => {
          expect(r.to.test(cozulmus(paket))).toBe(true);
        });
      }

      for (const paket of s.serbest) {
        it(`izinli hedefe DOKUNMAZ: → ${paket}`, () => {
          expect(r.to.test(cozulmus(paket))).toBe(false);
        });
      }
    });
  }
});

describe('kalıp modül adına GERİLETİLİRSE kural körleşir — o yüzden ikisi birden tutulur', () => {
  /*
    Çözülmüş yol asıl hâldir (workspace kuruluyken depcruise onu üretir), modül adı emniyettir (paket kurulu değilse depcruise ham
    dizeyi bırakır); biri atılırsa o hâl kör kalır.
  */
  it('çözülemeyen import (ham modül adı) da yakalanır', () => {
    expect(kural('database-scope').to.test('@lezzet/domain-core')).toBe(true);
    expect(kural('domain-core-scope').to.test('@lezzet/database')).toBe(true);
  });

  it('ham modül adında da izinliler serbest kalır', () => {
    expect(kural('database-scope').to.test('@lezzet/types')).toBe(false);
    expect(kural('domain-core-scope').to.test('@lezzet/helper')).toBe(false);
  });
});

describe('paketler uygulamaları bilmez', () => {
  const r = kural('packages-not-to-apps');

  it('apps/ hedefini yakalar (çözülmüş yol dalı)', () => {
    expect(r.to.test('apps/web/lib/order/transition.ts')).toBe(true);
    expect(r.to.test('apps/backend/src/jobs/sweep-reservations.ts')).toBe(true);
  });

  it('paket hedefine dokunmaz', () => {
    expect(r.to.test(cozulmus('types'))).toBe(false);
  });
});

describe('kural kümesi eksilmez', () => {
  /*
    Kuralı SİLMEK de körleştirmenin bir yoludur ve kalıp testleri onu göremez — silinen kuralın
    kalıbı da yok olur. Ad listesi bu yüzden ayrıca sabitlenir.
  */
  it('beklenen kurallar yerinde', () => {
    expect(config.forbidden.map((r) => r.name).sort()).toEqual(
      ['ai-scope', 'database-scope', 'domain-core-scope', 'no-circular', 'no-orphans', 'packages-not-to-apps', 'types-is-pure'].sort(),
    );
  });
});

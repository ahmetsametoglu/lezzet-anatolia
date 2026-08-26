import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * SINIR BEKÇİSİNİN BEKÇİSİ (02.19) — `pnpm boundaries` gerçekten ısırıyor mu?
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * `.dependency-cruiser.cjs`teki dört kapsam kuralı (`types-is-pure`, `domain-core-scope`,
 * `database-scope`, `ai-scope`) **doğduklarından 26.08'e kadar hiç ateşlenemedi.** Hepsi hedefi
 * modül ADIYLA arıyordu (`^@lezzet/…`), oysa depcruise workspace importunu **çözülmüş yola**
 * çevirir: `@lezzet/domain-core` → `packages/domain-core/src/index.ts`. Kalıp hiçbir kenara uymuyor,
 * kural hiçbir şey yakalamıyordu.
 *
 * Arızanın sinsi yanı belirtisizliğiydi: `pnpm boundaries` her koşuda **yeşil** dönüyordu. Yeşillik
 * "ihlal yok" demek değildi, "bakamıyorum" demekti — ve altında gerçek bir ihlal duruyordu
 * (`packages/database/…/bundle.test.ts → @lezzet/domain-core`). Kör bir bekçi, bekçisizlikten
 * beterdir: bekçisizlik bilinir, körlük bilinmez.
 *
 * ── NEDEN BÖYLE SINANIYOR ────────────────────────────────────────────────────
 * Bu test depcruise'u KOŞTURMAZ. Koşturmak "bugün depoda ihlal var mı" sorusunu yanıtlar; buradaki
 * soru başka ve kalıcı: **"kural, bir ihlal olsaydı onu görebilir miydi?"** Depo bugün temiz olduğu
 * için koşu her hâlde yeşil döner — yani koşturmak, tam da gizlemek istediğimiz körlüğü gizlerdi.
 *
 * O yüzden kalıplar, depcruise'un ürettiği GERÇEK yol biçimine karşı sınanır. Biri kalıbı modül
 * adına geri çevirirse ya da yeni bir paketi yanlışlıkla serbest bırakırsa, burası kırmızıya döner.
 *
 * İddialar KURALDAN yazılmıştır, koddan değil: her satır "şu bağımlılık yasak olmalı" der;
 * yapılandırmanın bugün ne dediğini tekrarlamaz.
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
    Kalıplar hem çözülmüş yolu hem modül adını kabul ediyor. Çözülmüş yol asıl haldir (workspace
    kurulu olduğunda depcruise onu üretir); modül adı emniyettir — paket kurulu değilse depcruise
    ham dizeyi bırakır ve kural yine de görmelidir. Biri atılırsa o hâl kör kalır.
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

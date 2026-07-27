import { AccountService, MoneyMovementService, SettingsService } from '@lezzet/database';
import { euro, gun, tabloDolu, type Db } from './shared';

// ── Hesaplar + para hareketleri (12) ─────────────────────────────────────────────────────────────
// Kasa, bankalar ve Stripe: hepsi birer hesap; "online havuz" ayrı kavram değil. Bakiye SAKLANMAZ,
// hareketlerden türetilir — o yüzden açılış bakiyesi de bir harekettir (`capital`).
//
// Sipariş tahsilatları BURADA YOK: onların hareketi 12.2'de siparişe bağlı olarak doğar. Bugün
// yazılsalardı `Order.amount_*` cache'iyle iki ayrı gerçek oluşurdu.

const HESAPLAR = [
  { key: 'kasa', name: 'Kasa', type: 'cash' as const, acilis: 850 },
  { key: 'revolut', name: 'Revolut', type: 'bank' as const, acilis: 4200 },
  { key: 'cm', name: 'Crédit Mutuel', type: 'bank' as const, acilis: 12500 },
  // Stripe'ın açılışı var, çünkü payout'u var: sağlayıcı hesabı tahsilatı toplar, sonra bankaya
  // aktarır. Sipariş tahsilatları 12.2'de siparişe bağlı doğacak; o zamana kadar açılış onların
  // yerini tutar — yoksa payout hiç girmemiş parayı çıkarır ve bakiye eksiye düşerdi.
  { key: 'stripe', name: 'Stripe', type: 'provider' as const, acilis: 1980 },
  // Kapanmış hesap: SİLİNMEZ, pasifleşir — geçmiş hareketleri ona bağlıdır.
  { key: 'eskiBanka', name: 'N26 (kapandı)', type: 'bank' as const, acilis: 0, isActive: false },
];

/** Gider serisi — kategoriler işletmenin gerçek kalemleri; reklam gideri kampanya etiketli. */
const GIDERLER: Array<{ hesap: string; amount: number; category: string; description: string; gunOnce: number; meta?: Record<string, unknown> }> = [
  { hesap: 'cm', amount: 1450, category: 'kira', description: 'Depo kirası', gunOnce: 26 },
  { hesap: 'cm', amount: 1450, category: 'kira', description: 'Depo kirası', gunOnce: 56 },
  { hesap: 'cm', amount: 2900, category: 'maaş', description: 'Personel maaşları', gunOnce: 27 },
  { hesap: 'kasa', amount: 96.4, category: 'akaryakıt', description: 'Rota yakıtı', gunOnce: 4 },
  { hesap: 'kasa', amount: 88.2, category: 'akaryakıt', description: 'Rota yakıtı', gunOnce: 11 },
  { hesap: 'revolut', amount: 340, category: 'ambalaj', description: 'Soğuk zincir kutu + jel', gunOnce: 18 },
  { hesap: 'revolut', amount: 129.9, category: 'yazılım', description: 'SaaS abonelikleri', gunOnce: 9 },
  // Reklam gideri KAMPANYA ETİKETLİ: analitik kampanyanın giderini ve cirosunu yan yana koyar (13).
  { hesap: 'revolut', amount: 250, category: 'advertising', description: 'Meta — bayram kampanyası', gunOnce: 14, meta: { campaign: 'bayram-2026' } },
  { hesap: 'revolut', amount: 180, category: 'advertising', description: 'Google — marka araması', gunOnce: 6, meta: { campaign: 'marka-arama' } },
];

export async function seedMoney(db: Db): Promise<void> {
  if (await tabloDolu(db, 'account')) {
    console.log('▸ hesaplar zaten dolu — atlandı');
    return;
  }
  console.log('▸ HESAP + PARA HAREKETİ seed');
  const accounts = new AccountService(db);
  const movements = new MoneyMovementService(db);
  const hesapId = new Map<string, string>();

  for (const h of HESAPLAR) {
    const created = await accounts.insert({ name: h.name, type: h.type, isActive: h.isActive ?? true });
    hesapId.set(h.key, created.id);
    // Açılış bakiyesi bir HAREKETTİR: bakiye kolonu yok, sayı hareketlerden çıkar.
    if (h.acilis > 0) {
      await movements.insert({
        accountId: created.id,
        direction: 'in',
        amount: h.acilis,
        type: 'capital',
        description: 'Açılış bakiyesi',
        valueDate: gun(-90),
        reconciled: true,
      });
    }
    console.log(`  ✓ ${h.name} · ${h.type}${h.isActive === false ? ' · PASİF' : ''}`);
  }

  for (const g of GIDERLER) {
    await movements.insert({
      accountId: hesapId.get(g.hesap)!,
      direction: 'out',
      amount: g.amount,
      type: 'expense',
      category: g.category,
      description: g.description,
      meta: g.meta,
      valueDate: gun(-g.gunOnce),
      // Eski satırlar banka ekstresiyle eşleşmiş, yenileri kuyrukta — eşleştirme ekranı boş kalmasın.
      reconciled: g.gunOnce > 10,
    });
  }

  // Tedarikçiye ödeme: borç türetiminin (Σ giriş − Σ ödeme) diğer ucu. Alım bir mal kabule bağlı.
  const { data: girisler } = await db.from('stock_intake').select('id,supplier_id,total_amount').limit(2);
  for (const giris of (girisler ?? []) as Array<{ id: string; supplier_id: string | null; total_amount: string }>) {
    if (!giris.supplier_id) continue;
    await movements.insert({
      accountId: hesapId.get('cm')!,
      direction: 'out',
      // Kısmi ödeme: borç sıfırlanmasın, tedarikçi kartında açık bakiye görünsün.
      amount: euro(Number(giris.total_amount) * 0.6),
      type: 'purchase',
      stockIntakeId: giris.id,
      supplierId: giris.supplier_id,
      description: 'Mal bedeli — kısmi ödeme',
      valueDate: gun(-5),
    });
  }

  // Transferler: TEK satır, iki hesabı simetrik etkiler (karşı uçta işaret ters).
  await movements.insert({
    accountId: hesapId.get('kasa')!,
    counterAccountId: hesapId.get('cm')!,
    direction: 'out',
    amount: 600,
    type: 'transfer',
    description: 'Kasa fazlası bankaya yatırıldı',
    valueDate: gun(-7),
  });
  await movements.insert({
    accountId: hesapId.get('stripe')!,
    counterAccountId: hesapId.get('revolut')!,
    direction: 'out',
    amount: 1240.5,
    type: 'transfer',
    description: 'Stripe payout',
    valueDate: gun(-2),
  });

  // Kapı önü satışın nakdi hangi çekmeceye girer — kasiyer ekranı bunu ezebilir, ayar varsayılandır.
  await new SettingsService(db).set('door_cash_account_id', hesapId.get('kasa')!, {
    description: 'Kapı önü satış tahsilatının düştüğü hesap (12.2).',
  });

  const bakiyeler = await accounts.balances();
  const ozet = HESAPLAR.map((h) => `${h.name}: ${bakiyeler.get(hesapId.get(h.key)!)?.balance ?? 0} €`).join(' · ');
  console.log(`  ✓ bakiye (türetilmiş) → ${ozet}`);
  console.log(`✓ para: ${HESAPLAR.length} hesap · ${GIDERLER.length} gider · 2 transfer · tedarikçi ödemesi`);
}


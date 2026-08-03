import { AccountService, BankImportProfileService, BankImportService, MoneyMovementService, SettingsService } from '@lezzet/database';
import { fingerprintRows, heuristicColumnMapper, parseBankRows } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
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
        amountCents: toCents(h.acilis),
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
      amountCents: toCents(g.amount),
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
      amountCents: toCents(Number(giris.total_amount) * 0.6),
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
    amountCents: 60_000,
    type: 'transfer',
    description: 'Kasa fazlası bankaya yatırıldı',
    valueDate: gun(-7),
  });
  await movements.insert({
    accountId: hesapId.get('stripe')!,
    counterAccountId: hesapId.get('revolut')!,
    direction: 'out',
    amountCents: 124_050,
    type: 'transfer',
    description: 'Stripe payout',
    valueDate: gun(-2),
  });

  // Kapı önü satışın nakdi hangi çekmeceye girer — kasiyer ekranı bunu ezebilir, ayar varsayılandır.
  await new SettingsService(db).set('door_cash_account_id', hesapId.get('kasa')!, {
    description: 'Kapı önü satış tahsilatının düştüğü hesap (12.2).',
  });

  await seedBankImport(db, hesapId.get('cm')!);

  const bakiyeler = await accounts.balances();
  const ozet = HESAPLAR.map((h) => `${h.name}: ${euro((bakiyeler.get(hesapId.get(h.key)!)?.balanceCents ?? 0) / 100)} €`).join(' · ');
  console.log(`  ✓ bakiye (türetilmiş) → ${ozet}`);
  console.log(`✓ para: ${HESAPLAR.length} hesap · ${GIDERLER.length} gider · 2 transfer · tedarikçi ödemesi · banka import`);
}

/**
 * Banka ekstresi import'u (12.4) — şablon + bir yükleme. Amaç eşleştirme kuyruğunun DOLU olması:
 * satırlar `misc`/`reconciled=false` girer, ekran onları önerileriyle gösterir.
 *
 * Satırlar gerçek ekstre gibi ham hâlde verilir ve **gerçek okuyucudan geçirilir** — seed kendi
 * kestirmesini yazsaydı sütun tanıma ve mükerrer koruması yerelde hiç denenmemiş olurdu.
 */
async function seedBankImport(db: Db, accountId: string): Promise<void> {
  const frDate = (daysAgo: number) => gun(-daysAgo).split('-').reverse().join('/');
  const statement = [
    { Date: frDate(9), 'Libellé': 'VIR SEPA DUPONT MARIE', Montant: '64,80', Solde: '12 470,30' },
    { Date: frDate(7), 'Libellé': 'PRLV ORANGE FACTURE', Montant: '-39,99', Solde: '12 430,31' },
    { Date: frDate(5), 'Libellé': 'VIR SEPA ANADOLU MARKT', Montant: '312,00', Solde: '12 742,31' },
    { Date: frDate(3), 'Libellé': 'RETRAIT DAB REPUBLIQUE', Montant: '-50,00', Solde: '12 692,31' },
    { Date: frDate(3), 'Libellé': 'RETRAIT DAB REPUBLIQUE', Montant: '-50,00', Solde: '12 642,31' },
    { Date: frDate(1), 'Libellé': 'FRAIS TENUE DE COMPTE', Montant: '-4,50', Solde: '12 637,81' },
  ];

  const suggestion = heuristicColumnMapper(
    [...new Set(statement.flatMap((row) => Object.keys(row)))].map((header) => ({
      header,
      values: statement.map((row) => (row as Record<string, string>)[header] ?? ''),
    })),
  );

  const profile = await new BankImportProfileService(db).insert({
    accountId,
    name: 'Crédit Mutuel — CSV',
    amountMode: suggestion.amountMode,
    mapping: suggestion.mapping,
    decimalSeparator: suggestion.decimalSeparator,
    dateFormat: suggestion.dateFormat,
  });

  const { rows } = parseBankRows(statement, profile);
  const batch = await new BankImportService(db).insert({
    accountId,
    profileId: profile.id,
    fileName: 'releve_cm_2026.csv',
    rowCount: statement.length,
  });

  const inserted = await new MoneyMovementService(db).insertImported(
    fingerprintRows(accountId, rows).map((row) => ({
      accountId,
      direction: row.direction,
      // Ekstre satırı euro okur (banka dosyası öyle gelir); hareket cent yazar (02.9 · STACK §8).
      amountCents: toCents(row.amount),
      // Tip sınıflandırma bekliyor: banka "para girdi" der, sebebini söylemez.
      type: 'misc' as const,
      description: row.label,
      valueDate: row.valueDate,
      source: 'bank_import' as const,
      importFingerprint: row.fingerprint,
      bankImportId: batch.id,
    })),
  );
  await new BankImportService(db).update({ id: batch.id, insertedCount: inserted.length, duplicateCount: 0 });

  console.log(`  ✓ banka import · ${inserted.length} satır eşleşme kuyruğunda (şablon: ${profile.name})`);
}

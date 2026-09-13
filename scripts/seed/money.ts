import {
  AccountService,
  BankImportProfileService,
  BankImportService,
  CounterpartyService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  MovementTagService,
  SettingsService,
} from '@lezzet/database';
import { fingerprintRows, heuristicColumnMapper, parseBankRows } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { euro, gun, tabloDolu, type Db } from './shared';

// ── Hesaplar + para hareketleri (12) ─────────────────────────────────────────────────────────────
// Kasa, bankalar ve Stripe: hepsi birer hesap; "online havuz" ayrı kavram değil. Bakiye SAKLANMAZ,
// hareketlerden türetilir — o yüzden açılış bakiyesi de bir harekettir (`capital`).
//
// Sipariş tahsilatları BURADA YOK: onların hareketi 12.2'de siparişe bağlı olarak doğar. Bugün
// yazılsalardı `Order.amount_*` cache'iyle iki ayrı gerçek oluşurdu.
//
// SINIFLANDIRMA (13.09 · ikinci karar): her giderin TEK TÜRÜ var (migration'ın tür sözlüğünden),
// kime ödendiği CARİDE, serbest işaret ETİKETTE. Ortak etiketi yok: ortağın kaydı cari hesabıdır.

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
  // ORTAK CARİ HESAPLARI (13.09): ortağın TEK kaydı. Açılışı YOK — cari bir kasa değil, kişiyle
  // hesaptır; bakiyesi yalnız ortak adına/ortağın cebinden yapılan hareketlerden doğar. Adlar uydurma.
  { key: 'ortakA', name: 'Ortak A cari', type: 'partner' as const, acilis: 0 },
  { key: 'ortakB', name: 'Ortak B cari', type: 'partner' as const, acilis: 0 },
];

/**
 * CARİLER (13.09 · ikinci karar) — eşleşme kelimeleri ekstrenin satırlarına göre: kelime geçerse cari
 * ve varsayılan türü önerilir. Kelimeler dar tutuldu (test fikstürlerinin açıklamalarıyla çakışmasın:
 * cariler şirket geneli okunur). Adlar uydurma.
 */
const CARILER = [
  { key: 'urssaf', name: 'URSSAF', kind: 'institution' as const, keywords: ['URSSAF'], defaultNature: 'sosyal-guvenlik' },
  { key: 'sie', name: 'Vergi dairesi (SIE)', kind: 'institution' as const, keywords: ['DGFIP'], defaultNature: 'vergi' },
  { key: 'muller', name: 'Cabinet Comptable Muller', kind: 'service' as const, keywords: ['CABINET COMPTABLE MULLER'], defaultNature: 'muhasebe-ucreti' },
  { key: 'orange', name: 'Orange', kind: 'service' as const, keywords: ['ORANGE'], defaultNature: 'telefon-internet' },
  { key: 'sci', name: 'SCI Rhin Immobilier', kind: 'service' as const, keywords: ['SCI RHIN'], defaultNature: 'kira' },
  { key: 'bankaMasrafi', name: 'Crédit Mutuel — banka masrafı', kind: 'service' as const, keywords: ['FRAIS TENUE'], defaultNature: 'banka-masrafi' },
];

/** Serbest etiket (13.09) — işletmenin kendi gruplaması; izah değildir, sözlüğe seed'de girer. */
const ETIKETLER = [{ slug: 'ortak-a-araci', label: 'Ortak A aracı' }];

/**
 * Gider serisi — her satırın TÜRÜ var (migration'ın tür sözlüğünden); kime ödendiği biliniyorsa CARİSİ.
 * Reklam gideri `reklam` türü + kampanya künyesi. "Ortak A aracı" ETİKETLİ satır, şirket giderinin
 * bir ortağı ilgilendirdiğini gösterir — borç doğurmaz, ayrım yapar.
 */
const GIDERLER: Array<{
  hesap: string;
  amount: number;
  nature: string;
  cari?: string;
  tags?: string[];
  description: string;
  gunOnce: number;
  meta?: Record<string, unknown>;
}> = [
  { hesap: 'cm', amount: 1450, nature: 'kira', cari: 'sci', description: 'Depo kirası', gunOnce: 26 },
  { hesap: 'cm', amount: 1450, nature: 'kira', cari: 'sci', description: 'Depo kirası', gunOnce: 56 },
  { hesap: 'cm', amount: 2900, nature: 'maas', description: 'Personel maaşları', gunOnce: 27 },
  { hesap: 'cm', amount: 1180, nature: 'sosyal-guvenlik', cari: 'urssaf', description: 'URSSAF — sosyal kesinti', gunOnce: 22 },
  { hesap: 'kasa', amount: 96.4, nature: 'akaryakit', description: 'Rota yakıtı', gunOnce: 4 },
  { hesap: 'kasa', amount: 88.2, nature: 'akaryakit', tags: ['ortak-a-araci'], description: 'Rota yakıtı — Ortak A aracı', gunOnce: 11 },
  { hesap: 'revolut', amount: 340, nature: 'ambalaj', description: 'Soğuk zincir kutu + jel', gunOnce: 18 },
  { hesap: 'revolut', amount: 129.9, nature: 'yazilim', description: 'SaaS abonelikleri', gunOnce: 9 },
  // Reklam gideri KAMPANYA KÜNYELİ: analitik kampanyanın giderini ve cirosunu yan yana koyar (13).
  { hesap: 'revolut', amount: 250, nature: 'reklam', description: 'Meta — bayram kampanyası', gunOnce: 14, meta: { campaign: 'bayram-2026' } },
  { hesap: 'revolut', amount: 180, nature: 'reklam', description: 'Google — marka araması', gunOnce: 6, meta: { campaign: 'marka-arama' } },
];

// **`base` katmanında HİÇ KOŞMAZ** (kullanıcı kararı 16.08): hesap adları da açılış bakiyeleri de uydurma
// sayılar. Gerçek kasa/banka/Stripe hesabını operatör kurar. Künye `seed/tier.ts`.
export async function seedMoney(db: Db): Promise<void> {
  if (await tabloDolu(db, 'account')) {
    console.log('▸ hesaplar zaten dolu — atlandı');
    return;
  }
  console.log('▸ HESAP + PARA HAREKETİ seed');
  const accounts = new AccountService(db);
  const movements = new MoneyMovementService(db);
  const hesapId = new Map<string, string>();
  const cariId = new Map<string, string>();

  // Cariler ve etiketler ÖNCE: hareket tanınmayan etikete yazılamaz (`check_tags_known`), cari bağı FK.
  const counterparties = new CounterpartyService(db);
  for (const cari of CARILER) {
    const created = await counterparties.insert({ name: cari.name, kind: cari.kind, keywords: cari.keywords, defaultNature: cari.defaultNature });
    cariId.set(cari.key, created.id);
  }
  const tagService = new MovementTagService(db);
  for (const etiket of ETIKETLER) await tagService.insert(etiket);

  for (const h of HESAPLAR) {
    const created = await accounts.insert({ name: h.name, type: h.type, isActive: h.isActive ?? true });
    hesapId.set(h.key, created.id);
    // Açılış bakiyesi bir HAREKETTİR: bakiye kolonu yok, sayı hareketlerden çıkar. Türü `sermaye`.
    if (h.acilis > 0) {
      await movements.insert({
        accountId: created.id,
        direction: 'in',
        amountCents: toCents(h.acilis),
        type: 'capital',
        nature: 'sermaye',
        description: 'Açılış bakiyesi',
        valueDate: gun(-90),
      });
    }
    console.log(`  ✓ ${h.name} · ${h.type}${h.isActive === false ? ' · PASİF' : ''}`);
  }

  // `reconciled` YAZILMIYOR (13.09): bayrak yalnız banka satırında anlamlı; elle girilen giderin izahı
  // türünden gelir (`explained` tetikleyiciyle kurulur).
  for (const g of GIDERLER) {
    await movements.insert({
      accountId: hesapId.get(g.hesap)!,
      direction: 'out',
      amountCents: toCents(g.amount),
      type: 'expense',
      nature: g.nature,
      counterpartyId: g.cari ? cariId.get(g.cari)! : null,
      tags: g.tags,
      description: g.description,
      meta: g.meta,
      valueDate: gun(-g.gunOnce),
    });
  }

  /*
    ORTAK CARİSİ İŞ BAŞINDA (13.09) — iki yön, iki hareket:
    · Ortak A şirket giderini CEBİNDEN ödedi → gider, hesabı ortağın carisi → cari EKSİYE düşer
      (şirket ortağa borçlu).
    · Şirket, Ortak B'nin kişisel bir ödemesini bankadan yaptı → banka → cari TRANSFERİ → Ortak B
      carisi ARTIYA çıkar (ortak şirkete borçlu). Fiziken para üçüncü kişiye gitti; muhasebede
      ortağın hesabına yazılan bir çekiştir. Ortak etiketi YOK: hesap kimin olduğunu zaten söylüyor.
  */
  await movements.insert({
    accountId: hesapId.get('ortakA')!,
    direction: 'out',
    amountCents: toCents(215.5),
    type: 'expense',
    nature: 'ambalaj',
    description: 'Koli bandı ve etiket — Ortak A kendi kartıyla ödedi',
    valueDate: gun(-8),
  });
  await movements.insert({
    accountId: hesapId.get('revolut')!,
    counterAccountId: hesapId.get('ortakB')!,
    direction: 'out',
    amountCents: toCents(400),
    type: 'transfer',
    description: 'Ortak B adına ödeme — cariye yazıldı',
    valueDate: gun(-3),
  });

  /*
    BELGELER (13.09) — biri kapanmış, ikisi açık; hepsinin karşı tarafı bir CARİ, türü sözlükten:
    · Kira faturası: belge + ödemesine BAĞ (tutarıyla) → açık kalanı 0. Kira ödemesi yukarıda yazıldı;
      bağlamak için ayrı bir ödeme yazılmıyor — ilk kira satırı bulunup bağlanıyor (para iki kez sayılmasın).
    · Muhasebeci ve Orange faturaları: ödeme yok → "Açık belgeler"de dururlar; ekstrenin satırları
      onları referansla ve carinin eşleşme kelimesiyle bulur.
  */
  const documents = new MoneyDocumentService(db);
  const kiraFaturasi = await documents.insert({
    kind: 'invoice',
    number: 'LOYER-2026-09',
    issuedOn: gun(-28),
    counterpartyId: cariId.get('sci')!,
    direction: 'out',
    nature: 'kira',
    amountCents: toCents(1450),
    vatAmountCents: 0,
    note: 'Depo kirası — eylül',
  });
  // Defterden okunur (`ledger`): servis ham `getAll`ı dışarı vermiyor ve vermemeli — seed de bir çağırandır.
  const kiraSayfasi = await movements.ledger({ accountId: hesapId.get('cm')!, type: 'expense', from: gun(-26), to: gun(-26), limit: 1 });
  const kiraOdemesi = kiraSayfasi.rows[0];
  if (kiraOdemesi) await new MoneyAllocationService(db).insert({ movementId: kiraOdemesi.id, documentId: kiraFaturasi.id, amountCents: kiraOdemesi.amountCents });
  await documents.insert({
    kind: 'invoice',
    number: 'FA-2026-0912',
    issuedOn: gun(-4),
    counterpartyId: cariId.get('muller')!,
    direction: 'out',
    nature: 'muhasebe-ucreti',
    amountCents: toCents(360),
    vatAmountCents: toCents(60),
    note: 'Aylık muhasebe ücreti — ödenmedi',
  });
  await documents.insert({
    kind: 'invoice',
    number: 'ORANGE-0826',
    issuedOn: gun(-9),
    counterpartyId: cariId.get('orange')!,
    direction: 'out',
    nature: 'telefon-internet',
    amountCents: toCents(39.99),
    vatAmountCents: toCents(6.67),
    note: 'Telefon ve internet — ağustos',
  });

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
  // Payout'un aktarıldığı banka (12.14): webhook Stripe → bu hesap transferini kendiliğinden yazar.
  await new SettingsService(db).set('stripe_payout_account_id', hesapId.get('revolut')!, {
    description: 'Stripe payout\'unun aktarıldığı banka hesabı (12.14).',
  });
  await new SettingsService(db).set('door_cash_account_id', hesapId.get('kasa')!, {
    description: 'Kapı önü satış tahsilatının düştüğü hesap (12.2).',
  });

  // **Banka ekstresi BURADA DEĞİL, siparişlerden SONRA** (`seedBankQueue`) — sıra bir bağımlılık:
  // ekstrenin eşleştirme kuyruğunu doğuran satırlar açık siparişlerin tutarlarından türüyor ve
  // `seedMoney` sipariş seed'inden önce koşuyor (hesaplar önce var olmalı, sipariş tahsilatı onlara
  // yazılıyor). Burada çağrılsaydı sipariş tablosu boş olur, türetilen satır hiç doğmaz ve kuyruk
  // sessizce tek hâlinde kalırdı — kod çalışır, hiçbir şey üretmezdi.

  const bakiyeler = await accounts.balances();
  const ozet = HESAPLAR.map((h) => `${h.name}: ${euro((bakiyeler.get(hesapId.get(h.key)!)?.balanceCents ?? 0) / 100)} €`).join(' · ');
  console.log(`  ✓ bakiye (türetilmiş) → ${ozet}`);
  console.log(
    `✓ para: ${HESAPLAR.length} hesap · ${GIDERLER.length + 1} gider · 3 transfer · tedarikçi ödemesi · 3 belge · ${CARILER.length} cari · ${ETIKETLER.length} etiket`,
  );
}

/**
 * Banka ekstresi + eşleştirme kuyruğu.
 *
 * Kendi hesabını arayıp buluyor: çağıranın hesap haritasını taşıması, iki seed adımı arasında bir
 * bağ daha kurardı.
 *
 * ── SİPARİŞTEN TÜREYEN SATIRLAR KALKTI (kullanıcı kararı 01.09) ──────────────
 * Ekstrenin üç satırı açık siparişlerin bakiyesinden üretiliyordu ve eşleştirme kuyruğunun "güçlü
 * aday" / "çoklu aday" hâllerini doğuruyordu. Besleme artık hiç sipariş yazmıyor (künye
 * `seed.ts` başlığında), dolayısıyla o satırların dayanağı da yok — uydurma bir tutarla yazılsalar
 * motor onları zaten hiçbir siparişe bağlayamaz ve "aday" hâli YALANCI olurdu.
 *
 * ── SİPARİŞ DIŞI ADAYLAR VAR (12.13 · 13.09) ────────────────────────────────
 * Ekstrenin satırları `seedMoney`nin yazdıklarıyla buluşuyor (satır listesinin künyesi). Bunlar
 * uydurma tutar değil, aynı seed'in öteki ucunda gerçekten duran kayıtlar — "güçlü aday" hâli yalancı
 * değil.
 */
export async function seedBankQueue(db: Db): Promise<void> {
  // Koruma EKSİKTİ (08.08): buradaki her satır her koşuda yeniden yazılıyordu ve ikinci koşu
  // `bank_import_profile_name_key` tekilliğine çarpıp seed'i KESİYORDU — kendisinden sonraki
  // bölümler (talep, geri bildirim, iş izleri) hiç çalışmıyordu. Öteki bölümlerin hepsinde bu
  // koruma var; burada unutulmuştu ve hata dosyanın kendi içinde değil, SONRAKİ bölümlerin
  // yokluğunda görünüyordu.
  if (await tabloDolu(db, 'bank_import_profile')) {
    console.log('▸ banka ekstresi zaten dolu — atlandı');
    return;
  }
  const { data } = await db.from('account').select('id').eq('name', 'Crédit Mutuel').maybeSingle();
  if (!data) return;
  await seedBankImport(db, (data as { id: string }).id);
}

async function seedBankImport(db: Db, accountId: string): Promise<void> {
  const frDate = (daysAgo: number) => gun(-daysAgo).split('-').reverse().join('/');
  /*
    Satırların beşi `seedMoney`nin yazdıklarıyla BULUŞUR:
    · URSSAF (−22. gün): aynı gün elle yazılmış, carisi URSSAF olan kesinti → "zaten yazılmış hareket"
      (carinin kelimesi elle yazılanı da tanıtır; cari kendisi de yedek öneridir);
    · VERSEMENT (−7. gün): kasa→Crédit Mutuel transferinin banka tarafı → "transferin öteki yakası";
    · ORANGE (−7. gün): Orange'ın açık faturası, eşleşme kelimesi ORANGE → "açık belge";
    · MULLER (−2. gün): açık muhasebeci faturası FA-2026-0912, referans açıklamada → "açık belge";
    · FRAIS TENUE (−1. gün): belgesi yok, carinin kelimesi → "cari" (banka masrafı türüyle).
    Geri kalanı önerisiz durur (nakit çekimi, tanınmayan havale) — gerçek bir ekstre de öyledir.
  */
  const statement = [
    { Date: frDate(22), 'Libellé': 'PRLV SEPA URSSAF COTISATIONS', Montant: '-1180,00', Solde: '11 290,30' },
    { Date: frDate(9), 'Libellé': 'VIR SEPA DUPONT MARIE', Montant: '64,80', Solde: '11 355,10' },
    { Date: frDate(7), 'Libellé': 'VERSEMENT ESPECES GUICHET', Montant: '600,00', Solde: '11 955,10' },
    { Date: frDate(7), 'Libellé': 'PRLV ORANGE FACTURE', Montant: '-39,99', Solde: '11 915,11' },
    { Date: frDate(5), 'Libellé': 'VIR SEPA ANADOLU MARKT', Montant: '312,00', Solde: '12 227,11' },
    { Date: frDate(3), 'Libellé': 'RETRAIT DAB REPUBLIQUE', Montant: '-50,00', Solde: '12 177,11' },
    { Date: frDate(3), 'Libellé': 'RETRAIT DAB REPUBLIQUE', Montant: '-50,00', Solde: '12 127,11' },
    { Date: frDate(2), 'Libellé': 'PRLV CABINET COMPTABLE MULLER FA-2026-0912', Montant: '-360,00', Solde: '11 767,11' },
    { Date: frDate(1), 'Libellé': 'FRAIS TENUE DE COMPTE', Montant: '-4,50', Solde: '11 762,61' },
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

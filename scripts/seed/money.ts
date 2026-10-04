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

// Kasa, bankalar ve Stripe birer hesaptır; bakiye saklanmaz, hareketlerden türer ve açılış bakiyesi de bir harekettir (`capital`).
// Sipariş tahsilatları burada yazılmaz, çünkü siparişe bağlı doğarlar ve ayrı yazılsalar `Order.amount_*` önbelleğiyle iki gerçek
// oluşurdu.

const HESAPLAR = [
  { key: 'kasa', name: 'Kasa', type: 'cash' as const, acilis: 850 },
  { key: 'revolut', name: 'Revolut', type: 'bank' as const, acilis: 4200 },
  { key: 'cm', name: 'Crédit Mutuel', type: 'bank' as const, acilis: 12500 },
  // Stripe'ın açılışı var, çünkü payout'u var: tahsilatlar burada yazılmadığı için açılış onların yerini tutar, yoksa payout hiç
  // girmemiş parayı çıkarır ve bakiye eksiye düşerdi.
  { key: 'stripe', name: 'Stripe', type: 'provider' as const, acilis: 1980 },
  // Kapanmış hesap: SİLİNMEZ, pasifleşir — geçmiş hareketleri ona bağlıdır.
  { key: 'eskiBanka', name: 'N26 (kapandı)', type: 'bank' as const, acilis: 0, isActive: false },
  // Ortak cari hesabı ortağın tek kaydıdır ve açılışı yoktur: cari bir kasa değil kişiyle hesaptır, bakiyesi yalnız ortak adına ya da
  // ortağın cebinden yapılan hareketlerden doğar.
  { key: 'ortakA', name: 'Ortak A cari', type: 'partner' as const, acilis: 0 },
  { key: 'ortakB', name: 'Ortak B cari', type: 'partner' as const, acilis: 0 },
];

/**
 * Cariler: ekstre satırında eşleşme kelimesi geçerse cari ve varsayılan türü önerilir. Kelimeler dar tutuldu, çünkü cariler şirket
 * geneli okunur ve test fikstürlerinin açıklamalarıyla çakışmamalı.
 */
const CARILER = [
  { key: 'urssaf', name: 'URSSAF', kind: 'institution' as const, keywords: ['URSSAF'], defaultNature: 'sosyal-guvenlik' },
  { key: 'sie', name: 'Vergi dairesi (SIE)', kind: 'institution' as const, keywords: ['DGFIP'], defaultNature: 'vergi' },
  { key: 'muller', name: 'Cabinet Comptable Muller', kind: 'service' as const, keywords: ['CABINET COMPTABLE MULLER'], defaultNature: 'muhasebe-ucreti' },
  { key: 'orange', name: 'Orange', kind: 'service' as const, keywords: ['ORANGE'], defaultNature: 'telefon-internet' },
  { key: 'sci', name: 'SCI Rhin Immobilier', kind: 'service' as const, keywords: ['SCI RHIN'], defaultNature: 'kira' },
  { key: 'bankaMasrafi', name: 'Crédit Mutuel — banka masrafı', kind: 'service' as const, keywords: ['FRAIS TENUE'], defaultNature: 'banka-masrafi' },
];

/** Serbest etiket: işletmenin kendi gruplaması; izah değildir, sözlüğe seed'de girer. */
const ETIKETLER = [{ slug: 'ortak-a-araci', label: 'Ortak A aracı' }];

/**
 * Gider serisi: her satırın türü migration'ın tür sözlüğündendir, kime ödendiği biliniyorsa carisi de yazılır. "Ortak A aracı" etiketi
 * şirket giderinin bir ortağı ilgilendirdiğini gösterir; borç doğurmaz, yalnız ayırır.
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
  // Reklam gideri kampanya künyelidir: analitik kampanyanın giderini ve cirosunu yan yana koyar.
  { hesap: 'revolut', amount: 250, nature: 'reklam', description: 'Meta — bayram kampanyası', gunOnce: 14, meta: { campaign: 'bayram-2026' } },
  { hesap: 'revolut', amount: 180, nature: 'reklam', description: 'Google — marka araması', gunOnce: 6, meta: { campaign: 'marka-arama' } },
];

// `base` katmanında koşmaz, çünkü hesap adları da açılış bakiyeleri de uydurmadır; gerçek hesapları operatör kurar (`seed/tier.ts`).
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

  // `reconciled` yazılmaz: bayrak yalnız banka satırında anlamlıdır; elle girilen giderin izahı türünden gelir (`explained`
  // tetikleyiciyle kurulur).
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
    Ortak carisinin iki yönü: Ortak A şirket giderini cebinden ödedi (gider ortağın carisinden çıkar, şirket ortağa borçlanır), şirket
    Ortak B'nin kişisel ödemesini bankadan yaptı (banka → cari transferi, ortak şirkete borçlanır). Ortak etiketi yoktur, çünkü hesap
    kimin olduğunu zaten söyler.
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
    Belgeler: kira faturası ilk kira ödemesine tutarıyla bağlanır ve açık kalanı sıfırlanır, ayrı ödeme yazılmaz ki para iki kez
    sayılmasın; muhasebeci ve Orange faturaları ödenmemiştir. Açık belgeleri ekstrenin satırları referansla ve carinin eşleşme kelimesiyle
    bulur.
  */
  const documents = new MoneyDocumentService(db);
  const kiraFaturasi = await documents.insert({
    kind: 'invoice',
    business: 'lezzet',
    number: 'LOYER-2026-09',
    issuedOn: gun(-28),
    counterpartyId: cariId.get('sci')!,
    direction: 'out',
    nature: 'kira',
    amountCents: toCents(1450),
    // Boş işyeri kirası KDV'den muaftır (kiraya veren KDV'yi seçmediyse): kırılımı yok.
    vatRegime: 'exempt',
    note: 'Depo kirası — eylül',
  });
  // Defterden okunur (`ledger`): servis ham `getAll`ı dışarı vermiyor ve vermemeli — seed de bir çağırandır.
  const kiraSayfasi = await movements.ledger({ accountId: hesapId.get('cm')!, type: 'expense', from: gun(-26), to: gun(-26), limit: 1 });
  const kiraOdemesi = kiraSayfasi.rows[0];
  if (kiraOdemesi) await new MoneyAllocationService(db).insert({ movementId: kiraOdemesi.id, documentId: kiraFaturasi.id, amountCents: kiraOdemesi.amountCents });
  await documents.insert({
    kind: 'invoice',
    business: 'qualite',
    number: 'FA-2026-0912',
    issuedOn: gun(-4),
    counterpartyId: cariId.get('muller')!,
    direction: 'out',
    nature: 'muhasebe-ucreti',
    amountCents: toCents(360),
    vatLines: [{ vatRate: 20, netCents: toCents(300), vatCents: toCents(60) }],
    note: 'Aylık muhasebe ücreti — ödenmedi',
  });
  await documents.insert({
    kind: 'invoice',
    business: 'lezzet',
    number: 'ORANGE-0826',
    issuedOn: gun(-9),
    counterpartyId: cariId.get('orange')!,
    direction: 'out',
    nature: 'telefon-internet',
    amountCents: toCents(39.99),
    vatLines: [{ vatRate: 20, netCents: toCents(33.32), vatCents: toCents(6.67) }],
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

  // İlk kabulün tedarikçi faturası: ithalat olduğu için KDV yok (ters yükleme), kabul satırlarında olmayan nakliye faturada (+120 €) ve
  // vadeli. Tedarikçi borcu bu belgenin tutarından okunur; "Neyin faturası" seçicisi bu kabulü bir daha önermez.
  const faturali = ((girisler ?? []) as Array<{ id: string; supplier_id: string | null; total_amount: string }>).find((giris) => giris.supplier_id);
  if (faturali?.supplier_id) {
    await documents.insert({
      kind: 'invoice',
      business: 'lezzet',
      number: 'GBF-2026-0911',
      issuedOn: gun(-12),
      dueOn: gun(33),
      supplierId: faturali.supplier_id,
      stockIntakeId: faturali.id,
      direction: 'out',
      amountCents: toCents(Number(faturali.total_amount) + 120),
      // Ters yüklemede satırın KDV'si sıfır, oranı beyandaki oran: gıda ve onunla faturalanan nakliye %5,5.
      vatLines: [{ vatRate: 5.5, netCents: toCents(Number(faturali.total_amount) + 120), vatCents: 0 }],
      vatRegime: 'reverse_charge',
      note: 'Mal bedeli + nakliye — ithalat, KDV beyanda (autoliquidation)',
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

  // Payout'un aktarıldığı banka: webhook Stripe → bu hesap transferini kendiliğinden yazar. Kapıda alınan nakit çekmeceye, kart parası
  // kart cihazının hesabına (burada Revolut) girer; satış çağrısı hesabı açıkça verirse ayar ezilir.
  await new SettingsService(db).set('stripe_payout_account_id', hesapId.get('revolut')!, {
    description: 'Stripe payout\'unun aktarıldığı banka hesabı (12.14).',
  });
  await new SettingsService(db).set('door_cash_account_id', hesapId.get('kasa')!, {
    description: 'Kapı önü satış tahsilatının düştüğü hesap (12.2).',
  });
  await new SettingsService(db).set('door_card_account_id', hesapId.get('revolut')!, {
    description: 'Kapıda kartla alınan paranın düştüğü hesap.',
  });

  // Banka ekstresi ayrı adımdır (`seedBankQueue`), çünkü yalnız `full` katmanında koşar.

  const bakiyeler = await accounts.balances();
  const ozet = HESAPLAR.map((h) => `${h.name}: ${euro((bakiyeler.get(hesapId.get(h.key)!)?.balanceCents ?? 0) / 100)} €`).join(' · ');
  console.log(`  ✓ bakiye (türetilmiş) → ${ozet}`);
  console.log(
    `✓ para: ${HESAPLAR.length} hesap · ${GIDERLER.length + 1} gider · 3 transfer · tedarikçi ödemesi · ${faturali?.supplier_id ? 4 : 3} belge · ${CARILER.length} cari · ${ETIKETLER.length} etiket`,
  );
}

/**
 * Banka ekstresi ve eşleştirme kuyruğu; hesabını adıyla kendisi bulur, çünkü çağıranın hesap haritasını taşıması iki seed adımı
 * arasında bir bağ daha kurardı. Satırlar sipariş tutarından türemez, çünkü besleme sipariş yazmaz; öneri hâlleri `seedMoney`nin
 * yazdığı kayıtlarla buluşur.
 */
export async function seedBankQueue(db: Db): Promise<void> {
  // Koruma: ikinci koşu `bank_import_profile_name_key` tekilliğine çarpıp seed'i keserdi ve sonraki bölümler hiç çalışmazdı.
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
    Satırların beşi `seedMoney`nin kayıtlarıyla buluşur: URSSAF elle yazılmış kesintiyle ("zaten yazılmış hareket"), VERSEMENT kasa →
    Crédit Mutuel transferinin banka yakasıyla, ORANGE ve MULLER açık faturalarla (eşleşme kelimesi, referans), FRAIS TENUE carinin
    kelimesiyle. Geri kalanı önerisiz durur (nakit çekimi, tanınmayan havale), gerçek bir ekstre de öyledir.
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
      // Ekstre satırı euro okur (banka dosyası öyle gelir); hareket cent yazar (STACK §8).
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

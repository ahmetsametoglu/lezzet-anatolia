import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService, MoneyMovementService, MovementTagService, serviceDb } from '@lezzet/database';
import { signedAmountCentsFor } from '@lezzet/domain-core';
import { purgeTestData } from '@lezzet/database/testing';
import { recordMovement, transfer } from './movement';

/**
 * Para hareketi kapısı (12.1). Motorun kararı ile servisin yazımının doğru bağlandığı doğrulanır:
 * anlamsız hareket **yazılmadan** reddediliyor mu, geçerli olan defterde doğru işaretle mi duruyor.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);

const stamp = Date.now();
const createdAccounts: string[] = [];
const createdTags: string[] = [];
let cashAccount: string;
let bankAccount: string;

beforeAll(async () => {
  cashAccount = (await accounts.insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
  bankAccount = (await accounts.insert({ name: `Kapı bankası ${stamp}`, type: 'bank' })).id;
  createdAccounts.push(cashAccount, bankAccount);
});

afterAll(async () => {
  // Hareket + hesap + etiket sırası `cleanup.ts`'te; burada tekrarlansaydı biri bir gün ötekinden ayrışırdı.
  await purgeTestData(db, { accountIds: createdAccounts, tagSlugs: createdTags });
});

describe('elle hareket girişi', () => {
  it('geçerli gider yazılır', async () => {
    const result = await recordMovement({ accountId: cashAccount, direction: 'out', amountCents: 12_000, type: 'expense', nature: 'akaryakit' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.nature).toBe('akaryakit');
    // Türü olan hareket izahlıdır (13.09) — tetikleyici kurar, yazılmadan doğru.
    expect(result.movement.explained).toBe(true);
  });

  it('sözlükte olmayan etiket veritabanında reddedilir — kural veride durur (13.09)', async () => {
    await expect(
      movements.insert({ accountId: cashAccount, direction: 'out', amountCents: 1000, type: 'expense', tags: ['uydurma-etiket'] }),
    ).rejects.toThrow(/tanınmayan etiket/);
  });

  it('TÜR KAPISI (13.09): gider türü giren paraya, tür transfere konmaz; bilinmeyen tür yazılmaz', async () => {
    const before = (await accounts.balance(cashAccount)).movementCount;
    expect(await recordMovement({ accountId: cashAccount, direction: 'in', amountCents: 1000, type: 'misc', nature: 'kira' })).toMatchObject({
      status: 'invalid',
      reason: 'nature_direction',
    });
    expect(
      await recordMovement({ accountId: cashAccount, counterAccountId: bankAccount, direction: 'out', amountCents: 1000, type: 'transfer', nature: 'kira' }),
    ).toMatchObject({ status: 'invalid', reason: 'nature_not_applicable' });
    expect(await recordMovement({ accountId: cashAccount, direction: 'out', amountCents: 1000, type: 'expense', nature: 'uydurma-tur' })).toMatchObject({
      status: 'invalid',
      reason: 'unknown_nature',
    });
    expect((await accounts.balance(cashAccount)).movementCount).toBe(before); // tek satır bile yazılmadı
  });

  it('türü olmayan hareket izah bekler; ETİKET izah değildir, TÜR gelince izahlı olur (13.09)', async () => {
    const created = await movements.insert({ accountId: cashAccount, direction: 'out', amountCents: 700, type: 'misc' });
    expect(created.explained).toBe(false);

    const etiket = await new MovementTagService(db).insert({ slug: `izah-${stamp}`, label: `İzah testi ${stamp}` });
    createdTags.push(etiket.slug);
    expect((await movements.update({ id: created.id, tags: [etiket.slug] })).explained).toBe(false);
    expect((await movements.update({ id: created.id, nature: 'banka-masrafi' })).explained).toBe(true);
  });

  it('tipin yönüne uymayan hareket YAZILMADAN reddedilir', async () => {
    const before = (await accounts.balance(cashAccount)).movementCount;
    // "Gider" deyip parayı içeri almak: veritabanı için geçerli, rapor için yalan.
    const result = await recordMovement({ accountId: cashAccount, direction: 'in', amountCents: 5000, type: 'expense' });

    expect(result).toMatchObject({ status: 'invalid', reason: 'direction_mismatch' });
    expect((await accounts.balance(cashAccount)).movementCount).toBe(before); // tek satır bile yazılmadı
  });

  it('siparişsiz sipariş tahsilatı reddedilir — cache o bağdan türetilecek (12.2)', async () => {
    expect(await recordMovement({ accountId: cashAccount, direction: 'in', amountCents: 3000, type: 'order_payment' })).toMatchObject({
      status: 'invalid',
      reason: 'order_link_missing',
    });
  });

  it('bağsız stok alımı reddedilir — tedarikçi borcu bu bağdan türetilecek (12.3)', async () => {
    expect(await recordMovement({ accountId: cashAccount, direction: 'out', amountCents: 30_000, type: 'purchase' })).toMatchObject({
      status: 'invalid',
      reason: 'supply_link_missing',
    });
  });
});

describe('transfer', () => {
  it('tek satır yazar, iki hesabı simetrik etkiler', async () => {
    const cashBefore = (await accounts.balance(cashAccount)).balanceCents;
    const bankBefore = (await accounts.balance(bankAccount)).balanceCents;

    const result = await transfer({ fromAccountId: cashAccount, toAccountId: bankAccount, amountCents: 20_000, description: 'Günlük yatırma' });
    expect(result.status).toBe('ok');

    expect((await accounts.balance(cashAccount)).balanceCents).toBe(cashBefore - 20_000);
    expect((await accounts.balance(bankAccount)).balanceCents).toBe(bankBefore + 20_000);
    if (result.status !== 'ok') return;
    expect(await movements.getById(result.movement.id)).toMatchObject({ type: 'transfer', direction: 'out', counterAccountId: bankAccount });
  });

  it('kendine transfer reddedilir', async () => {
    expect(await transfer({ fromAccountId: cashAccount, toAccountId: cashAccount, amountCents: 1000 })).toMatchObject({
      status: 'invalid',
      reason: 'transfer_same_account',
    });
  });
});

/**
 * **KURAL İKİ DİLDE YAZILI — ikisi hâlâ aynı şeyi mi söylüyor?** (denetim 27.08)
 *
 * İşaret kuralı (*"girişte artı, çıkışta eksi; transferin karşı ucunda ters"*) iki yerde birden
 * uygulanıyor ve ikisi de canlı:
 *   · SQL — `account_movement` görünümü (`0018_money.sql`). Bakiye ve hesap ekstresi buradan.
 *   · TypeScript — `signedAmountCentsFor` (`domain-core/money/movement.ts`). Form önizlemesi için.
 *
 * Veritabanı bizim motorumuzu çağıramaz (ayrı dil), yani nüsha KALDIRILAMAZ. Kaldırılamayan
 * nüshanın tek savunması, ikisini karşılaştıran bir testtir — ve 27.08'e kadar öyle bir test YOKTU.
 *
 * ── İKİ KÜNYE BİRBİRİNİ TEMİNAT GÖSTERİYORDU, İKİSİ DE YANLIŞTI ─────────────
 * Motor: *"ayrıştıklarında bu fonksiyonun testi sessiz kalmaz."* Kalırdı — kendi testi yalnız TS'i
 * ölçüyor, SQL'e hiç dokunmuyordu.
 * SQL: *"İşaret kuralının TEK uygulaması burasıdır — kural SQL'de ve TypeScript'te ayrı ayrı
 * yazılmaz."* Yazılmıştı.
 * Yani her iki taraf da okuyucuya "öteki taraf güvende" diyordu. Yanlış teminat, teminatsızlıktan
 * kötüdür: okuyanı kontrol etmekten alıkoyar. Bu test o cümleleri DOĞRU hâle getiriyor.
 *
 * İddia satır satır kurulmuyor: defterin ÜRETTİĞİ her satır motora sorulup karşılaştırılıyor.
 * Motorun girdisi satırın HAM alanları (`account_id`, `counter_account_id`, `direction`, `amount`),
 * çıktısı ise görünümün TÜRETTİĞİ kolon — yani iki bağımsız yol, aynı soru.
 */
describe('işaret kuralı: SQL görünümü ile motor aynı cevabı veriyor', () => {
  it('defterin her satırı motorun cevabıyla birebir aynı', async () => {
    // Dört şekil de kurulur: giriş · çıkış · transferin gönderen ucu · transferin alan ucu.
    await movements.insert({ accountId: cashAccount, direction: 'in', amountCents: 4321, type: 'capital', description: 'işaret testi' });
    await movements.insert({ accountId: cashAccount, direction: 'out', amountCents: 1234, type: 'expense', description: 'işaret testi' });
    const aktarim = await transfer({ fromAccountId: cashAccount, toAccountId: bankAccount, amountCents: 5000, description: 'işaret testi' });
    expect(aktarim.status).toBe('ok');

    const gorulen = new Set<string>();
    for (const hesap of [cashAccount, bankAccount]) {
      const sayfa = await movements.ledger({ accountId: hesap });
      for (const satir of sayfa.rows) {
        // ASIL İDDİA: görünümün türettiği sayı ile motorun hesapladığı sayı aynı olmalı.
        expect(satir.signedAmountCents).toBe(signedAmountCentsFor(satir, satir.ledgerAccountId));
        gorulen.add(`${satir.direction}-${satir.ledgerAccountId === satir.accountId ? 'kendi' : 'karşı'}`);
      }
    }

    /* Kapsam iddiası — testin BOŞA yeşil olmamasının güvencesi. Yukarıdaki döngü sıfır satır
       gezseydi de geçerdi; asıl korunmak istenen hâl bu. Üç şekil şart: giriş, çıkış ve transferin
       karşı ucu. (`in`+karşı uç bugün ÜRETİLEMİYOR — transfer kapısı transferi hep gönderenin
       gözünden `out` yazıyor. Motor o dalı yine de taşıyor; sınanamayan bir dalı sınıyormuş gibi
       yapmak yerine burada yazılı bırakıyorum.) */
    expect(gorulen).toContain('in-kendi');
    expect(gorulen).toContain('out-kendi');
    expect(gorulen).toContain('out-karşı');
  });
});

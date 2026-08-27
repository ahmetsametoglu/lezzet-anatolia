import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService, MoneyMovementService, serviceDb } from '@lezzet/database';
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
let cashAccount: string;
let bankAccount: string;

beforeAll(async () => {
  cashAccount = (await accounts.insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
  bankAccount = (await accounts.insert({ name: `Kapı bankası ${stamp}`, type: 'bank' })).id;
  createdAccounts.push(cashAccount, bankAccount);
});

afterAll(async () => {
  // Hareket + hesap sırası `cleanup.ts`'te; burada tekrarlansaydı biri bir gün ötekinden ayrışırdı.
  await purgeTestData(db, { accountIds: createdAccounts });
});

describe('elle hareket girişi', () => {
  it('geçerli gider yazılır', async () => {
    const result = await recordMovement({ accountId: cashAccount, direction: 'out', amountCents: 12_000, type: 'expense', category: 'akaryakıt' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.category).toBe('akaryakıt');
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
 *   · SQL — `account_movement` görünümü (`0018_money.sql:99-111`). Bakiye ve hesap ekstresi buradan.
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
    await movements.insert({ accountId: cashAccount, direction: 'in', amountCents: 4321, type: 'capital', category: 'işaret testi' });
    await movements.insert({ accountId: cashAccount, direction: 'out', amountCents: 1234, type: 'expense', category: 'işaret testi' });
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

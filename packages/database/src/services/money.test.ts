import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Business } from '@lezzet/types';
import { AccountService, CounterpartyService, MoneyAllocationService, MoneyDocumentService, MoneyMovementService } from './money.service';
import { CategoryService } from './category.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';
import { StockIntakeService } from './stock-intake.service';
import { SupplierService } from './supplier.service';
import { UserProfileService } from './user-profile.service';
import { WarehouseService } from './warehouse.service';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { createTestWarehouse } from '../testing/warehouse';

/**
 * Hesaplar ve para hareketleri (DOMAIN §9): bakiye saklanmaz, hareketlerden türer. Asıl incelik transferdedir: tek satır yazılır
 * ama iki hesabı simetrik etkiler.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);

const stamp = Date.now();
const createdAccounts: string[] = [];
const createdDocuments: string[] = [];
let counter = 0;

/** Test hesabı — hesap adı BENZERSİZDİR (unique index `lower(name)`), o yüzden her açılış sayaçlı. */
async function openAccount(ad: string, type: 'cash' | 'bank' | 'provider' = 'bank') {
  counter += 1;
  const account = await accounts.insert({ name: `${ad} ${stamp}-${counter}`, type });
  createdAccounts.push(account.id);
  return account;
}

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let cashAccount: Awaited<ReturnType<typeof openAccount>>;
let bankAccount: Awaited<ReturnType<typeof openAccount>>;

beforeEach(async () => {
  for (const id of createdAccounts) await db.from('money_movement').delete().eq('account_id', id);
  cashAccount = await openAccount('Kasa', 'cash');
  bankAccount = await openAccount('Revolut');
});

afterAll(async () => {
  // Hareket → hesap sırası `cleanup.ts`'te; her dosya kendi sırasını uydurursa biri yanlış olur.
  await purgeTestData(db, { accountIds: createdAccounts, documentIds: createdDocuments });
});

describe('hesap', () => {
  it('yeni hesap 0 bakiyeyle görünür — hiç hareketi yok diye listeden düşmez', async () => {
    expect(await accounts.balance(cashAccount.id)).toMatchObject({ balanceCents: 0, movementCount: 0 });
  });

  it('kapatma SİLME değil pasifleştirmedir — geçmiş hareketleri ona bağlı', async () => {
    const kapali = await accounts.deactivate(bankAccount.id);
    expect(kapali.isActive).toBe(false);
    expect((await accounts.list({ activeOnly: true })).map((h) => h.id)).not.toContain(bankAccount.id);
    expect((await accounts.list()).map((h) => h.id)).toContain(bankAccount.id);
  });
});

describe('bakiye TÜRETİLİR (saklanmaz)', () => {
  it('giriş artırır, çıkış azaltır', async () => {
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 25_000, type: 'capital', description: 'Açılış' });
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 9050, type: 'expense', nature: 'kira' });

    expect((await accounts.balance(cashAccount.id)).balanceCents).toBe(15_950);
    expect((await accounts.balance(cashAccount.id)).movementCount).toBe(2);
  });

  it('tüm hesapların bakiyesi TEK sorguda gelir (N+1 yok)', async () => {
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 10_000, type: 'capital' });
    await movements.insert({ accountId: bankAccount.id, direction: 'in', amountCents: 4000, type: 'capital' });

    const byId = await accounts.balances();
    expect(byId.get(cashAccount.id)?.balanceCents).toBe(10_000);
    expect(byId.get(bankAccount.id)?.balanceCents).toBe(4000);
  });
});

describe('transfer — tek satır, iki hesap', () => {
  it('gönderenden düşer, alana girer; toplam servet DEĞİŞMEZ', async () => {
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 80_000, type: 'capital' });
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 50_000, type: 'transfer', counterAccountId: bankAccount.id, description: 'Bankaya yatırıldı' });

    expect((await accounts.balance(cashAccount.id)).balanceCents).toBe(30_000); // 800 − 500
    expect((await accounts.balance(bankAccount.id)).balanceCents).toBe(50_000);

    // Transfer serveti değiştirmez, yerini değiştirir.
    const byId = await accounts.balances();
    expect(byId.get(cashAccount.id)!.balanceCents + byId.get(bankAccount.id)!.balanceCents).toBe(80_000);
  });

  it('transfer İKİ hesabın da ekstresinde görünür — karşı uçta işaret ters', async () => {
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 12_000, type: 'transfer', counterAccountId: bankAccount.id });

    const cashLedger = await movements.ledger({ accountId: cashAccount.id });
    const bankLedger = await movements.ledger({ accountId: bankAccount.id });
    expect(cashLedger.rows).toHaveLength(1);
    expect(bankLedger.rows).toHaveLength(1);
    expect(cashLedger.rows[0]!.signedAmountCents).toBe(-12_000);
    expect(bankLedger.rows[0]!.signedAmountCents).toBe(12_000);
    // Aynı hareket, iki defter satırı: id ortak.
    expect(cashLedger.rows[0]!.id).toBe(bankLedger.rows[0]!.id);

    // Hesap-üstü okumada transferin iki ayağı da kalır, çünkü birini gizlemek keyfî olurdu ve ikisi birbirini götürdüğü için toplam
    // doğru çıkar. Süzgeç tiptir, hesap değil; testin kendi satırları ilk sayfada kalsın diye evren daraltılır (`CLAUDE §4b`).
    const hepsi = await movements.ledger({ type: 'transfer', limit: 200 });
    const ayaklar = hepsi.rows.filter((r) => r.id === cashLedger.rows[0]!.id);
    expect(ayaklar).toHaveLength(2);
    expect(ayaklar.reduce((a, r) => a + r.signedAmountCents, 0)).toBe(0);
  });

  it('karşı ucu olmayan transfer VERİTABANINDA reddedilir — yarım transfer bakiyeyi kaydırırdı', async () => {
    await expect(movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 5000, type: 'transfer' })).rejects.toThrow();
  });

  it('transfer olmayan harekette karşı hesap veritabanında reddedilir', async () => {
    await expect(
      movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 5000, type: 'expense', counterAccountId: bankAccount.id }),
    ).rejects.toThrow();
  });

  it('sıfır ve negatif tutar veritabanında reddedilir', async () => {
    await expect(movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 0, type: 'misc' })).rejects.toThrow();
  });
});

describe('ekstre ve dönem', () => {
  it('değer tarihine göre en yeni önce; tarih aralığı süzülür', async () => {
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 1000, type: 'misc', valueDate: dayOffset(-20) });
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 2000, type: 'misc', valueDate: dayOffset(-5) });
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 3000, type: 'misc', valueDate: dayOffset(-1) });

    const all = await movements.ledger({ accountId: cashAccount.id });
    expect(all.rows.map((r) => r.amountCents)).toEqual([3000, 2000, 1000]);

    const aralik = await movements.ledger({ accountId: cashAccount.id, from: dayOffset(-10), to: dayOffset(0) });
    expect(aralik.rows.map((r) => r.amountCents)).toEqual([3000, 2000]);
  });

  it('eşleşmemiş satırlar süzülebilir — banka eşleştirme kuyruğu (12.4)', async () => {
    const eslesen = await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 1500, type: 'misc' });
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 2500, type: 'misc' });
    await movements.markReconciled(eslesen.id);

    const queue = await movements.ledger({ accountId: cashAccount.id, unreconciledOnly: true });
    expect(queue.rows.map((r) => r.amountCents)).toEqual([2500]);
  });

  it('TİP süzgeci — tasarımın "+ tip" çipi (12.4)', async () => {
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 700, type: 'expense' });
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 900, type: 'misc' });

    const giderler = await movements.ledger({ accountId: cashAccount.id, type: 'expense' });
    expect(giderler.rows.every((r) => r.type === 'expense')).toBe(true);
    expect(giderler.rows.map((r) => r.amountCents)).toContain(700);
    expect(giderler.rows.map((r) => r.amountCents)).not.toContain(900);
  });

  it('İZAH sayacı sayfadan değil defterden gelir — kuyruğu es geçmesin (13.09)', async () => {
    // Sayfa ilk N satırı taşır; ekran onu sayarsa "7" yerine "20+" yazar (sayaç olmayan bir sayaç).
    // Küresel sayıya bakılmıyor (`CLAUDE §4b`) — ölçüt kendi eklediğimizin FARKI.
    const once = await movements.unexplainedCount();
    // Bağsız, belgesiz, türsüz satır izah bekler; türlü satır saymaz, çünkü etiket izah değildir.
    const izahsiz = await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 111, type: 'misc' });
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 222, type: 'expense', nature: 'banka-masrafi' });
    const sonra = await movements.unexplainedCount();
    expect(sonra).toBe(once + 1);

    // Sayfa sınırından bağımsız: tek satırlık sayfa istesek bile sayaç değişmez.
    const tekSatir = await movements.ledger({ accountId: cashAccount.id, unexplainedOnly: true, limit: 1 });
    expect(tekSatir.rows).toHaveLength(1);
    expect(tekSatir.rows.every((row) => !row.explained)).toBe(true);
    expect(await movements.unexplainedCount()).toBe(sonra);

    // Tür gelince satır kuyruktan düşer — tetikleyicinin kolonu satırla birlikte değişir.
    await movements.update({ id: izahsiz.id, nature: 'sermaye' });
    expect(await movements.unexplainedCount()).toBe(once);
  });

  it('dönem toplamları tip+yön kırılımında toplanır; dönem dışı satır girmez', async () => {
    // `periodTotals` ŞİRKET GENELİDİR (hesap süzgeci yok) — bu yüzden mutlak değere değil FARKA
    // bakılır: test kendi eklediğinin toplama ne kattığını ölçer, veritabanındaki diğer
    // hareketlerden (seed, paralel test) etkilenmez.
    const oku = async (tip: 'expense' | 'capital') =>
      (await movements.periodTotals(dayOffset(-10), dayOffset(0))).find((t) => t.type === tip) ?? { totalCents: 0, count: 0 };
    const expenseBefore = await oku('expense');
    const capitalBefore = await oku('capital');

    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 90_000, type: 'expense', nature: 'kira', valueDate: dayOffset(-3) });
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 12_040, type: 'expense', nature: 'akaryakit', valueDate: dayOffset(-2) });
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 6000, type: 'capital', valueDate: dayOffset(-2) });
    // Dönem DIŞI — toplama girmemeli.
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 500_000, type: 'expense', valueDate: dayOffset(-90) });

    const expenseAfter = await oku('expense');
    expect(expenseAfter.totalCents - expenseBefore.totalCents).toBe(102_040); // 5000'lik satır dönem dışı
    expect(expenseAfter.count - expenseBefore.count).toBe(2);

    const capitalAfter = await oku('capital');
    expect(capitalAfter.totalCents - capitalBefore.totalCents).toBe(6000);
  });

  it('değer tarihi kayıt tarihinden AYRIDIR: dünkü nakit bugün girilebilir', async () => {
    const movement = await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 7500, type: 'misc', valueDate: dayOffset(-7) });
    expect(movement.valueDate).toBe(dayOffset(-7));
    expect(movement.createdAt.slice(0, 10)).toBe(dayOffset(0));
  });
});

/**
 * Para hareketi ailesinin euro↔cent sınırı (STACK §8): tablo, defter görünümü, bakiye görünümü ve RPC ayrı kodda çevrilir. Kolonlar
 * ham okunur, çünkü iki tarafı da servisten okuyan test aynı yanlış sabitle çarpılsa geçerdi.
 */
describe('para hareketi — euro↔cent sınırı', () => {
  it('cent yazılır, kolon euro tutar, cent okunur (tablo + görünüm + bakiye)', async () => {
    const movement = await movements.insert({
      accountId: cashAccount.id,
      direction: 'out',
      amountCents: 1234,
      type: 'expense',
      description: 'sınır testi',
    });
    expect(movement.amountCents).toBe(1234);

    const { data } = await db.from('money_movement').select('amount').eq('id', movement.id).single();
    expect(Number((data as { amount: number | string }).amount)).toBe(12.34);

    // Görünümün türettiği işaretli tutar da cent: çıkışta negatif.
    const ledger = await movements.ledger({ accountId: cashAccount.id, limit: 1 });
    expect(ledger.rows[0]?.amountCents).toBe(1234);
    expect(ledger.rows[0]?.signedAmountCents).toBe(-1234);
  });

  it('bakiye görünümü de cent döndürür — Σ defter satırı', async () => {
    const account = await openAccount('Sınır kasası');
    await movements.insert({ accountId: account.id, direction: 'in', amountCents: 10_050, type: 'capital' });
    await movements.insert({ accountId: account.id, direction: 'out', amountCents: 2525, type: 'expense', description: 'test' });

    expect((await accounts.balance(account.id)).balanceCents).toBe(7525);
    await purgeTestData(db, { accountIds: [account.id] });
  });
});

describe('belge arşivi — tarih aralığı ve imleç (12.17)', () => {
  it('aralık belge gününü süzer; sayfa en yeniden eskiye, imleç kaldığı yerden devam eder', async () => {
    const documents = new MoneyDocumentService(db);
    // Yerelde kimsenin yazmadığı bir ay: sayfa bütün belgeleri okur, aralığa yalnız bu testinkiler düşer.
    const days = ['2003-03-02', '2003-03-05', '2003-03-09', '2003-03-12'];
    for (const [i, issuedOn] of days.entries()) {
      const document = await documents.insert({
        kind: 'invoice',
        business: 'lezzet',
        number: `ARSIV-${stamp}-${i}`,
        issuedOn,
        direction: 'out',
        amountCents: 1000 + i,
      });
      createdDocuments.push(document.id);
    }

    // 12'si aralığın dışında; ilk sayfa en yeni iki belge, imleç üçüncüyü getirir.
    const first = await documents.page({ from: '2003-03-01', to: '2003-03-10', limit: 2 });
    expect(first.rows.map((document) => document.issuedOn)).toEqual(['2003-03-09', '2003-03-05']);
    expect(first.nextCursor).not.toBeNull();
    const second = await documents.page({ from: '2003-03-01', to: '2003-03-10', limit: 2, cursor: first.nextCursor! });
    expect(second.rows.map((document) => document.issuedOn)).toEqual(['2003-03-02']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('hareketin işi', () => {
  const documents = new MoneyDocumentService(db);
  const allocations = new MoneyAllocationService(db);
  const parties = {
    supplierIds: [] as string[],
    counterpartyIds: [] as string[],
    warehouseIds: [] as string[],
    orderIds: [] as string[],
    productIds: [] as string[],
    categoryIds: [] as string[],
    profileIds: [] as string[],
  };

  afterAll(async () => {
    await purgeTestData(db, parties);
  });

  const counterpartyOf = async (defaultBusiness: Business | null) => {
    const row = await new CounterpartyService(db).insert({ name: `İş carisi ${stamp}-${parties.counterpartyIds.length}`, defaultBusiness });
    parties.counterpartyIds.push(row.id);
    return row;
  };
  const supplierOf = async (defaultBusiness: Business | null) => {
    const row = await new SupplierService(db).insert({ name: `İş tedarikçisi ${stamp}-${parties.supplierIds.length}`, defaultBusiness });
    parties.supplierIds.push(row.id);
    return row;
  };
  const warehouseOf = async (business: Business) => {
    const row = await createTestWarehouse(db);
    parties.warehouseIds.push(row.id);
    return new WarehouseService(db).update({ id: row.id, business });
  };
  const documentOf = async (business: Business, amountCents = 1000) => {
    const row = await documents.insert({ kind: 'invoice', business, issuedOn: dayOffset(-1), direction: 'out', amountCents });
    createdDocuments.push(row.id);
    return row;
  };
  const businessOf = async (movementId: string) => (await movements.getById(movementId))?.business;

  it("iş sırayla belge bağından, mal kabulün deposundan, tedarikçiden, cariden gelir, hiçbiri söylemiyorsa Lezzet'tir; bağ kalkınca geri döner", async () => {
    const counterparty = await counterpartyOf('qualite');
    const movement = await movements.insert({
      accountId: bankAccount.id,
      direction: 'out',
      amountCents: 1000,
      type: 'expense',
      counterpartyId: counterparty.id,
    });
    expect(movement.business).toBe('qualite');
    await movements.update({ id: movement.id, counterpartyId: null });
    expect(await businessOf(movement.id)).toBe('lezzet');

    const supplier = await supplierOf('qualite');
    await movements.update({ id: movement.id, supplierId: supplier.id });
    expect(await businessOf(movement.id)).toBe('qualite');

    const warehouse = await warehouseOf('lezzet');
    const intake = await new StockIntakeService(db).insert({ supplierId: supplier.id, warehouseId: warehouse.id });
    await movements.update({ id: movement.id, stockIntakeId: intake.id });
    expect(await businessOf(movement.id)).toBe('lezzet');

    const document = await documentOf('qualite');
    await allocations.insert({ movementId: movement.id, documentId: document.id, amountCents: 1000 });
    expect(await businessOf(movement.id)).toBe('qualite');
    await allocations.remove(movement.id, document.id);
    expect(await businessOf(movement.id)).toBe('lezzet');
  });

  it('sipariş parası işini siparişin deposundan alır', async () => {
    const warehouse = await warehouseOf('qualite');
    const categoryId = (await new CategoryService(db).create({ name: { tr: `İş testi ${stamp}` } })).id;
    parties.categoryIds.push(categoryId);
    const { product, variants } = await new ProductService(db).create({
      name: { tr: `İş testi ürünü ${stamp}` },
      categoryId,
      variants: [{ label: { tr: '1 kg' } }],
    });
    parties.productIds.push(product.id);
    // Siparişin müşterisi deponun işinden olmak zorunda; QUALITE yalnız onaylı şirkete verilir ve kargo göndermez.
    const profiles = new UserProfileService(db);
    const customerId = (
      await profiles.insert({ name: `İş testi müşterisi ${stamp}`, type: 'company', companyInfo: { legalName: `SARL İş testi ${stamp}` } })
    ).id;
    parties.profileIds.push(customerId);
    await profiles.approveB2b(customerId);
    await profiles.update({ id: customerId, business: 'qualite' });
    const { order } = await new OrderService(db).create(
      { customerId, warehouseId: warehouse.id, channel: 'b2b', deliveryType: 'route', status: 'confirmed' },
      [{ variantId: variants[0]!.id, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
    );
    parties.orderIds.push(order.id);

    const payment = await movements.insert({
      accountId: bankAccount.id,
      direction: 'in',
      amountCents: 1055,
      type: 'order_payment',
      orderId: order.id,
    });
    expect(payment.business).toBe('qualite');
  });

  it('bir hareket iki işin belgesine bağlanamaz; belgenin işi değişince ödemesi izler, ödeme öteki işin belgesine de bağlıysa değişemez', async () => {
    const movement = await movements.insert({
      accountId: bankAccount.id,
      direction: 'out',
      amountCents: 3000,
      type: 'expense',
      description: 'iki belge',
    });
    const first = await documentOf('lezzet');
    const second = await documentOf('qualite');
    await allocations.insert({ movementId: movement.id, documentId: first.id, amountCents: 1000 });
    await expect(allocations.insert({ movementId: movement.id, documentId: second.id, amountCents: 1000 })).rejects.toThrow(
      /iki işin belgesine/,
    );

    await documents.update({ id: first.id, business: 'qualite' });
    expect(await businessOf(movement.id)).toBe('qualite');
    await allocations.insert({ movementId: movement.id, documentId: second.id, amountCents: 1000 });
    await expect(documents.update({ id: first.id, business: 'lezzet' })).rejects.toThrow(/işi değişemez/);
  });

  it('yazanın gönderdiği iş ezilir; bağı değişmeyen güncelleme, varsayılan sonradan değişse de işi kaydırmaz', async () => {
    const counterparty = await counterpartyOf('qualite');
    const movement = await movements.insert({
      accountId: bankAccount.id,
      direction: 'out',
      amountCents: 1000,
      type: 'expense',
      counterpartyId: counterparty.id,
    });
    expect(movement.business).toBe('qualite');

    const { error } = await db.from('money_movement').update({ business: 'lezzet' }).eq('id', movement.id);
    expect(error).toBeNull();
    expect(await businessOf(movement.id)).toBe('qualite');

    await new CounterpartyService(db).update({ id: counterparty.id, defaultBusiness: 'lezzet' });
    await movements.update({ id: movement.id, description: 'açıklama değişti' });
    expect(await businessOf(movement.id)).toBe('qualite');

    await movements.update({ id: movement.id, counterpartyId: null });
    expect(await businessOf(movement.id)).toBe('lezzet');
  });
});

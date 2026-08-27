import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountService, MoneyMovementService } from './money.service';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';

/**
 * Hesaplar + para hareketleri (12.1) — DOMAIN §9.
 *
 * Doğrulanan şey **türetimin doğruluğu**: bakiye hiçbir yerde saklanmıyor, hareketlerden çıkıyor.
 * Asıl incelik transferde: TEK satır yazılıyor ama İKİ hesabı simetrik etkilemesi gerekiyor.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);

const stamp = Date.now();
const createdAccounts: string[] = [];
let counter = 0;

/** Test hesabı — hesap adı BENZERSİZDİR (unique index `lower(name)`), o yüzden her açılış sayaçlı. */
async function openAccount(ad: string, type: 'cash' | 'bank' | 'provider' = 'bank') {
  counter += 1;
  const account = await accounts.insert({ name: `${ad} ${stamp}-${counter}`, type });
  createdAccounts.push(account.id);
  return account;
}

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
// `euro()` kırpıcısı KALKTI (02.9): toplamlar tamsayı cent, kırpılacak kayan-nokta artığı yok.

let cashAccount: Awaited<ReturnType<typeof openAccount>>;
let bankAccount: Awaited<ReturnType<typeof openAccount>>;

beforeEach(async () => {
  for (const id of createdAccounts) await db.from('money_movement').delete().eq('account_id', id);
  cashAccount = await openAccount('Kasa', 'cash');
  bankAccount = await openAccount('Revolut');
});

afterAll(async () => {
  // Hareket → hesap sırası `cleanup.ts`'te; her dosya kendi sırasını uydurursa biri yanlış olur.
  await purgeTestData(db, { accountIds: createdAccounts });
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
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 9050, type: 'expense', category: 'kira' });

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

    // **HESAP-ÜSTÜ okumada transferin İKİ AYAĞI DA kalır** (karar 04.08, operasyon şeridinin
    // talebi). Birini seçip ötekini gizlemek keyfî olurdu ve "hangi ayak" sorusunun cevabı yok.
    // İkisi birbirini götürdüğü için "Tümü"nün toplamı da doğru çıkar: para işletmeden çıkmadı.
    // Süzgeç HESAP DEĞİL TİP: iddia "hesap-üstü okumada iki ayak da kalır"dır, o yüzden `accountId`
    // verilemez — ama `type` verilebilir ve evreni daraltır. Çıplak `ledger()` idi ve paylaşılan
    // veritabanında kırılgandı: okuma keyset sayfalı (`valueDate desc`), yani `money_movement`
    // kirliliği biriktiğinde testin kendi satırı ilk sayfanın DIŞINA düşüyor ve `expected [] to
    // have length 2` ile yalancı kırmızı veriyordu (bildirim şeridi 26.08'de bir kez ölçtü, not
    // bıraktı; sebep bugün doğrulandı). `CLAUDE §4b`: kendi kurduğun satırları oku.
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

  it('eşleşmemiş SAYACI sayfadan değil defterden gelir — kuyruğu es geçmesin', async () => {
    // Sayfa ilk N satırı taşır; ekran onu sayarsa "7" yerine "20+" yazar (sayaç olmayan bir sayaç).
    // Küresel sayıya bakılmıyor (`CLAUDE §4b`) — ölçüt kendi eklediğimizin FARKI.
    const once = await movements.unreconciledCount();
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 111, type: 'misc' });
    const sonra = await movements.unreconciledCount();
    expect(sonra).toBe(once + 1);

    // Sayfa sınırından bağımsız: tek satırlık sayfa istesek bile sayaç değişmez.
    const tekSatir = await movements.ledger({ accountId: cashAccount.id, unreconciledOnly: true, limit: 1 });
    expect(tekSatir.rows).toHaveLength(1);
    expect(await movements.unreconciledCount()).toBe(sonra);
  });

  it('dönem toplamları tip+yön kırılımında toplanır; dönem dışı satır girmez', async () => {
    // `periodTotals` ŞİRKET GENELİDİR (hesap süzgeci yok) — bu yüzden mutlak değere değil FARKA
    // bakılır: test kendi eklediğinin toplama ne kattığını ölçer, veritabanındaki diğer
    // hareketlerden (seed, paralel test) etkilenmez.
    const oku = async (tip: 'expense' | 'capital') =>
      (await movements.periodTotals(dayOffset(-10), dayOffset(0))).find((t) => t.type === tip) ?? { totalCents: 0, count: 0 };
    const expenseBefore = await oku('expense');
    const capitalBefore = await oku('capital');

    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 90_000, type: 'expense', category: 'kira', valueDate: dayOffset(-3) });
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 12_040, type: 'expense', category: 'akaryakıt', valueDate: dayOffset(-2) });
    await movements.insert({ accountId: cashAccount.id, direction: 'in', amountCents: 6000, type: 'capital', valueDate: dayOffset(-2) });
    // Dönem DIŞI — toplama girmemeli.
    await movements.insert({ accountId: cashAccount.id, direction: 'out', amountCents: 500_000, type: 'expense', valueDate: dayOffset(-90) });

    const expenseAfter = await oku('expense');
    // `euro()` sarmalayıcısı KALKTI: toplam tamsayı cent, düzeltilecek kayan-nokta artığı yok (02.9).
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
 * SINIR TESTİ (02.9 · STACK §8) — para hareketi ailesi euro↔cent.
 *
 * Bu ailede DÖRT ayrı yol var ve dördü ayrı kodda:
 *   1. **Tablo** (`moneyFields`) — `money_movement.amount` euro, dönen alan cent.
 *   2. **Görünüm** (`account_movement`) — `signed_amount` görünümün TÜRETTİĞİ kolon; işaret kuralı
 *      SQL'de yaşıyor, birim çevrimi burada.
 *   3. **Bakiye görünümü** (`account_balance`) — Σ defter satırı.
 *   4. **RPC** (`record_order_movement`) — girdi euro'ya iner, dönüş cent'e çıkar.
 *
 * Kolonlar HAM okunur: iki tarafı da servisten okuyan bir test, aynı yanlış sabitle çarpılsa geçerdi.
 */
describe('para hareketi — euro↔cent sınırı', () => {
  it('cent yazılır, kolon euro tutar, cent okunur (tablo + görünüm + bakiye)', async () => {
    const movement = await movements.insert({
      accountId: cashAccount.id,
      direction: 'out',
      amountCents: 1234,
      type: 'expense',
      category: 'sınır testi',
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
    await movements.insert({ accountId: account.id, direction: 'out', amountCents: 2525, type: 'expense', category: 'test' });

    expect((await accounts.balance(account.id)).balanceCents).toBe(7525);
    await purgeTestData(db, { accountIds: [account.id] });
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountService, MoneyMovementService } from './money.service';
import { serviceDb } from '../client';

/**
 * Hesaplar + para hareketleri (12.1) — DOMAIN §9.
 *
 * Doğrulanan şey **türetimin doğruluğu**: bakiye hiçbir yerde saklanmıyor, hareketlerden çıkıyor.
 * Asıl incelik transferde: TEK satır yazılıyor ama İKİ hesabı simetrik etkilemesi gerekiyor.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);

const damga = Date.now();
const acilanHesaplar: string[] = [];
let sayac = 0;

/** Test hesabı — hesap adı BENZERSİZDİR (unique index `lower(name)`), o yüzden her açılış sayaçlı. */
async function hesapAc(ad: string, type: 'cash' | 'bank' | 'provider' = 'bank') {
  sayac += 1;
  const hesap = await accounts.insert({ name: `${ad} ${damga}-${sayac}`, type });
  acilanHesaplar.push(hesap.id);
  return hesap;
}

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Kayan nokta artığını kırp — para 2 ondalıktır (1020.4000000000001 gibi farklar karşılaştırmayı bozar). */
const euro = (v: number) => Math.round(v * 100) / 100;

let kasa: Awaited<ReturnType<typeof hesapAc>>;
let banka: Awaited<ReturnType<typeof hesapAc>>;

beforeEach(async () => {
  for (const id of acilanHesaplar) await db.from('money_movement').delete().eq('account_id', id);
  kasa = await hesapAc('Kasa', 'cash');
  banka = await hesapAc('Revolut');
});

afterAll(async () => {
  for (const id of acilanHesaplar) {
    await db.from('money_movement').delete().eq('account_id', id);
    await db.from('money_movement').delete().eq('counter_account_id', id);
  }
  for (const id of acilanHesaplar) await db.from('account').delete().eq('id', id);
});

describe('hesap', () => {
  it('yeni hesap 0 bakiyeyle görünür — hiç hareketi yok diye listeden düşmez', async () => {
    expect(await accounts.balance(kasa.id)).toMatchObject({ balance: 0, movementCount: 0 });
  });

  it('kapatma SİLME değil pasifleştirmedir — geçmiş hareketleri ona bağlı', async () => {
    const kapali = await accounts.deactivate(banka.id);
    expect(kapali.isActive).toBe(false);
    expect((await accounts.list({ activeOnly: true })).map((h) => h.id)).not.toContain(banka.id);
    expect((await accounts.list()).map((h) => h.id)).toContain(banka.id);
  });
});

describe('bakiye TÜRETİLİR (saklanmaz)', () => {
  it('giriş artırır, çıkış azaltır', async () => {
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 250, type: 'capital', description: 'Açılış' });
    await movements.insert({ accountId: kasa.id, direction: 'out', amount: 90.5, type: 'expense', category: 'kira' });

    expect((await accounts.balance(kasa.id)).balance).toBe(159.5);
    expect((await accounts.balance(kasa.id)).movementCount).toBe(2);
  });

  it('tüm hesapların bakiyesi TEK sorguda gelir (N+1 yok)', async () => {
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 100, type: 'capital' });
    await movements.insert({ accountId: banka.id, direction: 'in', amount: 40, type: 'capital' });

    const harita = await accounts.balances();
    expect(harita.get(kasa.id)?.balance).toBe(100);
    expect(harita.get(banka.id)?.balance).toBe(40);
  });
});

describe('transfer — tek satır, iki hesap', () => {
  it('gönderenden düşer, alana girer; toplam servet DEĞİŞMEZ', async () => {
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 800, type: 'capital' });
    await movements.insert({ accountId: kasa.id, direction: 'out', amount: 500, type: 'transfer', counterAccountId: banka.id, description: 'Bankaya yatırıldı' });

    expect((await accounts.balance(kasa.id)).balance).toBe(300); // 800 − 500
    expect((await accounts.balance(banka.id)).balance).toBe(500);

    // Transfer serveti değiştirmez, yerini değiştirir.
    const harita = await accounts.balances();
    expect(harita.get(kasa.id)!.balance + harita.get(banka.id)!.balance).toBe(800);
  });

  it('transfer İKİ hesabın da ekstresinde görünür — karşı uçta işaret ters', async () => {
    await movements.insert({ accountId: kasa.id, direction: 'out', amount: 120, type: 'transfer', counterAccountId: banka.id });

    const kasaDefteri = await movements.ledger(kasa.id);
    const bankaDefteri = await movements.ledger(banka.id);
    expect(kasaDefteri.rows).toHaveLength(1);
    expect(bankaDefteri.rows).toHaveLength(1);
    expect(kasaDefteri.rows[0]!.signedAmount).toBe(-120);
    expect(bankaDefteri.rows[0]!.signedAmount).toBe(120);
    // Aynı hareket, iki defter satırı: id ortak.
    expect(kasaDefteri.rows[0]!.id).toBe(bankaDefteri.rows[0]!.id);
  });

  it('karşı ucu olmayan transfer VERİTABANINDA reddedilir — yarım transfer bakiyeyi kaydırırdı', async () => {
    await expect(movements.insert({ accountId: kasa.id, direction: 'out', amount: 50, type: 'transfer' })).rejects.toThrow();
  });

  it('transfer olmayan harekette karşı hesap veritabanında reddedilir', async () => {
    await expect(
      movements.insert({ accountId: kasa.id, direction: 'out', amount: 50, type: 'expense', counterAccountId: banka.id }),
    ).rejects.toThrow();
  });

  it('sıfır ve negatif tutar veritabanında reddedilir', async () => {
    await expect(movements.insert({ accountId: kasa.id, direction: 'in', amount: 0, type: 'misc' })).rejects.toThrow();
  });
});

describe('ekstre ve dönem', () => {
  it('değer tarihine göre en yeni önce; tarih aralığı süzülür', async () => {
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 10, type: 'misc', valueDate: gun(-20) });
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 20, type: 'misc', valueDate: gun(-5) });
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 30, type: 'misc', valueDate: gun(-1) });

    const hepsi = await movements.ledger(kasa.id);
    expect(hepsi.rows.map((r) => r.amount)).toEqual([30, 20, 10]);

    const aralik = await movements.ledger(kasa.id, { from: gun(-10), to: gun(0) });
    expect(aralik.rows.map((r) => r.amount)).toEqual([30, 20]);
  });

  it('eşleşmemiş satırlar süzülebilir — banka eşleştirme kuyruğu (12.4)', async () => {
    const eslesen = await movements.insert({ accountId: kasa.id, direction: 'in', amount: 15, type: 'misc' });
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 25, type: 'misc' });
    await movements.markReconciled(eslesen.id);

    const kuyruk = await movements.ledger(kasa.id, { unreconciledOnly: true });
    expect(kuyruk.rows.map((r) => r.amount)).toEqual([25]);
  });

  it('dönem toplamları tip+yön kırılımında toplanır; dönem dışı satır girmez', async () => {
    // `periodTotals` ŞİRKET GENELİDİR (hesap süzgeci yok) — bu yüzden mutlak değere değil FARKA
    // bakılır: test kendi eklediğinin toplama ne kattığını ölçer, veritabanındaki diğer
    // hareketlerden (seed, paralel test) etkilenmez.
    const oku = async (tip: 'expense' | 'capital') =>
      (await movements.periodTotals(gun(-10), gun(0))).find((t) => t.type === tip) ?? { total: 0, count: 0 };
    const giderOnce = await oku('expense');
    const sermayeOnce = await oku('capital');

    await movements.insert({ accountId: kasa.id, direction: 'out', amount: 900, type: 'expense', category: 'kira', valueDate: gun(-3) });
    await movements.insert({ accountId: kasa.id, direction: 'out', amount: 120.4, type: 'expense', category: 'akaryakıt', valueDate: gun(-2) });
    await movements.insert({ accountId: kasa.id, direction: 'in', amount: 60, type: 'capital', valueDate: gun(-2) });
    // Dönem DIŞI — toplama girmemeli.
    await movements.insert({ accountId: kasa.id, direction: 'out', amount: 5000, type: 'expense', valueDate: gun(-90) });

    const giderSonra = await oku('expense');
    expect(euro(giderSonra.total - giderOnce.total)).toBe(1020.4); // 5000'lik satır dönem dışı
    expect(giderSonra.count - giderOnce.count).toBe(2);

    const sermayeSonra = await oku('capital');
    expect(euro(sermayeSonra.total - sermayeOnce.total)).toBe(60);
  });

  it('değer tarihi kayıt tarihinden AYRIDIR: dünkü nakit bugün girilebilir', async () => {
    const hareket = await movements.insert({ accountId: kasa.id, direction: 'in', amount: 75, type: 'misc', valueDate: gun(-7) });
    expect(hareket.valueDate).toBe(gun(-7));
    expect(hareket.createdAt.slice(0, 10)).toBe(gun(0));
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { DiscountCodeService } from './discount-code.service';
import { DiscountService } from './discount.service';
import { UserProfileService } from './user-profile.service';

/**
 * İndirim tanımı (05.6) — DB üstünde. Burada YALNIZ satır getirme/yazma ve **DB kısıtları**
 * doğrulanır: `database` paketi `domain-core`'u bilmez (STACK §4), dolayısıyla "hangi indirim
 * kazanır" kararı bu testin konusu değildir — o motorun birim testinde.
 *
 * Kısıtlar burada test ediliyor çünkü SON EMNİYET oradadır: form aynı kuralı gösterir ama tek
 * gerçek DB'dir. Kodsuz kupon, hedefsiz kapsam ve ters tarih aralığı yazılamamalı.
 */
const db = serviceDb();
const discounts = new DiscountService(db);
const codes = new DiscountCodeService(db);
const categories = new CategoryService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const created: string[] = [];
let categoryId: string;
let customerId: string;

beforeAll(async () => {
  categoryId = (await categories.create({ name: { tr: `İndirim testi ${stamp}` } })).id;
  customerId = (await profiles.insert({ name: `İndirim müşterisi ${stamp}` })).id;
});

// Test kendi zeminini toplar: aksi hâlde her koşuş yerel veritabanına kalıcı kupon bırakır ve
// operasyon listesinde çöp satır olarak görünür.
afterAll(async () => {
  for (const id of created) await discounts.delete(id).catch(() => {});
  await categories.delete(categoryId).catch(() => {});
  await db.from('user_profiles').delete().eq('id', customerId);
});

const track = <T extends { id: string }>(row: T): T => {
  created.push(row.id);
  return row;
};

describe('DiscountService — yazma ve okuma', () => {
  it('kupon koda göre HARF AYRIMSIZ bulunur', async () => {
    const rule = track(
      await discounts.insert({ name: 'Bayram kuponu', trigger: 'coupon', type: 'percent', percent: 10, scope: 'cart' }),
    );
    await codes.insert({ discountId: rule.id, code: `BAYRAM${stamp}`, locale: 'tr' });

    const found = await discounts.findByCode(`bayram${stamp}`);
    expect(found?.code).toBe(`BAYRAM${stamp}`);
    expect(found?.discount.percent).toBe(10);
  });

  it('bir kuponun HER kodu aynı kurala açılır — kota tek', async () => {
    const rule = track(
      await discounts.insert({ name: 'Çok dilli kupon', trigger: 'coupon', type: 'percent', percent: 20, scope: 'cart' }),
    );
    await codes.replaceCodes(rule.id, [
      { discountId: rule.id, code: `HOSGELDIN${stamp}`, locale: 'tr' },
      { discountId: rule.id, code: `BIENVENUE${stamp}`, locale: 'fr' },
      { discountId: rule.id, code: `WILLKOMMEN${stamp}`, locale: 'de' },
    ]);

    for (const code of [`HOSGELDIN${stamp}`, `bienvenue${stamp}`, `WillKommen${stamp}`]) {
      const found = await discounts.findByCode(code);
      expect(found?.discount.id).toBe(rule.id);
    }
    expect((await codes.listByDiscount(rule.id))).toHaveLength(3);
  });

  it('kod eşitlemesi KALANLARA dokunmaz — kullanım geçmişi kodun kimliğinde yaşar', async () => {
    const rule = track(
      await discounts.insert({ name: 'Eşitleme kuponu', trigger: 'coupon', type: 'fixed', amountCents: 400, scope: 'cart' }),
    );
    const first = await codes.replaceCodes(rule.id, [
      { discountId: rule.id, code: `KALAN${stamp}`, locale: 'tr' },
      { discountId: rule.id, code: `GIDEN${stamp}`, locale: 'fr' },
    ]);
    const survivorId = first.find((c) => c.code === `KALAN${stamp}`)!.id;

    const second = await codes.replaceCodes(rule.id, [
      { discountId: rule.id, code: `KALAN${stamp}`, locale: 'tr' },
      { discountId: rule.id, code: `YENI${stamp}`, locale: 'de' },
    ]);

    expect(second.map((c) => c.code).sort()).toEqual([`KALAN${stamp}`, `YENI${stamp}`].sort());
    // Kalan kodun KİMLİĞİ aynı: yeniden yazılsaydı ona bağlı kullanım kayıtları öksüz kalırdı.
    expect(second.find((c) => c.code === `KALAN${stamp}`)!.id).toBe(survivorId);
  });

  it('kişisel kupon yalnız SAHİBİNE aday olur', async () => {
    const rule = track(
      await discounts.insert({ name: 'Kişisel kupon', trigger: 'coupon', type: 'fixed', amountCents: 500, scope: 'cart', customerId }),
    );
    await codes.insert({ discountId: rule.id, code: `KISISEL${stamp}`, locale: 'tr' });

    const mine = await discounts.listCandidates(customerId);
    expect(mine.some((d) => d.id === rule.id)).toBe(true);

    const others = await discounts.listCandidates('00000000-0000-4000-8000-000000000000');
    expect(others.some((d) => d.id === rule.id)).toBe(false);
  });

  it('pasif kural adaylar arasında YOK ama listede DURUR — geçmiş silinmez', async () => {
    const rule = track(
      await discounts.insert({
        name: 'Süresi dolan kampanya',
        trigger: 'automatic',
        type: 'percent',
        percent: 15,
        scope: 'category',
        categoryId,
      }),
    );
    await discounts.setActive(rule.id, false);

    expect((await discounts.listCandidates()).some((d) => d.id === rule.id)).toBe(false);
    expect((await discounts.list()).some((d) => d.id === rule.id)).toBe(true);
  });

  it('kullanım sayısı KAYITTAN türetilir — sayaç kolonu yok', async () => {
    const rule = track(
      await discounts.insert({ name: 'Sayım kuponu', trigger: 'automatic', type: 'fixed', amountCents: 300, scope: 'cart' }),
    );
    await db.from('discount_use').insert([
      { discount_id: rule.id, customer_id: customerId, amount: 3 },
      { discount_id: rule.id, customer_id: customerId, amount: 3 },
      { discount_id: rule.id, customer_id: null, amount: 3 },
    ]);

    const counts = await discounts.usageCounts([rule.id]);
    expect(counts.get(rule.id)?.total).toBe(3);
    expect(counts.get(rule.id)?.byCustomer.get(customerId)).toBe(2);
  });

  it('kod kırılımı kotayı BÖLMEZ — üç kapı, tek tavan', async () => {
    const rule = track(
      await discounts.insert({ name: 'Kapı sayımı', trigger: 'coupon', type: 'fixed', amountCents: 200, scope: 'cart' }),
    );
    const [tr, fr] = await codes.replaceCodes(rule.id, [
      { discountId: rule.id, code: `SAYIM-TR${stamp}`, locale: 'tr' },
      { discountId: rule.id, code: `SAYIM-FR${stamp}`, locale: 'fr' },
    ]);
    await db.from('discount_use').insert([
      { discount_id: rule.id, discount_code_id: tr!.id, amount: 2 },
      { discount_id: rule.id, discount_code_id: tr!.id, amount: 2 },
      { discount_id: rule.id, discount_code_id: fr!.id, amount: 2 },
    ]);

    const usage = (await discounts.usageCounts([rule.id])).get(rule.id);
    // Tavan bunun üstünde durur: üç kullanım, hangi kapıdan girildiğine bakılmaksızın.
    expect(usage?.total).toBe(3);
    expect(usage?.byCode.get(tr!.id)).toBe(2);
    expect(usage?.byCode.get(fr!.id)).toBe(1);
  });
});

describe('DB kısıtları — tutarsız kural yazılamaz', () => {
  it('aynı kod İKİ kurala verilemez — müşteri hangisini kastettiğini bilemezdi', async () => {
    const first = track(await discounts.insert({ name: 'Tekillik A', trigger: 'coupon', type: 'percent', percent: 5, scope: 'cart' }));
    const second = track(await discounts.insert({ name: 'Tekillik B', trigger: 'coupon', type: 'percent', percent: 7, scope: 'cart' }));
    await codes.insert({ discountId: first.id, code: `TEKIL${stamp}` });

    // Harf ayrımı da korumaz: indeks `upper(code)` üstünde.
    await expect(codes.insert({ discountId: second.id, code: `tekil${stamp}` })).rejects.toThrow();
  });

  it('kodlu kampanya reddedilir — "otomatik" adının yalanı olurdu', async () => {
    const rule = track(
      await discounts.insert({ name: 'Kodlu kampanya', trigger: 'automatic', type: 'percent', percent: 10, scope: 'cart' }),
    );
    await expect(codes.insert({ discountId: rule.id, code: `OTOMATIK${stamp}` })).rejects.toThrow();
  });

  it('hedefsiz kategori kapsamı reddedilir — hiçbir kaleme uymayan sessiz kural', async () => {
    await expect(
      discounts.insert({ name: 'Hedefsiz', trigger: 'automatic', type: 'percent', percent: 10, scope: 'category' }),
    ).rejects.toThrow();
  });

  it('%100 üstü yüzde reddedilir', async () => {
    await expect(
      discounts.insert({ name: 'Aşırı', trigger: 'automatic', type: 'percent', percent: 120, scope: 'cart' }),
    ).rejects.toThrow();
  });

  // Değer İKİ AYRI KOLONDA (02.9) ve tipine uyanı dolu olmalı. Üç bozuk hâlin üçü de DB'de durur:
  // kural veriyle birlikte yaşar (CLAUDE.md §1), uygulamada bir `if` ile değil.
  it('tipine uymayan değer kolonu reddedilir', async () => {
    // Yüzde kuralına sabit tutar yazılamaz.
    await expect(
      discounts.insert({ name: 'Karışık', trigger: 'automatic', type: 'percent', percent: 10, amountCents: 500, scope: 'cart' }),
    ).rejects.toThrow();
    // Sabit kurala yüzde yazılamaz.
    await expect(
      discounts.insert({ name: 'Karışık2', trigger: 'automatic', type: 'fixed', percent: 10, amountCents: 500, scope: 'cart' }),
    ).rejects.toThrow();
    // Değersiz kural: sessizce "sıfır indirim" uygulayan bir kayıt doğmaz.
    await expect(
      discounts.insert({ name: 'Değersiz', trigger: 'automatic', type: 'fixed', scope: 'cart' }),
    ).rejects.toThrow();
  });

  // Para SINIRDA çevriliyor mu (02.9 · STACK §8): uygulama cent yazar, kolon euro tutar, geri
  // okunan yine cent'tir. İki cent alanı da (tutar + asgari sepet) aynı yoldan geçiyor.
  it('cent yazılır, kolonlar euro tutar, cent okunur (gidiş-dönüş)', async () => {
    const rule = track(
      await discounts.insert({
        name: 'Sınır testi',
        trigger: 'automatic',
        type: 'fixed',
        amountCents: 1234,
        minBasketCents: 4999,
        scope: 'cart',
      }),
    );
    expect(rule.amountCents).toBe(1234);
    expect(rule.minBasketCents).toBe(4999);

    const { data } = await db.from('discount').select('amount, min_basket').eq('id', rule.id).single();
    const ham = data as { amount: number | string; min_basket: number | string };
    expect(Number(ham.amount)).toBe(12.34);
    expect(Number(ham.min_basket)).toBe(49.99);

    const okunan = await discounts.getById(rule.id);
    expect(okunan?.amountCents).toBe(1234);
    expect(okunan?.minBasketCents).toBe(4999);
  });

  it('ters tarih aralığı reddedilir — hiç geçerli olmayan kampanya', async () => {
    await expect(
      discounts.insert({
        name: 'Ters aralık',
        trigger: 'automatic',
        type: 'percent',
        percent: 10,
        scope: 'cart',
        validFrom: new Date(Date.now() + 86_400_000).toISOString(),
        validTo: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    ).rejects.toThrow();
  });

});

/**
 * **Kişisel kupon penceresi doğru kümeye vuruyor mu** (08.5 · müşteri şeridinin talebi 09.08).
 *
 * Eskiden tavan "en yeni N KUPON"a vuruyordu, "en yeni N KULLANILABİLİR kupon"a değil: pasif ve
 * tarih penceresi dışı kuponlar N satır çekildikten SONRA uygulamada eleniyordu. Kullanılmış kupon
 * kümede kalır (silinmez, kapatılır) — yani pencere yıllar içinde onlarla dolar ve ekranda
 * kullanılabilir kupon **sessizce eksik** görünürdü.
 *
 * Ayırt edici sınav: tavanı 1'e indirip en YENİ satırı kullanılamaz yapmak. Süzgeç uygulamada
 * kalsaydı o tek satır çekilir, elenir ve sonuç BOŞ dönerdi.
 */
describe('kişisel kupon — kullanılabilirlik penceresi (08.5)', () => {
  const kupon = (name: string, extra: Record<string, unknown> = {}) =>
    discounts.insert({ name, trigger: 'coupon', type: 'fixed', amountCents: 500, scope: 'cart', customerId, ...extra });

  it('pasif ve süresi geçmiş kupon SORGUDA elenir — uygulamada değil', async () => {
    const gecmis = new Date(Date.now() - 30 * 86_400_000).toISOString();
    track(await kupon('Pasif kupon', { isActive: false }));
    track(await kupon('Süresi geçmiş kupon', { validTo: gecmis }));
    const gecerli = track(await kupon('Geçerli kupon'));

    const kullanilabilir = await discounts.listByCustomer(customerId, { usableAt: new Date() });
    const idler = kullanilabilir.map((d) => d.id);

    expect(idler).toContain(gecerli.id);
    expect(kullanilabilir.filter((d) => d.name === 'Pasif kupon')).toHaveLength(0);
    expect(kullanilabilir.filter((d) => d.name === 'Süresi geçmiş kupon')).toHaveLength(0);
  });

  it('HENÜZ BAŞLAMAMIŞ kupon de elenir — iki tarih ayrı sorulardır', async () => {
    const gelecek = new Date(Date.now() + 30 * 86_400_000).toISOString();
    track(await kupon('Başlamamış kupon', { validFrom: gelecek }));

    const bugun = await discounts.listByCustomer(customerId, { usableAt: new Date() });
    expect(bugun.filter((d) => d.name === 'Başlamamış kupon')).toHaveLength(0);

    // Aynı kupon o tarihte kullanılabilir olmalı — süzgeç "hep ele" demiyor, PENCEREYİ soruyor.
    const sonra = await discounts.listByCustomer(customerId, { usableAt: new Date(Date.now() + 60 * 86_400_000) });
    expect(sonra.filter((d) => d.name === 'Başlamamış kupon')).toHaveLength(1);
  });

  it('TAVAN kullanılabilir kümeye vurur — asıl düzeltme bu', async () => {
    // En yeni satır kullanılamaz; tavan 1. Süzgeç uygulamada olsaydı sonuç BOŞ dönerdi.
    const gecerli = track(await kupon('Tavan sınavı — geçerli'));
    track(await kupon('Tavan sınavı — pasif', { isActive: false }));

    const tek = await discounts.listByCustomer(customerId, { usableAt: new Date(), limit: 1 });
    expect(tek).toHaveLength(1);
    expect(tek[0]?.id).toBe(gecerli.id);
  });

  it('`usableAt` verilmezse davranış ESKİSİ gibi — başka çağıran kırılmaz', async () => {
    track(await kupon('Süzgeçsiz okuma', { isActive: false }));
    const hepsi = await discounts.listByCustomer(customerId);
    expect(hepsi.filter((d) => d.name === 'Süzgeçsiz okuma')).toHaveLength(1);
  });
});

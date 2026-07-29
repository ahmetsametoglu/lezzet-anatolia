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
      await discounts.insert({ name: 'Bayram kuponu', trigger: 'coupon', type: 'percent', value: 10, scope: 'cart' }),
    );
    await codes.insert({ discountId: rule.id, code: `BAYRAM${stamp}`, locale: 'tr' });

    const found = await discounts.findByCode(`bayram${stamp}`);
    expect(found?.code).toBe(`BAYRAM${stamp}`);
    expect(found?.discount.value).toBe(10);
  });

  it('bir kuponun HER kodu aynı kurala açılır — kota tek', async () => {
    const rule = track(
      await discounts.insert({ name: 'Çok dilli kupon', trigger: 'coupon', type: 'percent', value: 20, scope: 'cart' }),
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
      await discounts.insert({ name: 'Eşitleme kuponu', trigger: 'coupon', type: 'fixed', value: 4, scope: 'cart' }),
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
      await discounts.insert({ name: 'Kişisel kupon', trigger: 'coupon', type: 'fixed', value: 5, scope: 'cart', customerId }),
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
        value: 15,
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
      await discounts.insert({ name: 'Sayım kuponu', trigger: 'automatic', type: 'fixed', value: 3, scope: 'cart' }),
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
      await discounts.insert({ name: 'Kapı sayımı', trigger: 'coupon', type: 'fixed', value: 2, scope: 'cart' }),
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
    const first = track(await discounts.insert({ name: 'Tekillik A', trigger: 'coupon', type: 'percent', value: 5, scope: 'cart' }));
    const second = track(await discounts.insert({ name: 'Tekillik B', trigger: 'coupon', type: 'percent', value: 7, scope: 'cart' }));
    await codes.insert({ discountId: first.id, code: `TEKIL${stamp}` });

    // Harf ayrımı da korumaz: indeks `upper(code)` üstünde.
    await expect(codes.insert({ discountId: second.id, code: `tekil${stamp}` })).rejects.toThrow();
  });

  it('kodlu kampanya reddedilir — "otomatik" adının yalanı olurdu', async () => {
    const rule = track(
      await discounts.insert({ name: 'Kodlu kampanya', trigger: 'automatic', type: 'percent', value: 10, scope: 'cart' }),
    );
    await expect(codes.insert({ discountId: rule.id, code: `OTOMATIK${stamp}` })).rejects.toThrow();
  });

  it('hedefsiz kategori kapsamı reddedilir — hiçbir kaleme uymayan sessiz kural', async () => {
    await expect(
      discounts.insert({ name: 'Hedefsiz', trigger: 'automatic', type: 'percent', value: 10, scope: 'category' }),
    ).rejects.toThrow();
  });

  it('%100 üstü yüzde reddedilir', async () => {
    await expect(
      discounts.insert({ name: 'Aşırı', trigger: 'automatic', type: 'percent', value: 120, scope: 'cart' }),
    ).rejects.toThrow();
  });

  it('ters tarih aralığı reddedilir — hiç geçerli olmayan kampanya', async () => {
    await expect(
      discounts.insert({
        name: 'Ters aralık',
        trigger: 'automatic',
        type: 'percent',
        value: 10,
        scope: 'cart',
        validFrom: new Date(Date.now() + 86_400_000).toISOString(),
        validTo: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    ).rejects.toThrow();
  });

});

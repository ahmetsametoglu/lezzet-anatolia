import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
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
    track(
      await discounts.insert({
        name: 'Bayram kuponu',
        trigger: 'coupon',
        code: `BAYRAM${stamp}`,
        type: 'percent',
        value: 10,
        scope: 'cart',
      }),
    );

    const found = await discounts.findByCode(`bayram${stamp}`);
    expect(found?.code).toBe(`BAYRAM${stamp}`);
    expect(found?.value).toBe(10);
  });

  it('kişisel kupon yalnız SAHİBİNE aday olur', async () => {
    track(
      await discounts.insert({
        name: 'Kişisel kupon',
        trigger: 'coupon',
        code: `KISISEL${stamp}`,
        type: 'fixed',
        value: 5,
        scope: 'cart',
        customerId,
      }),
    );

    const mine = await discounts.listCandidates(customerId);
    expect(mine.some((d) => d.code === `KISISEL${stamp}`)).toBe(true);

    const others = await discounts.listCandidates('00000000-0000-4000-8000-000000000000');
    expect(others.some((d) => d.code === `KISISEL${stamp}`)).toBe(false);
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
});

describe('DB kısıtları — tutarsız kural yazılamaz', () => {
  it('kodsuz kupon reddedilir', async () => {
    await expect(
      discounts.insert({ name: 'Kodsuz', trigger: 'coupon', type: 'percent', value: 10, scope: 'cart' }),
    ).rejects.toThrow();
  });

  it('kodlu kampanya reddedilir — "otomatik" adının yalanı olurdu', async () => {
    await expect(
      discounts.insert({ name: 'Kodlu kampanya', trigger: 'automatic', code: 'X', type: 'percent', value: 10, scope: 'cart' }),
    ).rejects.toThrow();
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

  it('aynı kod iki kez yazılamaz — harf farkı da kurtarmaz', async () => {
    track(
      await discounts.insert({
        name: 'Tekil kod',
        trigger: 'coupon',
        code: `TEKIL${stamp}`,
        type: 'percent',
        value: 10,
        scope: 'cart',
      }),
    );
    await expect(
      discounts.insert({
        name: 'Aynı kod küçük harf',
        trigger: 'coupon',
        code: `tekil${stamp}`,
        type: 'percent',
        value: 10,
        scope: 'cart',
      }),
    ).rejects.toThrow();
  });
});

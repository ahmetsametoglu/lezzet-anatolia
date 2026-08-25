import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse } from '@lezzet/database/testing';
import { CategoryService, ProductService } from '@lezzet/database';
import { resolveCheckoutPayment } from './checkout-options';

/**
 * Checkout ödeme seçenekleri (07.3) — motor + ayar + müşteri kartı birlikte. "Hangi yöntem açık"
 * kararı motorun birim testinde (`domain-core/payment`); burada **gerçek ayarların ve müşteri
 * kartının okunduğu**, açık bakiyenin siparişlerden TÜRETİLDİĞİ doğrulanır.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const orders = new OrderService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let creditCustomerId: string;
let businessCustomerId: string;
let pendingBusinessId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const LINES = [{ totalCents: 4000, vatRate: 5.5 }];

/**
 * Kapının girdisi İKİ tutar taşıyor (11.08 · mobil şeridin ölçümü): `basketCents` indirim SONRASI
 * (kargo, bedava kargo eşiği, tahsil edilecek toplam), `subtotalCents` indirim ÖNCESİ (yalnız
 * asgari sepet eşiği). Bu dosyadaki senaryoların çoğunda indirim YOK, yani ikisi eşit — yardımcı
 * o hâli kısaltıyor. **Varsayılan testte, kapıda DEĞİL:** kapıda `subtotalCents` zorunlu, çünkü
 * unutulduğunda düzeltmeye çalıştığımız arıza sessizce geri gelirdi.
 */
type OdemeGirdisi = Parameters<typeof resolveCheckoutPayment>[0];
const odemeCozumle = (input: Omit<OdemeGirdisi, 'subtotalCents'> & { subtotalCents?: number }) =>
  resolveCheckoutPayment({ subtotalCents: input.basketCents, ...input });

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Checkout testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Baklava ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const customer = await profiles.insert({ name: `Peşin müşteri ${stamp}` });
  customerId = customer.id;
  const vadeli = await profiles.insert({ name: `Vadeli müşteri ${stamp}`, creditEnabled: true, creditLimitCents: 10000 });
  creditCustomerId = vadeli.id;
  // ONAYLI işletme: havale/çek kapısının açılması için şirket olmak YETMEZ, başvurunun onaylanmış
  // olması gerekir — onaysız şirket kaydı zaten perakende fiyat görüyor.
  const isletme = await profiles.insert({ name: `İşletme ${stamp}`, type: 'company', b2bApproved: true });
  businessCustomerId = isletme.id;
  const isletmeOnaysiz = await profiles.insert({ name: `Onaysız işletme ${stamp}`, type: 'company' });
  pendingBusinessId = isletmeOnaysiz.id;
  createdProfiles.push(customer.id, vadeli.id, isletme.id, isletmeOnaysiz.id);
  SettingsService.invalidate();
});

afterAll(async () => {
  await db.from('order').delete().in('customer_id', createdProfiles);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
  SettingsService.invalidate();
});

describe('kargo ücreti ve KDV (07.3)', () => {
  it('rota içi teslimat ücretsiz; toplam sepetin kendisidir', async () => {
    const r = await odemeCozumle({ customerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r).toMatchObject({ shippingFeeCents: 0, shippingFreeReason: 'route', orderTotalCents: 4000 });
    expect(r.shippingVat).toEqual([]);
  });

  it('kargoda eşik altı sipariş ücret öder ve ücret toplama eklenir', async () => {
    const r = await odemeCozumle({ customerId, deliveryType: 'shipping', basketCents: 4000, lines: LINES });
    // Ayar varsayılanı 19.08'de piyasadan ölçüldü (05.30): ücret 7,90 → **11,90 €**, eşik 60 → **100 €**.
    expect(r.shippingFeeCents).toBe(1190);
    expect(r.orderTotalCents).toBe(5190);
    expect(r.remainingForFreeShippingCents).toBe(6000);
    expect(r.shippingVat).toEqual([{ vatRate: 5.5, amountCents: 1190, vatCents: 62 }]);
  });

  it('eşik üstü kargo bedava', async () => {
    // Sepet eşiğin (100 €) ÜSTÜNDE olmalı — eski 80 € artık eşiğin altında kalıyordu.
    const r = await odemeCozumle({ customerId, deliveryType: 'shipping', basketCents: 12000, lines: [{ totalCents: 12000, vatRate: 5.5 }] });
    expect(r).toMatchObject({ shippingFeeCents: 0, shippingFreeReason: 'threshold' });
  });

  it('ücret ayardan okunur — değiştirince hesap değişir', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('shipping_fee_cents', 1200);
    try {
      const r = await odemeCozumle({ customerId, deliveryType: 'shipping', basketCents: 4000, lines: LINES });
      expect(r.shippingFeeCents).toBe(1200);
    } finally {
      await settings.restore();
    }
  });
});

describe('ödeme yöntemleri', () => {
  // `customerId` BİREYSEL bir müşteri: havale ve çek ona kapalı (kullanıcı kararı 04.08). Beklenti
  // 05.08'de değişti — eskiden `bank_transfer` misafire bile açıktı, yani ödeme alınmadan hazırlığa
  // geçilebiliyordu ve tahsilat riski tümüyle bizdeydi.
  it('rota içi + tavan altı → kapıda ödeme açık (bireysel: havale/çek yok)', async () => {
    const r = await odemeCozumle({ customerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.methods).toEqual(['online', 'cash', 'card']);
    expect(r.codBlockedReason).toBeNull();
  });

  it('kargoda kapıda ödeme yok — bireysel müşteriye YALNIZ kart kalır', async () => {
    const r = await odemeCozumle({ customerId, deliveryType: 'shipping', basketCents: 4000, lines: LINES });
    expect(r.methods).toEqual(['online']);
    expect(r.codBlockedReason).toBe('shipping');
  });

  it('ONAYLI işletmede havale ve çek açılır', async () => {
    const r = await odemeCozumle({ customerId: businessCustomerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.methods).toEqual(['online', 'bank_transfer', 'cash', 'card', 'cheque']);
  });

  it('ONAYSIZ şirket kaydına havale AÇILMAZ — yoksa kapı kendi kendini onaylardı', async () => {
    // "Şirketim" yazan herkes ödemeden sipariş açabilseydi onay sürecinin bir anlamı kalmazdı.
    const r = await odemeCozumle({ customerId: pendingBusinessId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.methods).not.toContain('bank_transfer');
    expect(r.methods).not.toContain('cheque');
  });

  it('tavan aşan sipariş kapıda ödemeyi kapatır (ayardan okunur)', async () => {
    const r = await odemeCozumle({ customerId, deliveryType: 'route', basketCents: 40_000, lines: [{ totalCents: 40_000, vatRate: 5.5 }] });
    expect(r.codBlockedReason).toBe('over_limit');
  });

  it('nakit yasal sınırı UYARIR ama engellemez', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('cod_max_cents', 200_000);
    try {
      const r = await odemeCozumle({ customerId, deliveryType: 'route', basketCents: 120_000, lines: [{ totalCents: 120_000, vatRate: 5.5 }] });
      expect(r.cashWarning).toBe(true);
      expect(r.methods).toContain('cash');
    } finally {
      await settings.restore();
    }
  });
});

describe('vade freni — açık bakiye TÜRETİLİR', () => {
  it('vade yetkisi olmayan müşteride "hesaba" kapalı', async () => {
    const r = await odemeCozumle({ customerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r).toMatchObject({ creditAvailable: false, creditBlockedReason: 'not_enabled' });
  });

  it('limit içinde vade OTOMATİK açılır', async () => {
    const r = await odemeCozumle({ customerId: creditCustomerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.creditAvailable).toBe(true);
    expect(r.creditBlockedReason).toBeNull();
  });

  it('ödenmemiş vadeli sipariş açık bakiyeye girer; limit aşımı admin onayına düşer', async () => {
    // 80 € ödenmemiş vadeli sipariş + 40 € yeni sipariş = 120 € > 100 € limit
    await orders.create(
      { warehouseId, customerId: creditCustomerId, channel: 'b2b', onAccount: true, totalCents: 8000 },
      [{ variantId, qty: 1, unitPriceCents: 8000, vatRate: 5.5 }],
    );

    const r = await odemeCozumle({ customerId: creditCustomerId, deliveryType: 'route', basketCents: 4000, lines: LINES });
    expect(r.creditAvailable).toBe(false);
    expect(r.creditBlockedReason).toBe('limit_exceeded');
    expect(r.creditRequiresApproval).toBe(true); // reddedilmez, admin'e düşer
  });

  it('iptal edilen vadeli sipariş açık bakiyeye SAYILMAZ', async () => {
    const { order } = await orders.create(
      { warehouseId, customerId: creditCustomerId, channel: 'b2b', onAccount: true, totalCents: 50_000, status: 'cancelled' },
      [{ variantId, qty: 1, unitPriceCents: 50_000, vatRate: 5.5 }],
    );
    expect(order.status).toBe('cancelled');

    // Yukarıdaki 80 € hâlâ açık; iptal edilen 500 € eklenmediği için sebep hâlâ limit aşımı,
    // "gecikme" değil ve bakiye patlamış görünmüyor.
    const r = await odemeCozumle({ customerId: creditCustomerId, deliveryType: 'route', basketCents: 100, lines: [{ totalCents: 100, vatRate: 5.5 }] });
    expect(r.creditAvailable).toBe(true); // 80 + 1 = 81 € < 100 € limit
  });
});

describe('asgari sepet', () => {
  /**
   * **"Asgari YOK" hâli artık KURULMASI gereken bir hâl** (10.08 kural değişimi · düzeltildi 15.08).
   *
   * Test beş gün kırmızıydı ve kod haklıydı: kullanıcı kararıyla kapıya teslime **40 € lojistik
   * taban** geldi ve taban KÜRESEL satıra yazıldı (`0013_settings.sql`). O günden beri "asgari yok"
   * diye bir hâl kendiliğinden var olmuyor — testin varsayımı ortadan kalkmıştı, iddiası değil.
   *
   * Bu yüzden eşik sıfırlanıp geri konuyor, iddia aynen korunuyor. **Sıfıra çekmek bir varsayım
   * değil, snapshot'ın kendisi** (`settingsSnapshot`, CLAUDE §4b): önce okunur, sonra geri konur —
   * "boşa çek" deseydik küresel satırı bir gün yanlış değerde bırakırdık.
   */
  it('asgari yoksa her sepet geçer', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('min_basket_cents', 0);
    try {
      const r = await odemeCozumle({ customerId, deliveryType: 'route', basketCents: 100, lines: [{ totalCents: 100, vatRate: 5.5 }] });
      expect(r.minBasketOk).toBe(true);
    } finally {
      await settings.restore();
    }
  });

  it('asgari konursa eksik tutar bildirilir', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('min_basket_cents', 2500);
    try {
      const r = await odemeCozumle({ customerId, deliveryType: 'route', basketCents: 1500, lines: [{ totalCents: 1500, vatRate: 5.5 }] });
      expect(r).toMatchObject({ minBasketOk: false, missingForMinBasketCents: 1000 });
    } finally {
      await settings.restore();
    }
  });

  /**
   * **Eşik İNDİRİM ÖNCESİNE bakar** (kullanıcı kararı 11.08) — teslimatın ekonomisi taşınan malın
   * değerine bağlıdır, kampanya eşiği düşürmez.
   *
   * Bu iddia bir regresyon çivisi: kapı bir tur eşiği `basketCents`ten (indirim SONRASI) ölçüyordu
   * ve taslak kapısı aynı soruyu `subtotalCents`ten ölçüyordu. Sonucu sessiz bir çelişkiydi —
   * eşiğin sınırında sepet "tamam" derken ödeme adımı "eksik" diyebilirdi ve müşteri kasada
   * duvara çarpardı (mobil şeridin 11.08 ölçümü). Tek satır geri alınırsa bu test kırmızıya döner.
   */
  it('KAMPANYA eşiği düşürmez — eşik indirim ÖNCESİ tutarı ölçer', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('min_basket_cents', 2500);
    try {
      // Mal 26 €, kampanya 3 € indiriyor: tahsil edilecek 23 € ama taşınan mal 26 €.
      const r = await odemeCozumle({
        customerId,
        deliveryType: 'route',
        basketCents: 2300,
        subtotalCents: 2600,
        lines: [{ totalCents: 2300, vatRate: 5.5 }],
      });
      expect(r.minBasketOk).toBe(true);
      expect(r.missingForMinBasketCents).toBe(0);
      // Tahsil edilecek toplam yine İNDİRİM SONRASI — iki tutar iki ayrı soruya cevap veriyor.
      expect(r.orderTotalCents).toBe(2300);
    } finally {
      await settings.restore();
    }
  });
});

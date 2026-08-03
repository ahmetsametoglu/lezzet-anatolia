import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService,
  BundleService,
  CategoryService,
  DeliveryZoneService,
  DiscountCodeService,
  DiscountService,
  DiscountUseService,
  OrderService,
  PriceService,
  ProductService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { derivePaymentStatusForOrder } from '@lezzet/domain-core';
import { createCheckoutDraft } from './checkout-draft';

/**
 * Sepet → taslak sipariş (07.4'ün eksik halkası).
 *
 * Burada sınanan şey "sipariş yazıldı mı" değil — **istemciden gelen seçimlerin yeniden
 * doğrulandığı** ve **paketin doğru parçalandığı**. İkisi de sessizce yanlış olabilecek türden:
 * ekran doğru davrandığı sürece hata hiç görünmez, ama tarayıcı konsolundan gönderilen bir gün ya
 * da yanlış paylaştırılmış bir paket siparişi bozar.
 */
const db = serviceDb();
const stamp = Date.now();
/**
 * Test rota kodu — **önek 99, çünkü FR referansında 99 ile başlayan kod YOK** (ölçüldü: 0 satır;
 * boş önekler 96 · 97 · 99 · 00).
 *
 * Eskiden `67` önekliydi ve 19.17 ile bu bir TUZAĞA dönüştü: `createCheckoutDraft` artık rota
 * siparişinde "şehir bu kodun yerleşimlerinden biri mi" diye soruyor ve 67xxx aralığında 96 gerçek
 * kod var. Damga onlardan birine denk geldiği koşuda buradaki sabit "Strasbourg" şehri uymaz ve
 * dosya, kodunda hiçbir şey değişmeden düşerdi — yani ~%10 ihtimalle tekrarlanmayan bir hata.
 * Referansın tanımadığı kod gerçekçi de bir hâldir: kendi bölge tablomuz o kodlar için otoritedir
 * (19.16a) ve kapı ölçüm yokken engellemez.
 */
const rotaKodu = `99${String(stamp).slice(-3)}`;

let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let coldProductId: string;
let variantId: string;
let coldVariantId: string;
let bundleId: string;
let customerId: string;
let addressId: string;
let zoneId: string;
let authUserId: string;
const createdProfiles: string[] = [];

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Checkout testi ${stamp}` } });
  categoryId = category.id;

  const kargolanir = await new ProductService(db).create({
    name: { tr: `Baklava ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `CHK-B-${stamp}` }],
  });
  productId = kargolanir.product.id;
  variantId = kargolanir.variants[0]!.id;

  // Soğuk zincir: rota DIŞI adreste kargoya verilemez → sipariş açılamaz.
  const soguk = await new ProductService(db).create({
    name: { tr: `Künefe ${stamp}` },
    categoryId,
    vatRate: 5.5,
    shippable: false,
    variants: [{ label: { tr: '2 kişilik' }, sku: `CHK-K-${stamp}` }],
  });
  coldProductId = soguk.product.id;
  coldVariantId = soguk.variants[0]!.id;

  const prices = new PriceService(db);
  await prices.setPrice({ variantId, channel: 'b2c', amountCents: 2000 });
  await prices.setPrice({ variantId: coldVariantId, channel: 'b2c', amountCents: 1000 });

  // Stok ŞART: sepet okuması stoksuz satırı "tükendi" işaretler ve kapı onu daha teslimat adımına
  // varmadan reddeder — teslimat/ödeme doğrulamaları o zaman hiç sınanmazdı.
  const stocks = new StockService(db);
  const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await stocks.insert({ warehouseId, variantId, physicalQty: 50, expiryDate: gun(120), purchasePriceCents: 800 });
  await stocks.insert({ warehouseId, variantId: coldVariantId, physicalQty: 50, expiryDate: gun(30), purchasePriceCents: 400 });

  // Paket: iki kalem, payları BİLEREK katalog fiyatının altında — indirim tam da o farktır.
  const bundle = await new BundleService(db).create({
    name: { tr: `Test paketi ${stamp}` },
    totalPrice: 27,
    items: [
      { variantId, qty: 1, allocatedUnitPrice: 18 },
      { variantId: coldVariantId, qty: 1, allocatedUnitPrice: 9 },
    ],
  });
  bundleId = bundle.bundle.id;

  // Gerçek bir auth kullanıcısı: `user_profiles.auth_user_id` ona yabancı anahtarla bağlı ve kapı
  // müşteriyi OTURUMDAN çözüyor — uydurma bir kimlikle o yol hiç sınanmazdı.
  //
  // Profili BURADA AÇMIYORUZ: auth kullanıcısı doğunca tetikleyici (04.4) `user_profiles` satırını
  // kendisi kuruyor. İkinci bir insert benzersizlik kısıtına takılır — testin gerçek akışı taklit
  // etmesi de zaten bunu gerektirir.
  const authUser = await db.auth.admin.createUser({ email: `checkout${stamp}@ornek.fr`, email_confirm: true });
  authUserId = authUser.data.user!.id;
  const profile = await new UserProfileService(db).findByAuthUserId(authUserId);
  if (!profile) throw new Error('auth→profil tetikleyicisi profil açmadı');
  customerId = profile.id;
  createdProfiles.push(profile.id);

  const zoneSvc = new DeliveryZoneService(db);
  zoneId = (await zoneSvc.insert({ name: `Test bölgesi ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5] })).id;
  await zoneSvc.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: rotaKodu }]);
  addressId = (await new AddressService(db).addForCustomer({ customerId, line1: '1 rue du Test', postalCode: rotaKodu, city: 'Strasbourg' })).id;
  SettingsService.invalidate();
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('stock').delete().in('variant_id', [variantId, coldVariantId]);
  await db.from('bundle').delete().eq('id', bundleId);
  await db.from('address').delete().eq('customer_id', customerId);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId, coldProductId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    authUserIds: [authUserId],
    warehouseIds: [warehouseId],
  });
  SettingsService.invalidate();
});

/**
 * O bölgenin yaklaşan ilk günü — testin tarihi elle yazması, günü geçince testi çürütürdü.
 *
 * Kod PARAMETRİK, çünkü tutarlılık testleri bölgenin kodunu geçici olarak referans bir kodla
 * değiştiriyor: sabit `rotaKodu` ile sorsaydık o blokta bölge dışı bir koda gün sorulur, cevap boş
 * döner ve rota siparişi `date_unavailable`e düşerdi — testin ölçtüğü şeyle ilgisiz bir sebeple.
 */
async function ilkUygunGun(postalCode: string = rotaKodu): Promise<string> {
  const { resolveDelivery } = await import('./delivery');
  return (await resolveDelivery({ postalCode })).availableDates[0]!;
}

const base = async () => ({
  locale: 'tr' as const,
  customerId,
  addressId,
  deliveryDate: await ilkUygunGun(),
  paymentMethod: 'card' as const,
});

describe('sepet → taslak sipariş', () => {
  it('varyant satırı bağlayıcı fiyatıyla yazılır', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 2, stockId: null }],
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const { items } = (await new OrderService(db).getWithItems(outcome.orderId))!;
    expect(items).toHaveLength(1);
    // Fiyat İSTEMCİDEN gelmedi — sunucunun kendi çözümü.
    expect(items[0]!.unitPriceCents).toBe(2000);
    expect(items[0]!.qty).toBe(2);
    expect(items[0]!.bundleId).toBeNull();
  });

  it('PAKET varyant kalemlerine parçalanır; birim fiyat paketin PAYIDIR', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'bundle', bundleId, qty: 2 }],
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const { items } = (await new OrderService(db).getWithItems(outcome.orderId))!;

    expect(items).toHaveLength(2);
    // Nereden geldiği kaybolmaz: iade ve rapor paketi yeniden kurabilmeli.
    expect(items.every((i) => i.bundleId === bundleId)).toBe(true);
    // Paketin adedi kalemin adedini ÇARPAR.
    expect(items.map((i) => i.qty).sort()).toEqual([2, 2]);
    // Katalog fiyatı (20 + 10 = 30) DEĞİL, paylaştırılmış fiyat (18 + 9 = 27).
    expect(items.reduce((sum, i) => sum + i.unitPriceCents, 0)).toBe(2700);
  });

  /**
   * İndirimin kalem PAYI yazılmazsa sipariş kendi parasıyla çelişir: başlıkta "3 € indirim" yazar,
   * kalemler indirimsiz toplamı taşır ve ödeme motoru farkı **ödenmemiş bakiye** sanar. Yaşandı
   * (29.07): tamamı online ödenmiş sipariş `partial` göründü ve müşteriye giden mail *"kapıda
   * ödenecek: 3,00 €"* dedi.
   *
   * İndirim KATEGORİ kapsamlı kurulur, sepet kapsamlı değil: yerel veritabanı paylaşılıyor ve
   * sepet kapsamlı aktif bir kampanya, o sırada koşan başka bir ajanın siparişine de inerdi
   * (CLAUDE.md §4b). Kategori bu testin kendi damgalı kategorisi.
   */
  it('indirimin kalem PAYI yazılır — sipariş kendi toplamıyla çelişmez', async () => {
    const kampanya = await new DiscountService(db).insert({
      name: `Pay testi ${stamp}`,
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 2, stockId: null }],
      });

      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;
      const { order, items } = (await new OrderService(db).getWithItems(outcome.orderId))!;

      // 2 × 20 € = 40 €'nun %10'u.
      expect(order.discountAmountCents).toBe(400);
      // Payların toplamı başlıktaki indirime EŞİT — motorun `distributeDiscount` garantisi.
      expect(items.reduce((sum, i) => sum + i.lineDiscountAmountCents, 0)).toBe(order.discountAmountCents);

      // Asıl ölçülen: tamamı tahsil edilmiş sipariş `paid` olmalı, kapıda tahsilat kalmamalı.
      const derived = derivePaymentStatusForOrder(order, items, { collectedCents: order.totalCents, refundedCents: 0 });
      expect(derived).toMatchObject({ status: 'paid', amountToCollectCents: 0 });
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  /**
   * REDDEDİLEN KUPON + YERİNE İNEN KAMPANYA (denetim A1).
   *
   * `checkout-draft`'ta `discountAmountOf`'un yerel bir kopyası vardı ve `rejected` hâlinde **0**
   * dönüyordu; paylaşılan sürüm ise `appliedInsteadCents` döndürüyor. Sepet toplamı paylaşılanı
   * kullandığı için tahsilat DOĞRUYDU — ama siparişe "indirim verilmedi" yazılıyordu. Müşteri
   * indirimli ödüyor, defter sıfır gösteriyordu: marj ve kampanya raporu ikisi de yanlış okunur.
   *
   * Kurulum: geçersiz bir kupon kodu (`unknown_code` → `rejected`) + kategorisi bu testin kendi
   * damgalı kategorisi olan otomatik kampanya (kazanan). Kategori kapsamı bilinçli — sepet kapsamlı
   * aktif bir kampanya, o sırada koşan başka bir ajanın siparişine de inerdi (`CLAUDE.md §4b`).
   */
  it('kupon reddedilip yerine kampanya inince KAYIT da indirimi gösterir', async () => {
    const kampanya = await new DiscountService(db).insert({
      name: `Ret testi ${stamp}`,
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const outcome = await createCheckoutDraft({
        ...(await base()),
        couponCode: `YOK-${stamp}`, // hiç var olmayan kod → status: 'rejected'
        entries: [{ kind: 'variant', variantId, qty: 2, stockId: null }],
      });

      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;
      const { order } = (await new OrderService(db).getWithItems(outcome.orderId))!;

      // 2 × 20 €'nun %10'u. Yerel kopya buraya 0 yazıyordu.
      expect(order.discountAmountCents).toBe(400);
      // Ve tahsilat zaten doğruydu — ikisinin AYNI sayı olması sözleşmenin kendisi.
      expect(order.totalCents).toBe(3600);
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  /**
   * KOTA GERÇEKTEN TÜKENİYOR MU (09.6 nöbeti).
   *
   * Açık aylarca yaşadı çünkü zincirin her halkası tek tek doğruydu: tanım ekranı sınırı yazıyor,
   * motor `isApplicable` sınırı kontrol ediyor, `usageCounts` kaydı sayıyor. Yalnız YAZAN yoktu ve
   * bunu hiçbir test göremezdi — hepsi kendi halkasına bakıyordu. Nöbet bu yüzden uçtan uca:
   * gerçek checkout, gerçek kupon, sonra sayaç.
   */
  it('indirim inen sipariş kupon KOTASINI tüketir — kayıt siparişten türer', async () => {
    const discounts = new DiscountService(db);
    const kampanya = await discounts.insert({
      name: `Kota testi ${stamp}`,
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      // Yazan taraf HİÇ YOKKEN sayaç sıfırdı ve kupon sonsuz haklı görünüyordu.
      expect((await discounts.usageCounts([kampanya.id])).get(kampanya.id)?.total ?? 0).toBe(0);

      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });
      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;

      const usage = (await discounts.usageCounts([kampanya.id])).get(kampanya.id);
      expect(usage?.total).toBe(1);
      // Müşteri başına sınır bu kırılımdan çıkar — `per_customer_limit` onsuz hiç engellemez.
      expect(usage?.byCustomer.get(customerId)).toBe(1);
      // Otomatik kampanyanın kapısı yok: kod kırılımı boş kalmalı, uydurma bir kapı sayılmamalı.
      expect(usage?.byCode.size).toBe(0);

      // İPTAL kotayı GERİ VERİR: vazgeçilen siparişte müşteri indirimden yararlanmadı. Kayıt
      // silinmez, sayarken dışlanır — "kim ne zaman denedi" geçmişte kalır.
      await new OrderService(db).update({ id: outcome.orderId, status: 'cancelled' });
      expect((await discounts.usageCounts([kampanya.id])).get(kampanya.id)?.total ?? 0).toBe(0);
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  /**
   * Kupon yolunda ayrıca HANGİ KAPI yazılır. Kota yine kuralın: üç dilli bir kuponun üç kodu tek
   * kotadan harcar (`byCode` bölmez, kırılım verir — 0031). Bu ayrım yazan tarafta bozulursa ekran
   * "hangi dil karşılık buldu" sorusuna yanlış cevap verir ve kimse fark etmez.
   */
  it('kuponla açılan siparişte hangi KAPIDAN girildiği de yazılır', async () => {
    const discounts = new DiscountService(db);
    const kupon = await discounts.insert({
      name: `Kapı testi ${stamp}`,
      trigger: 'coupon',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const kodlar = await new DiscountCodeService(db).replaceCodes(kupon.id, [
        { discountId: kupon.id, code: `KAPI${stamp}`, locale: 'tr' },
        { discountId: kupon.id, code: `PORTE${stamp}`, locale: 'fr' },
      ]);
      const trKod = kodlar.find((k) => k.locale === 'tr')!;

      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
        couponCode: `kapi${stamp}`, // harf ayrımsız: müşteri küçük harfle yazar
      });
      if (outcome.status !== 'ok') throw new Error(`taslak açılmadı: ${outcome.status}`);

      const usage = (await discounts.usageCounts([kupon.id])).get(kupon.id);
      expect(usage?.total).toBe(1);
      // Kota KURALIN, kırılım kodun: giren kapı TR, FR kapısı hiç sayılmamalı.
      expect(usage?.byCode.get(trKod.id)).toBe(1);
      expect(usage?.byCode.size).toBe(1);
    } finally {
      await db.from('discount').delete().eq('id', kupon.id);
    }
  });

  it('aynı sipariş kotayı iki kez tüketemez — kayıt idempotent', async () => {
    const discounts = new DiscountService(db);
    const kampanya = await discounts.insert({
      name: `Idempotency testi ${stamp}`,
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });
      if (outcome.status !== 'ok') throw new Error(`taslak açılmadı: ${outcome.status}`);

      // İkinci kayıt denemesi — yeniden denenen checkout / iki kez gelen webhook. Hata DEĞİL,
      // `false`: garanti tekil indekste, uygulamada bir kontrolde değil.
      const uses = new DiscountUseService(db);
      const ilk = await uses.record({ discountId: kampanya.id, orderId: outcome.orderId, customerId, amountCents: 200 });
      expect(ilk).toBe(false);
      expect((await discounts.usageCounts([kampanya.id])).get(kampanya.id)?.total).toBe(1);
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  it('istemcinin gönderdiği gün uygun günlerden biri değilse sipariş açılmaz', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      deliveryDate: '2030-01-01', // hiçbir bölgeye düşmeyen bir gün
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('date_unavailable');
    expect(await siparisSayisi()).toBe(0);
  });

  it('başkasının adresine sipariş açılamaz', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      addressId: crypto.randomUUID(),
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('address_not_found');
    expect(await siparisSayisi()).toBe(0);
  });

  it('rota DIŞI adreste soğuk zincir kalemi varsa sipariş açılmaz', async () => {
    const disaridaki = await new AddressService(db).addForCustomer({
      customerId,
      line1: '17 avenue Jean Jaurès',
      postalCode: '69007', // hiçbir bölgeye düşmez → kargo
      city: 'Lyon',
    });

    const outcome = await createCheckoutDraft({
      ...(await base()),
      addressId: disaridaki.id,
      deliveryDate: null, // kargoda gün yok
      entries: [{ kind: 'variant', variantId: coldVariantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('cold_chain_unshippable');
    expect(await siparisSayisi()).toBe(0);
  });

  it('boş sepetle sipariş açılmaz', async () => {
    const outcome = await createCheckoutDraft({ ...(await base()), entries: [] });
    expect(outcome.status).toBe('empty_cart');
    expect(await siparisSayisi()).toBe(0);
  });

  /**
   * **İstenen adet depodakinden fazla (19.7).** Kontrol edilmezse taslak açılıyor ve iş
   * REZERVASYONDA patlıyordu — yani müşteri adresini ve ödeme yöntemini seçip "onayla"ya bastıktan
   * sonra, üstelik hangi ürün olduğunu söylemeyen bir cümleyle ("bir ürün tükendi"; oysa tükenen
   * bir şey yok, o adrese o adet gitmiyor).
   *
   * Ret `blocked_lines`ten AYRI: orası "kalem alınamıyor" der, burası "azı alınabiliyor". Tek
   * mesaja indirilseydi müşteri kalemi büsbütün silmeye kalkardı. Sayı da taşınır — sepetin
   * düzeltme düğmesiyle aynı sayı olmak zorunda.
   */
  it('istenen adet depodakinden fazlaysa sipariş AÇILMAZ ve mümkün olan adet söylenir', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 60, stockId: null }],
    });
    expect(outcome.status).toBe('insufficient_here');
    if (outcome.status !== 'insufficient_here') return;
    expect(outcome.lines).toHaveLength(1);
    expect(outcome.lines[0]!.available).toBe(50);
    expect(await siparisSayisi()).toBe(0);
  });

  /**
   * Adres kendiyle tutarsız (19.17) — **yaşanmış arıza.**
   *
   * `LA-26-RFRWKK`: `67000` + `LINGOLSHEIM`, rota + kapıda ödeme. Lingolsheim'ın kodu 67380 ve o kod
   * rotamızda yok; kurye kapıya gidemez, operasyon müşteriyi aramak zorunda kalır. Yolu belirleyen
   * tek şey posta koduydu ve hiçbir yerde adresle karşılaştırılmıyordu.
   *
   * Referans kodu olarak `51300` seçildi: gerçek bir FR kodu (46 köy kapsıyor) ve başka hiçbir test
   * onu kullanmıyor — bağ tablosunun anahtarı `(ülke, kod)` yani küresel, çakışan iki koşu birbirini
   * PK hatasıyla düşürürdü (`CLAUDE.md §4b`). Bölge testin kendi bölgesidir, kodu geçici olarak
   * değiştirilip geri konuyor.
   */
  describe('adres kendiyle tutarlı mı', () => {
    const referansKodu = '51300';

    beforeEach(async () => {
      await new DeliveryZoneService(db).replacePostalCodes(zoneId, [{ country: 'FR', postalCode: referansKodu }]);
    });

    afterEach(async () => {
      await new DeliveryZoneService(db).replacePostalCodes(zoneId, [{ country: 'FR', postalCode: rotaKodu }]);
    });

    it('koda AİT OLMAYAN şehirle rota siparişi açılmaz', async () => {
      const tutarsiz = await new AddressService(db).addForCustomer({
        customerId,
        line1: '192C rue du Maréchal Foch',
        postalCode: referansKodu,
        city: 'LINGOLSHEIM',
      });

      const outcome = await createCheckoutDraft({
        ...(await base()),
        addressId: tutarsiz.id,
        deliveryDate: null,
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });

      expect(outcome.status).toBe('address_city_mismatch');
      // Ekran "şu olmalı" diyebilmeli: sipariş sessizce kargoya çevrilmiyor, sebebi söyleniyor.
      if (outcome.status !== 'address_city_mismatch') throw new Error('beklenen address_city_mismatch');
      expect(outcome.places).toContain('Vitry-le-François');
      expect(await siparisSayisi()).toBe(0);
    });

    it('koda AİT şehirle açılır — çok yerleşimli kodda yanlış alarm ötmez', async () => {
      // 51300'ün 46 köyünden biri. Eski veri tek ada indirgiyordu ve Marolles "kodun şehri değil"
      // görünürdü — yanlış öten bir uyarı, bir süre sonra hiç okunmayan bir uyarıdır.
      const tutarli = await new AddressService(db).addForCustomer({
        customerId,
        line1: '3 rue de l\'Église',
        postalCode: referansKodu,
        city: 'Marolles',
      });

      const outcome = await createCheckoutDraft({
        ...(await base()),
        addressId: tutarli.id,
        // Gün BU bloğun kodundan sorulur: bölgenin kodu geçici olarak `51300`.
        deliveryDate: await ilkUygunGun(referansKodu),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });

      expect(outcome.status).toBe('ok');
    });
  });
});

/** Reddedilen her denemeden sonra ORTADA SİPARİŞ KALMAMALI — yarım taslak da bir taslaktır. */
async function siparisSayisi(): Promise<number> {
  const { count } = await db.from('order').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  return count ?? 0;
}

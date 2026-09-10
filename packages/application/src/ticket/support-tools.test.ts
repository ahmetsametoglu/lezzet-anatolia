import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z, ToolSet } from '@lezzet/ai';
import { EMPTY_NUTRITION } from '@lezzet/types';
import {
  AddressService,
  CategoryService,
  DeliveryZoneService,
  OrderService,
  PriceService,
  ProductService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { generateReferenceNo } from '@lezzet/domain-core';
import { customerSupportTools, type PendingProductCard } from './support-tools';

/**
 * DESTEK AJANININ ARAÇLARI (16.9 · test dalgası 15.18) — modelin veriye kendi baktığı dar yüzey.
 *
 * ── ARAÇLAR ŞEMADAN GEÇİRİLEREK ÇAĞRILIYOR, `execute` ELLE ÇAĞRILMIYOR ──────
 * 22.08 ölçüm turunun dersi (15.18 künyesi): elle çağrıda parametre adı kaçınca (`terim` yerine
 * `sorgu`) araç `undefined` alıp ya varsayılan listeyi döndürdü ya `.replace` üzerinde çöktü — ve
 * iki kez **olmayan bir arıza** neredeyse bildirildi. Modelin gerçek yolu şemadır; test de o yoldan
 * geçmezse doğruladığı şey aracın kendisi değil, testin uydurduğu çağrı olur.
 *
 * ── İDDİALAR DEĞİŞMEZE YAZILIYOR, SEED SAYISINA DEĞİL ──────────────────────
 * Fikstürler bu dosyanın kendi ürünleri/bölgesi/müşterileri (hepsi damgalı) ve iddialar tutarın
 * KENDİSİNE değil kuralına bakıyor: fiyat DOLU ve biçimli mi, eşleşme yoksa `bilinmiyor` mu, adres
 * yoksa "adrese göre okumadım" deniyor mu. Yerel verinin sayısı zaten sahtedir (`CLAUDE` başlığı) —
 * ona yazılan bir iddia, seed değiştiği gün sebebi anlaşılmayan bir kırmızı olurdu.
 *
 * ── BU ARAÇLAR VERİTABANINI DEĞİŞTİRMEZ ────────────────────────────────────
 * Beşi de YALNIZ OKUR (künyenin değişmezi); yazan tek şey bu dosyanın kendi fikstürleridir ve
 * teardown onları toplar. Posta kodu bandı `005`/`006`: ne FR (01000'den) ne DE (01067'den)
 * referansında var, ve `place.test.ts`in kullandığı `007`/`008`/`009` bandına da girmiyor — iki
 * dosya aynı anda koştuğunda birbirinin bölgesini çözmesin.
 */
const db = serviceDb();
const stamp = Date.now();
const son2 = String(stamp).slice(-2);

/** Kendi aktif bölgemize bağlı kod — rota beklenir. */
const ROTA_KODU = `006${son2}`;
/** Hiçbir kayıtta (bizimkinde de referansta da) olmayan kod — `unknown` beklenir. */
const YABANCI_KOD = `005${son2}`;
/** Referans tablosunda iki hizmet ülkesinde (FR · DE) birden geçerli kod — 0033 verisi, seed değil. */
const IKI_ULKELI_KOD = '01640';

/** Bölgenin haftalık günü: Salı (ISO 2). Gün ADIYLA söylenmeli, sayıyla değil. */
const ROTA_GUNU = 2;

const profileIds: string[] = [];
const productIds: string[] = [];
/** Ürün adı → katalog kodu (slug) — kart araçları kodla çağrılır, adla değil. */
const sluglar: Record<string, string> = {};
let categoryId = '';
let warehouseId = '';
/** İkinci depo: stoğu yalnız burada duran ürün rota müşterisine "başka depoda" görünür (10.09). */
let digerDepoId = '';
let musteriId = '';
let adressizId = '';
let b2bId = '';
let siparisNo = '';

/**
 * Aracın gerçek çağrı yolu: **şema → execute**. `options` SDK'nın çağrı bağlamı; araçlarımızın
 * hiçbiri onu okumuyor (kimlik kapanışta), o yüzden en az şeklinde geçiliyor.
 */
const CAGRI_BAGLAMI = { toolCallId: `test-${stamp}`, messages: [] } as unknown as Parameters<
  NonNullable<ToolSet[string]['execute']>
>[1];

async function cagir(tools: ToolSet, ad: string, ham: unknown = {}): Promise<Record<string, unknown>> {
  const arac = tools[ad];
  if (!arac?.execute) throw new Error(`araç yok ya da yürütülemez: ${ad}`);
  // Şema burada devrede: yanlış/eksik parametre `execute`a HİÇ ulaşmaz, testin kendisi patlar.
  const girdi = (arac.inputSchema as z.ZodType<unknown>).parse(ham);
  return (await arac.execute(girdi, CAGRI_BAGLAMI)) as Record<string, unknown>;
}

/** Damgalı müşteri; şirket/onay durumu çağırana bırakılır (`pricing-viewer.test.ts` deseni). */
async function musteriAc(label: string, opts: { company?: boolean } = {}): Promise<string> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.insert({
    roles: ['customer'],
    type: opts.company ? 'company' : 'individual',
    name: `Destek ${label} ${stamp}`,
    email: `destek-${label}-${stamp}@example.test`,
    ...(opts.company ? { companyInfo: { legalName: `Destek SARL ${stamp}` } } : {}),
  });
  profileIds.push(profile.id);
  if (opts.company) await profiles.update({ id: profile.id, b2bApproved: true });
  return profile.id;
}

async function adresYaz(customerId: string, postalCode: string): Promise<void> {
  await new AddressService(db).insert({
    customerId,
    recipient: `Destek Alıcı ${stamp}`,
    phone: '+33612345678',
    line1: '1 rue du Test',
    postalCode,
    city: 'Testville',
  });
}

const gunSonra = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Fiyatlı/fiyatsız, stoklu/stoksuz ürün — katalogda görünmesi için gereken en az şey. `depo` stoğun
 * yerini, `kargolanamaz` soğuk zinciri seçer (10.09 — yere göre ayıklama).
 */
async function urunAc(ad: string, opts: { b2c?: number; b2b?: number; stok?: boolean; depo?: string; kargolanamaz?: boolean } = {}) {
  // Yayın kısıtı (05.36) `active` ürünü üç dilde dolu görmek istiyor — metinler fikstürün konusu
  // değil ama kapının şartı (`product_publish_requires_all_locales`).
  const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
  const { product, variants } = await new ProductService(db).create({
    name: ucDil(`${ad} ${stamp}`),
    description: ucDil('Destek testi ürünü'),
    ingredients: ucDil('Un, su, tuz'),
    storageInstructions: ucDil('Serin yerde saklayın'),
    // Yasal beyan (07.09): ajan alerjen/besin sorusunu KAYITTAN cevaplamalı — fikstür onu taşıyor.
    allergens: ['sut', 'gluten'],
    nutrition: { ...EMPTY_NUTRITION, energyKcal: 290, fatG: 12 },
    categoryId,
    status: 'active',
    ...(opts.kargolanamaz ? { shippable: false } : {}),
    variants: [{ label: { tr: '1 kg' } }],
  });
  productIds.push(product.id);
  sluglar[ad] = product.slug;
  const variantId = variants[0]!.id;
  if (opts.b2c !== undefined) await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: opts.b2c });
  if (opts.b2b !== undefined) await new PriceService(db).insert({ variantId, channel: 'b2b', amountCents: opts.b2b });
  if (opts.stok) {
    await new StockService(db).insert({
      warehouseId: opts.depo ?? warehouseId,
      variantId,
      physicalQty: 10,
      expiryDate: gunSonra(60),
      purchasePriceCents: 100,
    });
  }
  return variantId;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DST' })).id;
  digerDepoId = (await createTestWarehouse(db, { label: 'DS2' })).id;

  // Rota bölgesi: `teslimat_gunleri` ve `posta_kodu_kontrol` aynı kayıttan cevap veriyor.
  const zones = new DeliveryZoneService(db);
  const bolge = await zones.insert({ name: `Destek bölgesi ${stamp}`, warehouseId, weekdays: [ROTA_GUNU] });
  await zones.replacePostalCodes(bolge.id, [{ country: 'FR', postalCode: ROTA_KODU }]);

  categoryId = (await new CategoryService(db).create({ name: { tr: `Destek ${stamp}` } })).id;

  musteriId = await musteriAc('musteri');
  adressizId = await musteriAc('adressiz');
  b2bId = await musteriAc('toptanci', { company: true });
  await adresYaz(musteriId, ROTA_KODU);
  await adresYaz(b2bId, ROTA_KODU);

  // p1 iki kanalda da fiyatlı ve STOKLU — "kim soruyor" ekseninin tek ölçülebilir yeri.
  const fistikliVariantId = await urunAc('Fistikli', { b2c: 457, b2b: 376, stok: true });
  // Fiyatsız ürün: bu kanalda SATIŞA KAPALI — "0,00 €" demek yanlış olurdu (DOMAIN §5).
  await urunAc('Kapali', {});
  // Dolgu: tavanı (PRODUCT_HITS = 5) sınamak için damgalı ürünler beşten fazla (toplam sekiz).
  for (const n of [1, 2, 3, 4]) await urunAc(`Dolgu${n}`, { b2c: 100 });
  /* Yere göre ayıklama (10.09): stoğu yalnız öteki depoda duran ürün rota müşterisine "başka depoda"
     görünür; soğuk zincir ürünü rota deposunda durunca kapıya gider — kargolanamamak rotada engel değil. */
  await urunAc('Uzakta', { b2c: 300, stok: true, depo: digerDepoId });
  await urunAc('Soguk', { b2c: 500, stok: true, kargolanamaz: true });

  // Sipariş: `siparislerim` aracının tek ölçülebilir değişmezi (TUTAR YOK) bir satır ister.
  const { order } = await new OrderService(db).create(
    {
      warehouseId,
      customerId: musteriId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryDate: gunSonra(3),
      paymentMethod: 'cash',
      orderedTotalCents: 4570,
    },
    [{ variantId: fistikliVariantId, qty: 1, unitPriceCents: 4570, vatRate: 5.5 }],
  );
  /* Referansı GEÇİŞE VEREN taraf üretiyor (`transition_order_status`: `coalesce(reference_no,
     p_reference_no)`) — RPC kendiliğinden üretmiyor ve `advanceOrder` fikstürü referans
     geçirmiyor. Ölçüldü 24.08: burada `siparisNo` `null` kalıyordu ve aşağıdaki iddia satırı
     `numara === null` ile bulup YANLIŞ SEBEPLE geçiyordu — şekli doğru sınıyordu ama numarayı
     hiç sınamıyordu. Numarayı motor üretir, fikstür geçirir. */
  const referenceNo = generateReferenceNo({ year: new Date().getFullYear() });
  const gecis = await new OrderService(db).transition({ orderId: order.id, from: 'draft', to: 'confirmed', referenceNo });
  if (!gecis.ok) throw new Error('fikstür: sipariş onaylanamadı');
  siparisNo = (await new OrderService(db).getById(order.id))!.referenceNo!;
});

afterAll(async () => {
  // Siparişi purge `profileIds`ten buluyor; bölge depoyla, kodları bölgeyle gidiyor (`cleanup.ts`).
  await purgeTestData(db, { productIds, categoryIds: [categoryId], profileIds, warehouseIds: [warehouseId, digerDepoId] });
});

describe('değişmez: kimlik ARGÜMAN değil, KAPANIŞTIR', () => {
  it('beş aracın hiçbirinin girdisinde müşteri kimliği YOK', async () => {
    // Model "şu kişininki" diye soramaz çünkü soracak alan yok. Bir gün biri kolaylık olsun diye
    // `customerId` eklerse, uydurulmuş bir kimlikle başkasının verisi okunabilir hâle gelir.
    const tools = customerSupportTools(db, musteriId);
    expect(Object.keys(tools).sort()).toEqual([
      'posta_kodu_kontrol',
      'siparislerim',
      'teslimat_gunleri',
      'teslimat_sartlari',
      'urun_ara',
    ]);

    /* Her aracın KENDİ geçerli girdisi + kaçak bir kimlik. Yalnız `customerId` göndermek şemayı
       zaten "zorunlu alan eksik" diye düşürürdü (ölçüldü) — o düşüş kimliğin süzüldüğünü değil,
       testin yanlış çağırdığını kanıtlardı. */
    const GECERLI: Record<string, Record<string, unknown>> = {
      teslimat_gunleri: {},
      teslimat_sartlari: {},
      siparislerim: {},
      urun_ara: { terim: 'baklava' },
      posta_kodu_kontrol: { postaKodu: ROTA_KODU },
    };

    for (const ad of Object.keys(tools)) {
      const sema = tools[ad]!.inputSchema as z.ZodType<unknown>;
      const girdi = sema.parse({ ...GECERLI[ad], customerId: 'baskasinin-kimligi' }) as Record<string, unknown>;
      // Şema kaçak alanı SÜZÜYOR: modelin uydurduğu bir kimlik araca hiç ulaşmaz.
      expect(girdi.customerId).toBeUndefined();
    }
  });

  it('şema kapıdır: kısa posta kodu `execute`a HİÇ ulaşmaz', async () => {
    const tools = customerSupportTools(db, musteriId);
    // Doğrudan `execute` çağıran bir test bunu göremezdi — 22.08'de tam olarak bu oldu.
    expect(() => (tools.posta_kodu_kontrol!.inputSchema as z.ZodType<unknown>).parse({ postaKodu: '67' })).toThrow();
    expect(() => (tools.urun_ara!.inputSchema as z.ZodType<unknown>).parse({ terim: 'a' })).toThrow();
  });
});

describe('kimliksiz sohbet — set BOŞ değil, DAR (28.08 · CHANNELS §3b)', () => {
  it('kimliksizde GEÇMİŞ araçları yok, kamusal üçü VAR', async () => {
    /* İki yönlü iddia ve ikisi de gerekli: eksik yarısı bir güvenlik açığı (kimliksiz sohbette
       "siparişlerim" okunabilseydi kimin siparişi olduğu belirsizken veri açılırdı), fazlası bir
       yetenek kaybı (bir tur boyunca HİÇ araç verilmiyordu ve ajan katalogu bile okuyamıyordu). */
    expect(Object.keys(customerSupportTools(db, null)).sort()).toEqual([
      'posta_kodu_kontrol',
      'teslimat_sartlari',
      'urun_ara',
    ]);
  });

  it('kimliksizde posta kodu sorusu TAM cevaplanır — kanalın asıl işi bu', async () => {
    // Messenger/IG'de sohbet kimliksiz DOĞAR (PSID telefon taşımaz). "Şu koda geliyor musunuz"
    // sorusunun cevabı sitede ziyaretçiye açıkken sohbette cevapsız kalıyordu.
    const sonuc = await cagir(customerSupportTools(db, null), 'posta_kodu_kontrol', { postaKodu: ROTA_KODU });
    expect(sonuc.teslimat).toContain('kapıya teslim');
    expect(sonuc.haftalikGunler).toBeDefined();
  });

  it('söylenen GERÇEK kod sohbetin hafızasına yazılır; tanınmayan kod yazılmaz (10.09)', async () => {
    /* Müşteri posta kodunu bir kez söyler: sepete yazan araçlar sonraki turlarda onu bilir
       (`cart/chat-place.ts`). Yazım hatası saklansaydı sohbet yanlış bir yere kilitlenir ve her cevap
       "oraya gitmiyoruz" derdi. Hafıza taklit: bu dosya aracın NE yazdırdığını sınar, yazımın kendisini değil. */
    const yazilan: string[] = [];
    const hafiza = { known: () => null, knownCountry: () => null, remember: async (kod: string) => void yazilan.push(kod) };
    await cagir(customerSupportTools(db, null, null, hafiza), 'posta_kodu_kontrol', { postaKodu: ROTA_KODU });
    await cagir(customerSupportTools(db, null, null, hafiza), 'posta_kodu_kontrol', { postaKodu: YABANCI_KOD });
    expect(yazilan).toEqual([ROTA_KODU]);
  });

  it('İKİ ÜLKELİ kodda ülke SORULUR, kod yine saklanır; ülke gelince çözüm tek ülkeye iner (15.20)', async () => {
    /* Kod referans tablosunda iki hizmet ülkesinde birden geçerli (migration verisi, seed değil). Eskiden
       saklanmıyordu ve sonraki tur posta kodunu YENİDEN soruyordu; artık kod saklanır, yalnız ülke sorulur. */
    const yazilan: [string, string | undefined][] = [];
    const hafiza = {
      known: () => null,
      knownCountry: () => null,
      remember: async (kod: string, ulke?: string) => void yazilan.push([kod, ulke]),
    };
    const araclar = customerSupportTools(db, null, null, hafiza);
    const soru = await cagir(araclar, 'posta_kodu_kontrol', { postaKodu: IKI_ULKELI_KOD });
    expect(soru.bilinmiyor).toContain('birden çok ülkede');
    // Seçenekler kodla birlikte: model müşterinin cevabını `ulke` alanına AYNEN geçebilsin.
    expect(soru.adaylar).toEqual(expect.arrayContaining([expect.stringContaining('(FR)'), expect.stringContaining('(DE)')]));

    const cevap = await cagir(araclar, 'posta_kodu_kontrol', { postaKodu: IKI_ULKELI_KOD, ulke: 'DE' });
    expect(cevap.bilinmiyor).toBeUndefined();
    expect(yazilan).toEqual([
      [IKI_ULKELI_KOD, undefined],
      [IKI_ULKELI_KOD, 'DE'],
    ]);
  });

  it('kimliksizde ürün + fiyat okunur ve fiyat ZİYARETÇİ kapsamıdır', async () => {
    /* Kimlik yokken B2B kademesi sızmamalı: `pricingViewerOf(db, null)` ziyaretçiye düşüyor.
       İddia B2B'ye EŞİT OLMAMAK üzerinden kuruluyor — tutara yazılan bir iddia fikstür değişince
       sebebi anlaşılmayan bir kırmızı olurdu. */
    const kimliksiz = await cagir(customerSupportTools(db, null), 'urun_ara', { terim: `Fistikli ${stamp}` });
    const toptan = await cagir(customerSupportTools(db, b2bId), 'urun_ara', { terim: `Fistikli ${stamp}` });
    const fiyatZiyaretci = (kimliksiz.urunler as { fiyat: string }[])[0]!.fiyat;
    expect(fiyatZiyaretci).toContain('€');
    expect(fiyatZiyaretci).not.toBe((toptan.urunler as { fiyat: string }[])[0]!.fiyat);
  });

  it('İLK eşleşmenin yasal BEYANI gelir — alerjen sorusu tahminle değil kayıtla cevaplanır (07.09)', async () => {
    /* Canlı turda ajan "alerjen bilgisi sistemde yok" diye devretti; katalog beyanı tutuyordu, araç
       vermiyordu. Alerjen bir sağlık sorusudur: kayıt varsa listeyi, yoksa "beyan yok" der. */
    const sonuc = await cagir(customerSupportTools(db, null), 'urun_ara', { terim: `Fistikli ${stamp}` });
    const beyan = sonuc.beyan as { alerjenler: string; icindekiler: string; besinDegerleri100g: Record<string, number> };
    expect(beyan.alerjenler).toContain('Süt');
    expect(beyan.alerjenler).toContain('Gluten');
    expect(beyan.icindekiler).toContain('Un');
    expect(beyan.besinDegerleri100g).toMatchObject({ 'Enerji (kcal)': 290, 'Yağ (g)': 12 });
  });

  it('kimliksiz + posta kodu = stok DEPO-DOĞRU okunur (kimlik gerekmiyor)', async () => {
    /* Asıl kazanç bu: kimliksiz sohbette müşteri kodunu söyleyince "sana gelir mi" sorusu
       cevaplanabilir hâle geliyor. Kimlik istenseydi Messenger'da bu soru hiç cevaplanamazdı. */
    const sonuc = await cagir(customerSupportTools(db, null), 'urun_ara', {
      terim: `Fistikli ${stamp}`,
      postaKodu: ROTA_KODU,
    });
    expect(sonuc.yer).toBe(ROTA_KODU);
    expect(sonuc.yerBilinmiyor).toBeUndefined();
    expect((sonuc.urunler as { durum: string }[])[0]!.durum).toContain('teslim edilebilir');
  });

  it('kimliksizde teslimat şartları okunur — sayılar ziyaretçi kapsamından', async () => {
    const sonuc = await cagir(customerSupportTools(db, null), 'teslimat_sartlari', {});
    expect(sonuc.kargoUcreti).toContain('€');
    expect(sonuc.kargoGonderilenUlkeler).toBeDefined();
  });
});

describe('teslimat_gunleri — bilinmeyen SIFIR değildir', () => {
  it('adres yoksa gün UYDURULMAZ, `bilinmiyor` döner', async () => {
    // "Teslimat günü yok" cümlesi müşteriye yanlış bir kesinlik verirdi; burada eksik olan gün
    // değil, hangi adrese sorulacağı bilgisi (CLAUDE §1).
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'teslimat_gunleri');
    expect(sonuc.bilinmiyor).toContain('adresi yok');
    expect(sonuc.haftalikGunler).toBeUndefined();
  });

  it('rota adresinde gün ADIYLA söylenir ve yaklaşan tarihler somuttur', async () => {
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'teslimat_gunleri');
    expect(sonuc.bilinmiyor).toBeUndefined();
    // ISO gün numarası (2) değil, "Salı". Model sayıyı müşteriye olduğu gibi yazardı.
    expect(sonuc.haftalikGunler).toEqual(['Salı']);
    expect(sonuc.adres).toContain(ROTA_KODU);
    const tarihler = sonuc.yaklasanTarihler as string[];
    expect(tarihler.length).toBeGreaterThan(0);
    // Tarih tek başına yetmez, gün adı da lazım: "18 Ağustos Salı".
    expect(tarihler.every((t) => t.includes('Salı'))).toBe(true);
  });

  it('rota DIŞI adreste haftalık gün söylenmez', async () => {
    // Kargo bölgesinde haftalık rota yoktur; buradan bir gün üretmek olmayan bir söz vermekti.
    const kargoMusteri = await musteriAc('kargo');
    await adresYaz(kargoMusteri, YABANCI_KOD);
    const sonuc = await cagir(customerSupportTools(db, kargoMusteri), 'teslimat_gunleri');
    expect(sonuc.bilinmiyor).toBeTruthy();
    expect(sonuc.haftalikGunler).toBeUndefined();
  });
});

describe('urun_ara — fiyat MÜŞTERİNİN kendi fiyatıdır', () => {
  it('eşleşme yoksa `bilinmiyor` — uydurma yolu kapalı', async () => {
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: `zzzqqq${stamp}` });
    expect(sonuc.bilinmiyor).toContain('katalogda eşleşen ürün yok');
    expect(sonuc.urunler).toBeUndefined();
  });

  it('B2C ile B2B müşteri AYNI ürüne farklı fiyat görür', async () => {
    // Ölçülmüştü (22.08) ama regresyonu yakalayan bir şey yoktu: `pricingViewerOf` çağrısı
    // düşerse toptancıya perakende fiyat söylenir ve hiçbir yerde hata görünmez.
    const perakende = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: `Fistikli ${stamp}` });
    const toptan = await cagir(customerSupportTools(db, b2bId), 'urun_ara', { terim: `Fistikli ${stamp}` });

    const fiyatB2C = (perakende.urunler as { fiyat: string }[])[0]!.fiyat;
    const fiyatB2B = (toptan.urunler as { fiyat: string }[])[0]!.fiyat;
    // İddia TUTARA değil FARKA: seed'e bağlı olmayan tek doğru budur (fikstür kendi sayısını koydu).
    expect(fiyatB2C).not.toBe(fiyatB2B);
    expect(fiyatB2C).toContain('€');
    expect(fiyatB2B).toContain('€');
  });

  it('stoklu ürün müşterinin adresine göre "teslim edilebilir" der', async () => {
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: `Fistikli ${stamp}` });
    expect((sonuc.urunler as { durum: string }[])[0]!.durum).toContain('teslim edilebilir');
    // Yer BİLİNİYOR: uyarı alanı hiç görünmemeli, yoksa model gereksiz bir çekince yazardı.
    expect(sonuc.yerBilinmiyor).toBeUndefined();
    expect(sonuc.yer).toBe(ROTA_KODU);
  });

  it('yer hiç çözülemeyince stok "hiç var mı" düzeyinde okunur, SÖYLENİR ve ÇARESİ verilir', async () => {
    // Depo-üstü okuma meşru bir cevaptır ama farklı bir sorunun cevabıdır; model farkı ancak
    // kendisine söylenirse bilir. Ve yalnız "bilmiyorum" demek yetmez — modelin bir sonraki hamlesi
    // (posta kodunu SOR, aracı yeniden çağır) cevabın içinde duruyor.
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'urun_ara', { terim: `Fistikli ${stamp}` });
    expect(sonuc.urunler).toBeDefined();
    expect(sonuc.yerBilinmiyor).toContain('POSTA KODU');
  });

  it('SÖYLENEN posta kodu kayıtlı adresi EZER — başka adrese gönderen müşteri (28.08)', async () => {
    /* Kayıtlı adresi olan müşteri "annemin evine, şu koda gelir mi" diyebilir. Kayıtlı adres
       kazansaydı araç DOĞRU bir cevabı YANLIŞ soruya vermiş olurdu — ve müşteri farkı anlayamazdı,
       çünkü cevapta hangi yere bakıldığı yazmazdı. `yer` alanı tam da bunun için var. */
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', {
      terim: `Fistikli ${stamp}`,
      postaKodu: YABANCI_KOD,
    });
    expect(sonuc.yer).toBe(YABANCI_KOD);
    // Yabancı kod hiçbir bölgeye düşmüyor → depo çözülemez → stok depo-üstü okunur, ama araç
    // sustuğu için değil, o kod bize gitmediği için: ürün yine listeleniyor.
    expect(sonuc.urunler).toBeDefined();
    // Referansta olmayan kod bir YAZIM HATASIDIR (10.09): model kodu müşteriye teyit ettirir, "gider" demez.
    expect(sonuc.postaKoduGecersiz).toBeTruthy();
  });

  it('fiyatsız ürün "0,00 €" değil "bu kanalda satışa kapalı" der', async () => {
    // `null` fiyat bir sayı değil bir HÂL (DOMAIN §5); sıfıra düşürmek bedavaya satmayı vaat ederdi.
    // Yeri bilinmeyen müşteri (10.09): bilinen yerde stoksuz ürün listeden AYRILIR; fiyat cümlesi yer istemez.
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'urun_ara', { terim: `Kapali ${stamp}` });
    expect((sonuc.urunler as { fiyat: string }[])[0]!.fiyat).toBe('bu kanalda satışa kapalı');
  });

  it('liste TAVANLI — sekiz eşleşme varken beş ürün döner ve kırpma SÖYLENİR', async () => {
    // Araç cevabı prompt'a giriyor: sınırsız liste hem maliyeti hem modelin "hangisini söyleyeyim"
    // belirsizliğini büyütürdü. Yeri bilinmeyen müşteri: ayıklama yok, sekizi de aday (10.09).
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'urun_ara', { terim: String(stamp) });
    expect((sonuc.urunler as unknown[]).length).toBe(5);
    // Toplam SAYAÇTAN (`total`), sayfadan değil — ve "tam liste değil" cümlesi modelin önünde.
    expect(String(sonuc.kapsam)).toContain('Toplam 8 ürünün 5');
    expect(String(sonuc.kapsam)).toContain('TAM DEĞİL');
  });

  it('stoksuz ürün "tükendi" der — dört stok hâli dört ayrı cümle', async () => {
    // Bilinen yerde stoksuz ürün listeye girmez (10.09); "yok" da denmez — sebebiyle ayrı alanda.
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: `Dolgu1 ${stamp}` });
    expect(sonuc.urunler).toBeUndefined();
    expect((sonuc.buAdreseGitmeyenler as { urunler: string[] }).urunler[0]).toBe(`Dolgu1 ${stamp} — tükendi`);
  });
});

describe('urun_ara — yer biliniyorsa yalnız o adrese GİDEN ürün önerilir (10.09)', () => {
  it('gidebilen listelenir; gidemeyen listeye girmez, sayısı ve sebebi ayrı alanda', async () => {
    /* Kullanıcı sorusu (10.09): "posta koduna gönderilebilen ürünleri bulabiliyor mu?" Liste her ürüne
       "bu adrese gider mi" yazıyordu ama gidemeyenlerle doluydu ve tavan gidebilenleri kesebiliyordu. */
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: String(stamp) });
    const urunler = sonuc.urunler as { ad: string; durum: string }[];
    expect(urunler.map((u) => u.ad).sort()).toEqual([`Fistikli ${stamp}`, `Soguk ${stamp}`]);
    // Soğuk zincir ürünü rota deposunda duruyor: kapıya gider — kargolanamamak rotada engel değil.
    for (const u of urunler) expect(u.durum).toBe('stokta — bu adrese teslim edilebilir');
    const gitmeyen = sonuc.buAdreseGitmeyenler as { sayi: number; urunler: string[]; not: string };
    // Kapalı + dört Dolgu (tükendi) + Uzakta (başka depoda) — hepsi bu dosyanın damgalı ürünleri.
    expect(gitmeyen.sayi).toBe(6);
    expect(gitmeyen.not).toContain('ÖNERME');
  });

  it('adıyla sorulan ürün bu adrese gitmiyorsa "yok" DENMEZ — var ama başka depoda', async () => {
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: `Uzakta ${stamp}` });
    expect(sonuc.bilinmiyor).toBeUndefined();
    expect(String(sonuc.buAdreseGidenYok)).toContain('gönderilemiyor');
    expect((sonuc.buAdreseGitmeyenler as { urunler: string[] }).urunler).toEqual([
      `Uzakta ${stamp} — başka depoda var; bu adrese bugün verilemiyor`,
    ]);
  });

  it('yer bilinmeden "bu adrese" DENMEZ ve hiçbir şey ayıklanmaz', async () => {
    // Depo-üstü okuma: başka depodaki mal "stokta" — ama hangi adrese gideceği posta koduyla belli olur.
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'urun_ara', { terim: `Uzakta ${stamp}` });
    expect((sonuc.urunler as { durum: string }[])[0]!.durum).toBe('stokta');
    expect(sonuc.buAdreseGitmeyenler).toBeUndefined();
  });
});

describe('kart ve karusel — bu adrese gitmeyen ürün kart OLMAZ (10.09)', () => {
  /** Kart kancası — kimliksiz Messenger sohbeti; gönderilecek kartlar sayılır, kanala bir şey gitmez. */
  function kartKancasi() {
    const kartlar: PendingProductCard[] = [];
    const hook = {
      conversation: { source: 'messenger' as const, language: 'tr' as const, customerId: null },
      onCard: (kart: PendingProductCard) => void kartlar.push(kart),
    };
    return { kartlar, hook };
  }

  it('gidemeyen ürüne kart gönderilmez ve sebebi modele söylenir; gidebilene gönderilir', async () => {
    // Kart gidemeyen ürünü de gösteriyordu: düğmesine basan müşteri "gönderilemez" cevabı alırdı.
    const { kartlar, hook } = kartKancasi();
    const tools = customerSupportTools(db, null, hook);
    const gitmeyen = await cagir(tools, 'urun_karti', { kod: sluglar.Uzakta, postaKodu: ROTA_KODU });
    expect(String(gitmeyen.gonderilemez)).toContain('başka depoda');
    expect(kartlar).toHaveLength(0);
    const giden = await cagir(tools, 'urun_karti', { kod: sluglar.Fistikli, postaKodu: ROTA_KODU });
    expect(giden.kart).toBeDefined();
    expect(kartlar).toHaveLength(1);
  });

  it('karusel gidemeyen ürünü kart yapmaz, sebebiyle dışarıda bırakır', async () => {
    const { hook } = kartKancasi();
    const sonuc = await cagir(customerSupportTools(db, null, hook), 'urun_karuseli', {
      kodlar: [sluglar.Fistikli, sluglar.Uzakta],
      postaKodu: ROTA_KODU,
    });
    // Fikstürlerin görseli yok, karusel kurulamıyor — sınanan şey dışarıda kalanın SEBEBİ.
    expect(sonuc.disarida).toContain(`Uzakta ${stamp} (bu adrese gönderilemiyor)`);
  });
});

describe('posta_kodu_kontrol — beş hâl, beş ayrı cümle', () => {
  it('rota kodunda kapıya teslim + gün ADI', async () => {
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'posta_kodu_kontrol', { postaKodu: ROTA_KODU });
    expect(sonuc.teslimat).toContain('kapıya teslim');
    expect(sonuc.haftalikGunler).toEqual(['Salı']);
  });

  it('hiç tanınmayan kod "yazım hatası" der — "gelmiyoruz" DEMEZ', async () => {
    // İkisi ayrı cevap: "kod yanlış" teyit ister, "buraya gelmiyoruz" bir bilgidir. Tek kovaya
    // atmak, müşteriye yanlış eylemi önerirdi.
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'posta_kodu_kontrol', { postaKodu: YABANCI_KOD });
    expect(sonuc.bilinmiyor).toContain('yazım hatası');
    expect(sonuc.teslimat).toBeUndefined();
  });

  it('kimliksiz soru meşrudur: araç MÜŞTERİNİN adresini değil, SORULAN kodu okur', async () => {
    // Kimliği olan müşteri başka bir yeri sorabilir (kızının adresi, dükkânı). Araç adresi
    // karıştırırsa "size geliyoruz" der ve müşteri yanlış yere sipariş verir.
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'posta_kodu_kontrol', { postaKodu: YABANCI_KOD });
    expect(sonuc.kod).toBe(YABANCI_KOD);
    expect(sonuc.bilinmiyor).toBeTruthy();
  });
});

describe('teslimat_sartlari — sayılar tek kapıdan', () => {
  it('altı alan da dolu ve BİÇİMLİ; ülkeler kod değil AD', async () => {
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'teslimat_sartlari');
    for (const alan of ['kargoUcreti', 'ucretsizKargoEsigi', 'asgariSepetKapiyaTeslim', 'kapidaOdemeUstSiniri']) {
      expect(String(sonuc[alan])).toContain('€');
    }
    // 'FR' değil 'Fransa': model ham ülke kodunu müşteriye olduğu gibi yazardı.
    for (const ulke of sonuc.kargoGonderilenUlkeler as string[]) expect(ulke.length).toBeGreaterThan(2);
  });

  it('asgari kargo sepeti SIFIRSA "alt sınır yok" yazılır, "0,00 €" değil', async () => {
    // Ayara dokunulmuyor (küresel tekil satır — `CLAUDE §4b`): iddia hangi değer olursa olsun
    // GEÇERLİ — yokluk ile sıfır ayrı şeylerdir ve "0,00 €" ikisini birbirine karıştırır.
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'teslimat_sartlari');
    expect(sonuc.asgariSepetKargo).not.toBe('0,00 €');
  });
});

describe('siparislerim — durum söyler, TUTAR söylemez', () => {
  it('sipariş satırında hiçbir tutar alanı YOK', async () => {
    // İşlem tutarı bir KARARDIR (iade, telafi, indirim pazarlığı) ve insanın işidir; liste fiyatı
    // ise yayımlanmış bilgi. Ajan ikincisini söyler, birincisini söylemez.
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'siparislerim');
    const siparisler = sonuc.siparisler as Record<string, unknown>[];
    expect(siparisler.length).toBeGreaterThan(0);

    // Numaranın DOLU olduğu ayrıca iddia ediliyor: `null === null` eşleşmesi bir satır bulur ve
    // test numarayı hiç sınamadan geçerdi (24.08'de tam olarak bu oldu).
    expect(siparisNo).toMatch(/^LA-/);
    const bizimki = siparisler.find((s) => s.numara === siparisNo);
    expect(bizimki).toBeDefined();
    expect(Object.keys(bizimki!).sort()).toEqual(['durum', 'numara', 'teslimGunu']);
    // Alan adı değil, DEĞER de sınanıyor: hiçbir alanda para birimi geçmemeli.
    for (const deger of Object.values(bizimki!)) expect(String(deger)).not.toContain('€');
  });

  it('durum TÜRKÇE etikettir, ham enum değil', async () => {
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'siparislerim');
    const bizimki = (sonuc.siparisler as { numara: string; durum: string }[]).find((s) => s.numara === siparisNo);
    expect(bizimki!.durum).not.toBe('pending');
  });

  it('siparişi olmayan müşteride boşluğun ADI söylenir — "bilinmiyor" değil', async () => {
    // Boş liste bir cevaptır ama ADSIZ boş liste değil (f250e161): açıklamasız `[]` modelce
    // "erişemiyorum" diye yorumlandı ve ajan boşuna devretti. Şimdi araç boşluğu cümleyle söylüyor.
    // `bilinmiyor` ise okuma düştüğünde gelir ve devretmeyi gerektirir; ikisi karışmamalı.
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'siparislerim');
    expect(sonuc.siparisler).toBeUndefined();
    expect(String(sonuc.siparisYok)).toContain('kayıtlı siparişi YOK');
    expect(sonuc.bilinmiyor).toBeUndefined();
  });
});

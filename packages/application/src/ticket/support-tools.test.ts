import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z, ToolSet } from '@lezzet/ai';
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
import { advanceOrder } from '../order/advance.testkit';
import { customerSupportTools } from './support-tools';

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

/** Bölgenin haftalık günü: Salı (ISO 2). Gün ADIYLA söylenmeli, sayıyla değil. */
const ROTA_GUNU = 2;

const profileIds: string[] = [];
const productIds: string[] = [];
let categoryId = '';
let warehouseId = '';
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

/** Fiyatlı/fiyatsız, stoklu/stoksuz ürün — katalogda görünmesi için gereken en az şey. */
async function urunAc(ad: string, opts: { b2c?: number; b2b?: number; stok?: boolean } = {}) {
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `${ad} ${stamp}` },
    categoryId,
    status: 'active',
    variants: [{ label: { tr: '1 kg' } }],
  });
  productIds.push(product.id);
  const variantId = variants[0]!.id;
  if (opts.b2c !== undefined) await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: opts.b2c });
  if (opts.b2b !== undefined) await new PriceService(db).insert({ variantId, channel: 'b2b', amountCents: opts.b2b });
  if (opts.stok) {
    await new StockService(db).insert({
      warehouseId,
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
  // Dolgu: tavanı (PRODUCT_HITS = 5) sınamak için toplam altı ürün aynı damgayı taşıyor.
  for (const n of [1, 2, 3, 4]) await urunAc(`Dolgu${n}`, { b2c: 100 });

  // Sipariş: `siparislerim` aracının tek ölçülebilir değişmezi (TUTAR YOK) bir satır ister.
  const { order } = await new OrderService(db).create(
    {
      warehouseId,
      customerId: musteriId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryDate: gunSonra(3),
      paymentMethod: 'cash',
      totalCents: 4570,
    },
    [{ variantId: fistikliVariantId, qty: 1, unitPriceCents: 4570, vatRate: 5.5 }],
  );
  /* Referans numarası İLK KALICI DURUMDA üretiliyor (`order.referenceNo` künyesi) — taze
     `pending` siparişte `null`. Aracın döndürdüğü `numara` alanı da o yüzden ancak onaylanmış
     siparişte doludur; fikstür bunu bilerek bir adım ilerletiyor. */
  await advanceOrder(db, order.id, ['confirmed']);
  siparisNo = (await new OrderService(db).getById(order.id))!.referenceNo!;
});

afterAll(async () => {
  // Siparişi purge `profileIds`ten buluyor; bölge depoyla, kodları bölgeyle gidiyor (`cleanup.ts`).
  await purgeTestData(db, { productIds, categoryIds: [categoryId], profileIds, warehouseIds: [warehouseId] });
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
    // Adres BİLİNİYOR: uyarı alanı hiç görünmemeli, yoksa model gereksiz bir çekince yazardı.
    expect(sonuc.adresBilinmiyor).toBeUndefined();
  });

  it('adressiz müşteride stok "hiç var mı" düzeyinde okunur ve bu SÖYLENİR', async () => {
    // Depo-üstü okuma meşru bir cevaptır ama farklı bir sorunun cevabıdır; model farkı ancak
    // kendisine söylenirse bilir.
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'urun_ara', { terim: `Fistikli ${stamp}` });
    expect(sonuc.urunler).toBeDefined();
    expect(sonuc.adresBilinmiyor).toContain('adresi yok');
  });

  it('fiyatsız ürün "0,00 €" değil "bu kanalda satışa kapalı" der', async () => {
    // `null` fiyat bir sayı değil bir HÂL (DOMAIN §5); sıfıra düşürmek bedavaya satmayı vaat ederdi.
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: `Kapali ${stamp}` });
    expect((sonuc.urunler as { fiyat: string }[])[0]!.fiyat).toBe('bu kanalda satışa kapalı');
  });

  it('liste TAVANLI — altı eşleşme varken beş ürün döner', async () => {
    // Araç cevabı prompt'a giriyor: sınırsız liste hem maliyeti hem modelin "hangisini söyleyeyim"
    // belirsizliğini büyütürdü.
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: String(stamp) });
    expect((sonuc.urunler as unknown[]).length).toBe(5);
  });

  it('stoksuz ürün "tükendi" der — dört stok hâli dört ayrı cümle', async () => {
    const sonuc = await cagir(customerSupportTools(db, musteriId), 'urun_ara', { terim: `Dolgu1 ${stamp}` });
    expect((sonuc.urunler as { durum: string }[])[0]!.durum).toBe('tükendi');
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

  it('siparişi olmayan müşteride BOŞ liste — "bilinmiyor" değil', async () => {
    // Boş liste bir cevaptır: "hiç siparişiniz görünmüyor" denebilir. `bilinmiyor` ise okuma
    // düştüğünde gelir ve devretmeyi gerektirir; ikisini karıştırmak müşteriyi boşuna beklet(ir)di.
    const sonuc = await cagir(customerSupportTools(db, adressizId), 'siparislerim');
    expect(sonuc.siparisler).toEqual([]);
    expect(sonuc.bilinmiyor).toBeUndefined();
  });
});

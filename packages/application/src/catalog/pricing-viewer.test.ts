import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { getProductDetail } from './product';
import { VISITOR, effectiveChannelOf, pricingViewerOf } from './pricing-viewer';

/**
 * **Fiyatın "kim soruyor" ekseni** (DOMAIN §5, §10) — terfi 21.6 (C).
 *
 * Vitrin fiyatı uzun süre `channel: 'b2c'` ve `b2bApproved: false` SABİTLERİYLE çözülüyordu.
 * Hiçbir şey patlamıyordu, çünkü sabitler geçerli değerlerdi — yalnız iki özellik sessizce ölüydü:
 * onaylanmış B2B müşteri toptan fiyat görmüyordu ve müşteriye özel fiyat hiç okunuyordu. Bu sınıf
 * hatanın testi de bu yüzden yazılıyor: kod okunarak değil, **fiyatın kendisi sorularak** doğrulanır.
 *
 * **Web'deki eşleniğinden farkı sınama YÜZEYİ:** orası `getCartView` üzerinden geçiyordu (sepet web
 * lib'inde, terfi etmedi). Burada zincir vitrinin kendi kapısından geçiyor —
 * kimlik → `pricingViewerOf` → fiyat satırlarının okunması → motor → detay kartı. Ara katmandan
 * biri sabitlense test yine kırmızıya döner; üstelik ölçüm artık müşterinin GÖRDÜĞÜ sayıda.
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
let productSlug: string;
let variantId: string;
let warehouseId: string;
const createdProfiles: string[] = [];
/**
 * E-posta sayacı — `createdProfiles.length`'ten BAĞIMSIZ. Başarılı eklemeleri sayan bir sayaç, ilk
 * ekleme düştüğünde ikincisine aynı e-postayı verir ve gerçek hatayı "duplicate key" diye maskeler.
 */
let profileSeq = 0;

const B2C_FIYAT = 3_000;
/** Toptan liste — B2C'den belirgin farklı ki "hangisini gördü" sorusu tek bakışta cevaplansın. */
const B2B_FIYAT = 1_800;
/** Anlaşmalı fiyat: kanal listesinden de ucuz — motorun sırası "özel → kanal". */
const OZEL_FIYAT = 1_500;

/** Damgalı müşteri; `company` + onay durumu çağırana bırakılır (CLAUDE §4b: küresel satır kirletilmez). */
async function newCustomer(opts: { company?: boolean; approved?: boolean | null } = {}): Promise<string> {
  const profiles = new UserProfileService(db);
  profileSeq += 1;
  const profile = await profiles.insert({
    roles: ['customer'],
    type: opts.company ? 'company' : 'individual',
    name: `Fiyat ${stamp}`,
    email: `fiyat-${stamp}-${profileSeq}@example.test`,
    ...(opts.company ? { companyInfo: { legalName: `Test SARL ${stamp}` } } : {}),
  });
  createdProfiles.push(profile.id);
  if (opts.approved !== undefined) await profiles.update({ id: profile.id, b2bApproved: opts.approved });
  return profile.id;
}

/** Detay sayfasındaki tek boyun birim fiyatı — testin sorduğu tek sayı. */
async function birimFiyat(customerId: string | null): Promise<number | null> {
  const viewer = await pricingViewerOf(db, customerId);
  const detail = await getProductDetail(db, {
    locale: 'tr',
    slug: productSlug,
    place: { warehouseId, shippingWarehouseId: null },
    viewer,
  });
  return detail?.variants[0]?.priceCents ?? null;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Görüntüleyen ${stamp}` } })).id;
  // Yayın kısıtının (05.36) şartı: `active` ürün üç dilde dolu olmalı — metinler fikstürün konusu değil.
  const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
  const created = await new ProductService(db).create({
    name: ucDil(`Görüntüleyen ürünü ${stamp}`),
    description: ucDil('Fiyat görünürlüğü testi'),
    ingredients: ucDil('Un, su, tuz'),
    storageInstructions: ucDil('Serin yerde saklayın'),
    categoryId,
    status: 'active',
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = created.product.id;
  productSlug = created.product.slug;
  variantId = created.variants[0]!.id;

  const prices = new PriceService(db);
  await prices.setPrice({ variantId, channel: 'b2c', amountCents: B2C_FIYAT });
  await prices.setPrice({ variantId, channel: 'b2b', amountCents: B2B_FIYAT });

  // Stok: fiyat sorusunun cevabını değiştirmez ama ürünü GERÇEK bir satış hâline sokar — testin
  // ölçtüğü sayı, müşterinin tükenmiş bir kartta değil alınabilir bir kartta gördüğü sayı olsun.
  await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 50,
    expiryDate: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
  });
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

describe('pricingViewerOf', () => {
  it('kimliksiz çağrı ZİYARETÇİ künyesi döndürür — DB\'ye hiç gitmez', async () => {
    expect(await pricingViewerOf(db, null)).toEqual(VISITOR);
  });

  it('ONAYSIZ şirket künyesi b2c\'ye DARALTILIR ama onay bayrağı olduğu gibi taşınır', async () => {
    // İki alan ayrı sorulara cevap veriyor: `channel` fiyatın okunacağı liste, `b2bApproved` motorun
    // kendi daraltmasını yaparken bakacağı gerçek. İkincisini de b2c'ye çevirmek bilgiyi silerdi.
    // `groupPercentOff` burada iki kez null: müşterinin grubu yok, ve onaysız şirkette kademe zaten kapalı.
    const customerId = await newCustomer({ company: true, approved: false });
    expect(await pricingViewerOf(db, customerId)).toEqual({ channel: 'b2c', b2bApproved: false, customerId, groupPercentOff: null });
  });

  it('ONAYLI şirket b2b kanalına açılır', async () => {
    // Kanal açık ama müşteri hiçbir gruba üye değil — kademe yokluğu `null`dır, sıfır değil.
    const customerId = await newCustomer({ company: true, approved: true });
    expect(await pricingViewerOf(db, customerId)).toEqual({ channel: 'b2b', b2bApproved: true, customerId, groupPercentOff: null });
  });

  it('bulunamayan kimlik ZİYARETÇİye düşer — uydurma bir kanal açılmaz', async () => {
    expect(await pricingViewerOf(db, '00000000-0000-4000-8000-000000000000')).toEqual(VISITOR);
  });
});

describe('fiyatın görüntüleyen ekseni — vitrin kapısından', () => {
  it('ziyaretçi perakende fiyat görür', async () => {
    expect(await birimFiyat(null)).toBe(B2C_FIYAT);
  });

  it('ONAYLI B2B müşteri toptan fiyat görür', async () => {
    // Zincirin karşılıksız kalan son adımı buydu: başvuru → kontrol kartı → onay → "toptan fiyat
    // açılır". Onay veriliyordu, fiyat açılmıyordu.
    const customerId = await newCustomer({ company: true, approved: true });
    expect(await birimFiyat(customerId)).toBe(B2B_FIYAT);
  });

  it('ONAYSIZ şirket perakende fiyat görür — toptan liste doğrulanmamış kayda açılmaz', async () => {
    // DOMAIN §10 ve asıl riskli dal bu: SIRET herkese açıktır, şirket künyesi girmek toptancı
    // olmak değildir. Burası gevşerse form dolduran herkes toptan fiyattan alışveriş yapar.
    const customerId = await newCustomer({ company: true, approved: false });
    expect(await birimFiyat(customerId)).toBe(B2C_FIYAT);
  });

  it('HİÇ BAŞVURMAMIŞ şirket de perakende görür — `null` onay DEĞİLDİR', async () => {
    // `b2b_approved` üç değerli ve `null` "hiç sorulmadı" demek. `!== false` gibi bir kontrol
    // yazılsaydı bu satır sessizce toptan fiyat açardı (CLAUDE §1: ölçülemeyen değer sıfır değildir).
    const customerId = await newCustomer({ company: true, approved: null });
    expect(await birimFiyat(customerId)).toBe(B2C_FIYAT);
  });

  it('müşteriye ÖZEL fiyat kanal listesini yener', async () => {
    // İkinci sessiz açık: kimlik verilmeyince `findApplicableMap` özel fiyat satırlarını hiç
    // sorgulamıyordu, yani `price.customer_id` kolonu ve onu yazan operasyon ekranı vardı ama
    // vitrinde hiçbir karşılığı yoktu.
    const customerId = await newCustomer({ company: true, approved: true });
    await new PriceService(db).setPrice({ variantId, channel: 'b2b', customerId, amountCents: OZEL_FIYAT });
    expect(await birimFiyat(customerId)).toBe(OZEL_FIYAT);
  });
});

/**
 * KANAL KURALININ KENDİSİ — DB'siz, çünkü ikinci çağıranı fiyat sormuyor (24.08 · MB-63).
 *
 * Yukarıdaki testler kuralı **fiyat üzerinden** doğruluyor ve doğru olan da oydu: kod okunarak
 * değil, müşterinin gördüğü sayı sorularak. Ama `effectiveChannelOf` artık ayrı bir kapı ve ikinci
 * çağıranı **analitik kapısı** — o hiç fiyat okumuyor, yalnız olayın kanalını yazıyor.
 *
 * Yani bu kural bozulduğunda fiyat testleri hâlâ yeşil kalabilir ve tek belirti, defterde onaysız
 * şirketlerin `b2b` diye sayılması olur — hiçbir yerde hata vermeden, üstelik kanal kırılımına
 * bakan herkesi yanıltarak. Aynı dosyada duruyorlar çünkü konu tek: "kim soruyor".
 */
describe('effectiveChannelOf', () => {
  it('birey B2C', () => {
    expect(effectiveChannelOf({ type: 'individual', b2bApproved: null })).toBe('b2c');
  });

  it('ONAYLI şirket B2B', () => {
    expect(effectiveChannelOf({ type: 'company', b2bApproved: true })).toBe('b2b');
  });

  it('ONAYSIZ şirket B2C — şirket olmak yetmez', () => {
    expect(effectiveChannelOf({ type: 'company', b2bApproved: false })).toBe('b2c');
  });

  it('HİÇ BAŞVURMAMIŞ şirket de B2C — `null` onay DEĞİLDİR', () => {
    expect(effectiveChannelOf({ type: 'company', b2bApproved: null })).toBe('b2c');
  });

  it('onaylı ama şirket OLMAYAN kayıt B2B olmaz — iki koşul birlikte aranır', () => {
    // Veri bir gün tutarsız olabilir (onay bayrağı kalmış, tür bireye dönmüş). Kapının önce türe
    // bakması, o hâlde toptan fiyatın açılmamasını garanti ediyor.
    expect(effectiveChannelOf({ type: 'individual', b2bApproved: true })).toBe('b2c');
  });

  it('TÜRÜ BİLİNMEYEN kayıt B2C — bilinmeyen, ayrıcalık DEĞİLDİR', () => {
    expect(effectiveChannelOf({ type: null, b2bApproved: true })).toBe('b2c');
  });
});

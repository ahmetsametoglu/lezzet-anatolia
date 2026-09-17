import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductFamilyService, ProductService } from './product.service';

/**
 * Yayın kısıtı veride — `product_publish_requires_all_locales`: yedek dil zinciri eksik çeviriyi sessizce kapattığı için kural
 * yazan her yolu (form, asistan, seed) kapsamalı. Cümlenin doğruluğu motorun testinde (`domain-core/catalog/publish.test.ts`),
 * burada kapının varlığı sınanır.
 */
const db = serviceDb();
const products = new ProductService(db);

const stamp = Date.now();
let categoryId: string;
let familyId: string;
const productIds: string[] = [];

const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });

/** Yayına hazır ürünün tam gövdesi — testler bunun ÜSTÜNE eksik yazıp kapıyı zorluyor. */
const tamGovde = () => ({
  name: ucDil(`Yayın ürünü ${stamp}`),
  description: ucDil('Üç dilde dolu açıklama'),
  ingredients: ucDil('Un, su, tuz'),
  storageInstructions: ucDil('-18°C saklayın'),
  nutrition: null,
  categoryId,
});

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Yayın testi ${stamp}` } })).id;
  // Aile ADI düz metin (dil-bağımsız iç ad); çok dilli olan ÜYENİN etiketidir (`family_label`).
  familyId = (await new ProductFamilyService(db).insert({ name: `Yayın ailesi ${stamp}` })).id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds, familyIds: [familyId], categoryIds: [categoryId] });
});

/** Ürünü kurar ve teardown listesine yazar — düşen testte bile satır geride kalmasın. */
async function kur(fields: Parameters<ProductService['create']>[0]) {
  const { product } = await products.create(fields);
  productIds.push(product.id);
  return product;
}

describe('ürün yayın kısıtı — veride', () => {
  /**
   * Yeni ürün aday doğar (kolonun varsayılanı) — kısıtın ön şartı: varsayılan `active` olsaydı üç dili dolmamış her yeni ürün
   * kısıta çarpar, formu atlayan yazan da ürünü beyansız satışa doğururdu.
   */
  it('yeni ürün ADAY doğar — tek dilli ad yeter, kısıt aranmaz', async () => {
    const product = await kur({ name: { tr: `Aday ürün ${stamp}` }, categoryId });
    expect(product.status).toBe('candidate');
  });

  it('üç dili TAM ürün yayına alınabilir', async () => {
    const product = await kur({ ...tamGovde(), status: 'active' });
    expect(product.status).toBe('active');
  });

  it('ADI tek dilliyken yayına ALINAMAZ', async () => {
    await expect(kur({ ...tamGovde(), name: { tr: `Yalnız Türkçe ${stamp}` }, status: 'active' })).rejects.toThrow();
  });

  it('AÇIKLAMASI eksikken yayına ALINAMAZ', async () => {
    await expect(kur({ ...tamGovde(), description: { tr: 'Yalnız Türkçe', fr: 'FR var' }, status: 'active' })).rejects.toThrow();
  });

  /**
   * Boş dize dolu sayılmaz: `{fr: ''}` bir anahtar taşır ve varlığa bakan kontrol onu dolu sayardı, okuma katmanı ise onu atlayıp
   * Türkçeye düşer — `has_all_locales` bu aralık için var.
   */
  it('BOŞ DİZE yayını açmaz — anahtarın varlığı yetmez', async () => {
    await expect(kur({ ...tamGovde(), description: { tr: 'Var', fr: '   ', de: 'Da' }, status: 'active' })).rejects.toThrow();
  });

  /**
   * **YASAL BEYAN da kapsamda** (INCO): Fransızcası boş bir içindekiler listesi, Fransız müşteri
   * için yok hükmündedir — üstelik gıda ve alerjen bilgisi orada.
   */
  it('İÇİNDEKİLER ya da SAKLAMA metni eksikken yayına ALINAMAZ', async () => {
    await expect(kur({ ...tamGovde(), ingredients: null, status: 'active' })).rejects.toThrow();
    await expect(kur({ ...tamGovde(), storageInstructions: { tr: 'Dondurucuda' }, status: 'active' })).rejects.toThrow();
  });

  it('AİLE ÜYESİNDE etiket de üç dilde aranır; ailesizde aranmaz', async () => {
    await expect(
      kur({ ...tamGovde(), familyId, familyLabel: { tr: 'Limonlu' }, status: 'active' }),
    ).rejects.toThrow();

    const uye = await kur({ ...tamGovde(), familyId, familyLabel: ucDil('Limonlu'), status: 'active' });
    expect(uye.status).toBe('active');
  });

  /**
   * Görsel alt metni yayına engel değil: formda alanı yok ve boşsa müşteride üç dilde zorunlu ürün adına düşer.
   * Test bunu sabitler; alt metin zorunlu olacaksa önce formda alanı açılmalı.
   */
  it('görselli ama ALT METİNSİZ ürün yayına alınabilir — yedeği ürün adıdır', async () => {
    const product = await kur({ ...tamGovde(), imageKey: `urun/${stamp}.webp`, imageAlt: null, status: 'active' });
    expect(product.status).toBe('active');
  });

  /**
   * **YAYINDAN ÇIKARMAK her zaman serbest.** Kısıt `status <> 'active'` ile başlıyor: eksik künyeli
   * bir ürün pasife çekilebilmeli, yoksa operatör onu ne düzeltebilir ne gizleyebilirdi.
   */
  it('eksik künyeli ürün PASİFE çekilebilir — kısıt yalnız yayına bakar', async () => {
    const product = await kur({ name: { tr: `Pasife çekilen ${stamp}` }, categoryId });
    const guncel = await products.updateDetails(product.id, { status: 'passive' });
    expect(guncel.status).toBe('passive');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductFamilyService, ProductService } from './product.service';

/**
 * **YAYIN ÜÇ DİL İSTER** (05.36 · mobil şeridin talebi 25.08) — `product_publish_requires_all_locales`.
 *
 * Ölçülmüş arıza: Fransızcası olmayan ürün Fransız müşteriye SESSİZCE Türkçe gösteriliyordu.
 * `resolveLocalizedText` yedek zinciri (seçili → TR → FR → DE) eksikliği kendiliğinden kapatıyor ve
 * kapattığı için de kimse fark etmiyor — ne ekranda hata var ne logda iz.
 *
 * **Bu dosya kuralın VERİDE durduğunu sınıyor**, formda değil. Sebep `MB-22a`/`09.6`in dersi:
 * üründe en az üç yazan var (operasyon formu, asistan dilekçesi, seed) ve *"yüzeyde durdurulan bir
 * kuralın ikinci bir yazma yolu varsa, kural yok demektir"*. Motorun kendi testi ayrı
 * (`domain-core/catalog/publish.test.ts`); orada cümlenin doğruluğu, burada kapının varlığı sınanır.
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
   * **ADAY DOĞAR** — kolonun varsayılanı da bunu söylüyor (`candidate`).
   *
   * Bu, kısıtın ön şartı: varsayılan `active` olsaydı üç dili henüz dolmamış her yeni ürün doğar
   * doğmaz kısıta çarpardı ve operatör ürünü hiç oluşturamazdı. Form zaten `candidate` gönderiyordu
   * ama kolon `active` diyordu — formu atlayan yazan (asistan dilekçesi, servis çağrısı) ürünü
   * fiyatsız ve beyansız hâlde SATIŞA doğuruyordu (05.36'da düzeltildi).
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
   * **BOŞ DİZE dolu sayılmaz** — arızanın çekirdeği ve `has_all_locales`ın var oluş sebebi.
   * `{fr: ''}` bir anahtar TAŞIR, yani `? 'fr'` ile soran bir kontrol onu dolu sayardı; okuma
   * katmanı ise onu atlayıp Türkçeye düşer. Sessiz sapma tam olarak bu aralıkta doğuyordu.
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
   * **GÖRSEL ALT METNİ yayına engel DEĞİL** ve bu ölçülerek karara bağlandı (27.08).
   *
   * Alan ürün formunda hiç yok, bilerek yok: boşsa müşteride ürün ADINA düşüyor. Kısıta konsaydı
   * operatörün dolduramadığı bir alan yüzünden hiçbir ürün yayınlanamazdı. Ad zaten üç dilde
   * zorunlu, yani yedek de doğru dile düşüyor. Test bunu SABİTLİYOR: bir gün alt metni zorunlu
   * yapmak istenirse önce formda alan açılmalı.
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

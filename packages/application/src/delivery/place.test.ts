import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { resolveAddressCountry, resolvePlaceForPostalCode } from './place';

/**
 * Posta kodu → yer çözümü, paket kapısı: kod normalize edilerek sorulur, bölgeler aktiflik süzgecisiz okunur ve kendi bölge tablomuz
 * referansın üstündedir; karar dalları motorun birim testindedir. Kodlar ne FR ne DE referansında olan `009xx`/`008xx`/`007xx`
 * bandından damgalıdır ve kargo dalı iddia edilmez, çünkü ülkenin kargo deposu paylaşılan DB'nin küresel durumudur.
 */
const db = serviceDb();
const zones = new DeliveryZoneService(db);

const stamp = Date.now();
const son2 = String(stamp).slice(-2);
/** Aktif bölgeye bağlı kod — rota beklenir. */
const rotaKodu = `009${son2}`;
/** Hiçbir kayıtta olmayan kod — unknown beklenir. */
const bilinmezKod = `008${son2}`;
/** PASİF bölgeye bağlı kod — "tanımadık" DEĞİL (ülke kayıttan türer), rota da değil. */
const pasifKod = `007${son2}`;

let warehouseId: string;
let zoneId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'YER' })).id;

  const aktif = await zones.insert({ name: `Yer çözüm bölgesi ${stamp}`, warehouseId, weekdays: [2] });
  zoneId = aktif.id;
  await zones.replacePostalCodes(aktif.id, [{ country: 'FR', postalCode: rotaKodu }]);

  const pasif = await zones.insert({ name: `Yer çözüm pasif ${stamp}`, warehouseId, weekdays: [5], isActive: false });
  await zones.replacePostalCodes(pasif.id, [{ country: 'FR', postalCode: pasifKod }]);
});

afterAll(async () => {
  // Bölgeler depoya bağlı ve purge sırayı biliyor (kodları CASCADE) — elle silinecek şey yok.
  await purgeTestData(db, { warehouseIds: [warehouseId] });
});

describe('posta kodundan yer çözümü (paket kapısı)', () => {
  it('aktif bölgenin kodu rotaya düşer; ülke sorulmadan kendi kaydımızdan türer', async () => {
    const resolution = await resolvePlaceForPostalCode(db, rotaKodu, 'lezzet');
    expect(resolution.kind).toBe('route');
    if (resolution.kind !== 'route') return;
    expect(resolution.warehouseId).toBe(warehouseId);
    expect(resolution.zoneId).toBe(zoneId);
    expect(resolution.country).toBe('FR');
    // Kendi kaydımız bölgeyi bilir, coğrafi adı bilmez; ad uydurulmaz.
    expect(resolution.placeName).toBeNull();
  });

  it('kod NORMALİZE edilerek sorulur — boşluklu giriş aynı yere düşer', async () => {
    const resolution = await resolvePlaceForPostalCode(db, ` 009 ${son2} `, 'lezzet');
    expect(resolution.kind).toBe('route');
  });

  it('hiçbir kayıtta olmayan kod unknown — büyük olasılıkla yazım hatası', async () => {
    expect((await resolvePlaceForPostalCode(db, bilinmezKod, 'lezzet')).kind).toBe('unknown');
  });

  it('pasif bölgenin kodu "tanımadık" DEĞİLDİR — bölgeler süzgeçsiz okunur (19.16a)', async () => {
    const resolution = await resolvePlaceForPostalCode(db, pasifKod, 'lezzet');
    // Rota kapalı: motor pasif bölgeyi rota saymaz ama ülkeyi kayıttan türetir. Kargo mu yapılandırma eksiği mi, paylaşılan DB'deki FR
    // kargo deposuna bağlıdır; yanlış olan yalnız `unknown` ya da `route` olurdu.
    expect(resolution.kind).not.toBe('unknown');
    expect(resolution.kind).not.toBe('route');
  });
});

/**
 * Adresin ülkesi koddan türer, beyandan değil: çözüm `postal_code_place`e bakar, depo tablosuna değil, çünkü adresin ülkesi coğrafi
 * bir gerçektir ve hiçbir kod kaydı reddettirmez. Buradaki kodlar referansta yok, çok ülkeli kodun dalı motorun birim testindedir.
 */
describe('adresin ülkesi (21.28)', () => {
  it('referansın tanımadığı kodda müşterinin SEÇİMİ geçerlidir — doğrulayacak veri yok', async () => {
    expect(await resolveAddressCountry(db, { postalCode: bilinmezKod, country: 'DE' })).toBe('DE');
  });

  it('ne kod tanınıyor ne seçim var: `null` — kayıt yine geçer, kolon varsayılanına düşer', async () => {
    // Reddetmek yanlış olurdu: müşteri adresini dilediği yere girer, oraya gidip gidemediğimiz sipariş anının sorusudur.
    expect(await resolveAddressCountry(db, { postalCode: bilinmezKod })).toBeNull();
  });

  it('kod BİZİM bölge tablomuzda ama referansta yoksa yine `null` — depo verisi ülkeyi belirlemez', async () => {
    // `rotaKodu` aktif bölgemize bağlı, yani `resolvePlaceForPostalCode` onu FR olarak ÇÖZER.
    // Bu kapı ise referansa bakıyor ve orada yok: adresin ülkesi hizmet alanımızdan türetilmez.
    expect(await resolveAddressCountry(db, { postalCode: rotaKodu })).toBeNull();
  });
});

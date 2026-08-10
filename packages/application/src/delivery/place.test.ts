import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { resolveAddressCountry, resolvePlaceForPostalCode } from './place';

/**
 * Posta kodu → yer çözümü, PAKET kapısı — girdilerin GERÇEKTEN okunduğunun kanıtı.
 *
 * Karar dallarının tamamı motorun birim testinde (`domain-core/delivery/warehouse-resolve.test`);
 * burada sınanan şey kompozisyon: kod normalize edilerek sorulur, bölgeler AKTİFLİK SÜZGECİSİZ
 * okunur (19.16a — pasif bölgenin kodu "tanımadık" değildir) ve kendi bölge tablomuz referansın
 * üstündedir.
 *
 * Paylaşılan DB (CLAUDE.md §4b): kodlar `009xx`/`008xx`/`007xx` bandından damgalı — bu bant ne
 * FR ne DE posta kodu referansında var (FR 01000'den, DE 01067'den başlar), yani çözüm yalnız BU
 * dosyanın kurduğu bölge satırlarından etkilenir. Kargo dalı BİLEREK iddia edilmiyor: ülkenin
 * kargo deposu küresel durumdur, ona bakan bir iddia başka ajanın verisiyle oynar.
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
    const resolution = await resolvePlaceForPostalCode(db, rotaKodu);
    expect(resolution.kind).toBe('route');
    if (resolution.kind !== 'route') return;
    expect(resolution.warehouseId).toBe(warehouseId);
    expect(resolution.zoneId).toBe(zoneId);
    expect(resolution.country).toBe('FR');
    // Kendi kaydımız bölgeyi bilir, coğrafi adı bilmez — ad UYDURULMAZ (19.16a).
    expect(resolution.placeName).toBeNull();
  });

  it('kod NORMALİZE edilerek sorulur — boşluklu giriş aynı yere düşer', async () => {
    const resolution = await resolvePlaceForPostalCode(db, ` 009 ${son2} `);
    expect(resolution.kind).toBe('route');
  });

  it('hiçbir kayıtta olmayan kod unknown — büyük olasılıkla yazım hatası', async () => {
    expect((await resolvePlaceForPostalCode(db, bilinmezKod)).kind).toBe('unknown');
  });

  it('pasif bölgenin kodu "tanımadık" DEĞİLDİR — bölgeler süzgeçsiz okunur (19.16a)', async () => {
    const resolution = await resolvePlaceForPostalCode(db, pasifKod);
    // Rota kapalı: motor pasif bölgeyi rota saymaz ama ülkeyi kayıttan türetir. Sonuç kargo mu
    // (`shipping`) yapılandırma eksiği mi (`unresolved/no_shipping_warehouse`) — o, paylaşılan
    // DB'de FR kargo deposunun var olup olmadığına bağlı KÜRESEL durumdur; iki hâl de doğrudur,
    // yanlış olan tek şey `unknown`/`route` olurdu. Dalların kilidi motorun birim testinde.
    expect(resolution.kind).not.toBe('unknown');
    expect(resolution.kind).not.toBe('route');
  });
});

/**
 * ADRESİN ÜLKESİ — koddan türer, beyandan değil (21.28).
 *
 * ── ADRES DEFTERİ HİZMET ALANINI BİLMEZ (kullanıcı kararı 10.08) ─────────────
 * Kritik iddia: bu çözüm `postal_code_place`e bakar, DEPO tablosuna DEĞİL. Kardeşi
 * `resolvePlaceForPostalCode` adayları hizmet ülkelerimizle kesiştiriyor (`activeCountries`) ve o
 * doğru — "bu adrese nasıl gideriz" sorusunun cevabı; ama adresin ÜLKESİ coğrafi bir gerçektir ve
 * deponun aktifliğinden etkilenemez. Hiçbir kod da kaydı reddettirmez.
 *
 * Kodlar üstteki bandın damgalıları ve İKİSİ DE referansta YOK (`009xx`/`008xx` bandı ne FR ne DE
 * dökümünde var) — yani bu dosyada sınanan dal "referans tanımıyor" dalıdır. Çok ülkeli kodun
 * (610 tane) dalı motorun birim testinde: paylaşılan DB'de ikinci bir ülke kaydı açmak başka
 * ajanın yer çözümünü oynatırdı.
 */
describe('adresin ülkesi (21.28)', () => {
  it('referansın tanımadığı kodda müşterinin SEÇİMİ geçerlidir — doğrulayacak veri yok', async () => {
    expect(await resolveAddressCountry(db, { postalCode: bilinmezKod, country: 'DE' })).toBe('DE');
  });

  it('ne kod tanınıyor ne seçim var: `null` — kayıt yine geçer, kolon varsayılanına düşer', async () => {
    // Reddetmek YANLIŞ olurdu: müşteri adresini dilediği yere girer, oraya gidip gidemediğimiz
    // sipariş anının sorusudur (kullanıcı kararı 10.08).
    expect(await resolveAddressCountry(db, { postalCode: bilinmezKod })).toBeNull();
  });

  it('kod BİZİM bölge tablomuzda ama referansta yoksa yine `null` — depo verisi ülkeyi belirlemez', async () => {
    // `rotaKodu` aktif bölgemize bağlı, yani `resolvePlaceForPostalCode` onu FR olarak ÇÖZER.
    // Bu kapı ise referansa bakıyor ve orada yok: adresin ülkesi hizmet alanımızdan türetilmez.
    expect(await resolveAddressCountry(db, { postalCode: rotaKodu })).toBeNull();
  });
});

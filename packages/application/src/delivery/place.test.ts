import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { resolvePlaceForPostalCode } from './place';

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

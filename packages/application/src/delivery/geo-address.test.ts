import { beforeAll, describe, expect, it } from 'vitest';
import { PostalCodePlaceService, serviceDb } from '@lezzet/database';
import { resolveAddressPoint } from './geo-address';

/**
 * **Adres koordinatının tek kapısı** (11.9) — `resolveAddressPoint`.
 *
 * Dosya entegrasyonda, çünkü makullük süzgecinin referansı veritabanındadır: posta kodunun merkezi
 * (`postal_code_place`). Süzgeci taklit bir merkezle sınamak, sınanan şeyi ortadan kaldırırdı —
 * gerçek soru "elimizdeki referans veriyle bu aday makul mü".
 *
 * **Hiçbir satır YAZILMIYOR:** fonksiyon saf bir künye döndürüyor, yazma çağıranın işi. Test de bu
 * yüzden okuma-yalnız ve paylaşılan veritabanını kirletmiyor (`CLAUDE §4b`).
 *
 * Referans kodlar migration'dan gelir (`0034_postal_code_place_data.sql`), seed'den değil — yani
 * `db:reset` sonrası da yerindedirler.
 */
const db = serviceDb();

/** Strasbourg merkezi — süzgecin referans noktası. */
let strasbourg: { lat: number; lng: number };

beforeAll(async () => {
  const rows = await new PostalCodePlaceService(db).findByPostalCode('67000');
  const withPoint = rows.find((row) => row.lat !== null && row.lng !== null);
  if (!withPoint) throw new Error('referans eksik: 67000 posta kodunun merkezi yok (0034 migration yüklü mü?)');
  strasbourg = { lat: Number(withPoint.lat), lng: Number(withPoint.lng) };
});

/** Düzenleme dalının "bugünkü hâli" — noktası çözülmüş bir satır. */
const cozulmus = {
  line1: '12 rue des Fleurs',
  postalCode: '67000',
  city: 'Strasbourg',
  geo: {
    lat: 48.5839,
    lng: 7.7455,
    geoPrecision: 'housenumber' as const,
    geoSource: 'ban' as const,
    geoAt: '2026-08-01T10:00:00.000Z',
    geoCheckedAt: '2026-08-01T10:00:00.000Z',
    geoAttempts: 0,
  },
};

describe('adres koordinatı · istemcinin adayı', () => {
  it('makul aday YAZILIR — öneriden gelen koordinat için ikinci bir ağ turu yok', async () => {
    /*
      Asıl yol budur (kullanıcı düzeltmesi 31.08): BAN koordinatı öneri cevabında zaten geliyor ve
      bugüne dek çöpe atılıyordu. Tarama işi bunun TELAFİSİ, birincil yolu değil.
    */
    const geo = await resolveAddressPoint(db, {
      candidate: { lat: strasbourg.lat + 0.004, lng: strasbourg.lng + 0.004, precision: 'housenumber' },
      postalCode: '67000',
    });

    expect(geo.lat).toBeCloseTo(strasbourg.lat + 0.004, 5);
    expect(geo.geoPrecision).toBe('housenumber');
    // Kaynak `ban`: kademe ve kaynak noktayla BİRLİKTE yazılır — nokta olmadan kademe yazmak
    // `address_geo_meta` kısıtını ihlal eder, kademesiz nokta ise ölçümün inceliğini kaybeder.
    expect(geo.geoSource).toBe('ban');
    expect(geo.geoAt).not.toBeNull();
    expect(geo.geoAttempts).toBe(0);
  });

  it('merkezden UZAK aday yazılmaz ve satır tarama kuyruğuna düşer', async () => {
    // İstemcinin taşıdığı sayı bir BEYANDIR. Paris'in koordinatı 67000 için makul değildir;
    // yanlış bir koordinat koordinatsızlıktan kötüdür — koordinatsız durak "sırasız" der ve GÖRÜNÜR,
    // yanlış koordinatlı durak kuryeyi başka şehre yollar ve hiçbir yerde hata vermez.
    const geo = await resolveAddressPoint(db, {
      candidate: { lat: 48.8566, lng: 2.3522, precision: 'housenumber' },
      postalCode: '67000',
    });

    expect(geo).toEqual({
      lat: null,
      lng: null,
      geoPrecision: null,
      geoSource: null,
      geoAt: null,
      geoCheckedAt: null,
      geoAttempts: 0,
    });
  });

  it('merkezi BİLİNMEYEN kodda süzgeç kabul edicidir — ölçülemeyen değer "ret" değildir', async () => {
    /*
      Kendi referansı olmayan bir posta kodu yüzünden gerçek bir koordinatı atmak, elde olan tek
      ölçümü kaybetmek olurdu. Ölçemiyorsak cevabımız "hayır" değil, "bilmiyorum" — ve bilmediğimiz
      için elimizdekini tutuyoruz.
    */
    const geo = await resolveAddressPoint(db, {
      candidate: { lat: 48.5, lng: 7.7, precision: 'street' },
      postalCode: '00000',
    });

    expect(geo.lat).toBe(48.5);
    expect(geo.geoPrecision).toBe('street');
  });
});

describe('adres koordinatı · düzenleme', () => {
  it('adres alanları DEĞİŞMEDİYSE nokta korunur — boşuna yeniden çözülmez', async () => {
    const geo = await resolveAddressPoint(db, {
      postalCode: '67000',
      current: cozulmus,
      // Aynı alanlar, yalnız boşluk ve büyük harf farkıyla: normalize karşılaştırma bunu "değişmedi"
      // saymalı, yoksa her kayıt turu noktayı boşa düşürürdü.
      next: { line1: '12  Rue des Fleurs ', postalCode: '67000', city: 'STRASBOURG' },
    });

    expect(geo).toEqual(cozulmus.geo);
  });

  it('adres DEĞİŞTİYSE nokta DÜŞER — en sinsi arıza budur', async () => {
    /*
      Müşteri adresini düzeltir, nokta eski kapıda kalır, kurye eski kapıya sıralanır. Hiçbir yerde
      hata görünmez: adres doğru yazılıdır, koordinat da bir koordinattır. Yalnız yanlış kapınındır.
    */
    const geo = await resolveAddressPoint(db, {
      postalCode: '67100',
      current: cozulmus,
      next: { line1: '5 rue du Marais', postalCode: '67100', city: 'Strasbourg' },
    });

    expect(geo.lat).toBeNull();
    expect(geo.geoSource).toBeNull();
    // Sayaç SIFIRLANIR: satır kuyruğa taze girer. Eski denemeler yeni adrese ait değil.
    expect(geo.geoAttempts).toBe(0);
  });

  it('yeni kayıtta aday yoksa satır noktasız doğar ve kuyruğa girer', async () => {
    const geo = await resolveAddressPoint(db, { postalCode: '67000' });

    expect(geo.lat).toBeNull();
    expect(geo.geoCheckedAt).toBeNull();
  });
});

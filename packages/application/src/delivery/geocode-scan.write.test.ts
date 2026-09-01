import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { geocodeAddressesScan } from './geocode-scan';
import { fakeGeocoder } from './geocode.testkit';

/**
 * **Taramanın YAZMA yarısı** (11.9) — kararın satıra dönüştüğü an.
 *
 * Kardeş dosya `geocode-scan.test.ts` saf yarıyı sınıyor (`nextGeoState`) ve künyesinde şunu
 * yazıyor: *"gerçek yazmayı taklit edemez (şema doğrulaması, hata dönüşü). O yarı entegrasyonun
 * işi."* Burası tam olarak o yarı.
 *
 * ── AĞA ÇIKMAZ, KÜRESEL KUYRUĞA DA DOKUNMAZ ─────────────────────────────────
 * Servis `fakeGeocoder` ile taklit ediliyor ve taranacak satırlar `rows` ile ELDEN veriliyor.
 * İkincisi bir kolaylık değil: `rows` verilmeseydi iş küresel kuyruğu tarar ve sahte cevabı BAŞKA
 * ŞERİTLERİN adreslerine yazardı (`translate-user-text` arızası, 03.08 — 29 gerçek satır bozulmuştu).
 */
const db = serviceDb();
const addresses = new AddressService(db);

const stamp = Date.now();
let customerId: string;
const createdProfiles: string[] = [];

beforeAll(async () => {
  const customer = await new UserProfileService(db).insert({
    name: 'Tarama Müşterisi',
    email: `tarama-${stamp}@example.test`,
  });
  customerId = customer.id;
  createdProfiles.push(customer.id);
});

afterAll(async () => {
  // Adres profil cascade'inden gidiyor — elle silme YOK (`cleanup.ts` sırayı biliyor).
  await purgeTestData(db, { profileIds: createdProfiles });
});

let sayac = 0;
/** Koordinatsız, kuyrukta duran taze bir adres satırı. */
async function pendingAddress(over: { geoAttempts?: number; lat?: number; lng?: number } = {}) {
  sayac += 1;
  return addresses.insert({
    customerId,
    recipient: `Alıcı ${sayac}`,
    phone: '+33600000001',
    line1: `${sayac} rue du Scan`,
    postalCode: '67100',
    city: 'Strasbourg',
    ...over,
  });
}

describe('tarama · satıra yazılanlar', () => {
  it('ÇÖZÜLEN adresin noktası ve künyesi tek yazımda satıra iner', async () => {
    const row = await pendingAddress();

    const result = await geocodeAddressesScan(db, {
      rows: [row],
      geocoder: fakeGeocoder({
        status: 'ok',
        point: { lat: 48.5839, lng: 7.7455 },
        precision: 'housenumber',
        source: 'ban',
        score: 0.97,
      }),
    });

    expect(result).toEqual({ scanned: 1, located: 1, noMatch: 0, deferred: 0 });

    const [after] = await addresses.listByIds([row.id]);
    expect(Number(after!.lat)).toBeCloseTo(48.5839, 5);
    expect(Number(after!.lng)).toBeCloseTo(7.7455, 5);
    expect(after!.geoPrecision).toBe('housenumber');
    expect(after!.geoSource).toBe('ban');
    expect(after!.geoAt).not.toBeNull();
    // Sayaç SIFIRLANIR: satır çözüldü, geçmiş denemeler artık bir şey anlatmıyor.
    expect(after!.geoAttempts).toBe(0);
  });

  it('CEVAPLI ret sayacı artırır — adres muhtemelen hatalı, satır seyrekleşsin', async () => {
    const row = await pendingAddress({ geoAttempts: 1 });

    const result = await geocodeAddressesScan(db, { rows: [row], geocoder: fakeGeocoder({ status: 'no_match' }) });

    expect(result).toMatchObject({ noMatch: 1, located: 0 });
    const [after] = await addresses.listByIds([row.id]);
    expect(after!.geoAttempts).toBe(2);
    expect(after!.lat).toBeNull();
    expect(after!.geoCheckedAt).not.toBeNull();
  });

  it('GEÇİCİ arıza sayacı TÜKETMEZ — servisin düştüğü öğleden sonra yüzlerce adresi damgalamaz', async () => {
    const row = await pendingAddress({ geoAttempts: 1 });

    const result = await geocodeAddressesScan(db, { rows: [row], geocoder: fakeGeocoder({ status: 'unavailable' }) });

    expect(result).toMatchObject({ deferred: 1, noMatch: 0 });
    const [after] = await addresses.listByIds([row.id]);
    // Ayrım burada: damga ilerledi (bir daha hemen denenmesin) ama sayaç durdu (kalıcı
    // "çözülemez" damgası YEMESİN). İkisi karışsaydı geçici bir kesinti kalıcı bir kayba dönerdi.
    expect(after!.geoAttempts).toBe(1);
    expect(after!.geoCheckedAt).not.toBeNull();
    expect(after!.lat).toBeNull();
  });

  it('desteklenmeyen ülke de sayacı tüketmez — ikinci kaynak takıldığı gün çözülür', async () => {
    const row = await pendingAddress();

    await geocodeAddressesScan(db, { rows: [row], geocoder: fakeGeocoder({ status: 'unsupported_country' }) });

    const [after] = await addresses.listByIds([row.id]);
    expect(after!.geoAttempts).toBe(0);
  });
});

describe('tarama · kuyruğun kendisi', () => {
  it('kuyruk YALNIZ noktasız ve eşiği aşmamış satırları getirir', async () => {
    await pendingAddress();

    const queue = await addresses.listMissingGeo({ limit: 200, maxAttempts: 3 });

    /* İki yüklem birden: noktası olan satır kuyruğa GİRMEZ (yoksa çözülmüş adresler sonsuza dek
       yeniden sorulurdu) ve eşiği aşan satır da girmez (yoksa hatalı bir adres her turda servisi
       döverdi). Küresel sayıya bakılmıyor — başka şeridin verisi sayıyı oynatır (`CLAUDE §4b`);
       bakılan şey kümenin HER ÜYESİNİN taşıdığı özellik. */
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((row) => row.lat === null && row.lng === null)).toBe(true);
    expect(queue.every((row) => row.geoAttempts < 3)).toBe(true);
  });

  it('çözülen satır kuyruğun ölçütünü ARTIK KARŞILAMAZ — ikinci tur onu seçmez', async () => {
    // İdempotentlik iddiası: taramanın "aynı satırı iki kez çözmemesi" bir sayaç hilesi değil,
    // kuyruk yükleminin doğal sonucu. Kanıtı satırın kendi hâli.
    const row = await pendingAddress();
    await geocodeAddressesScan(db, {
      rows: [row],
      geocoder: fakeGeocoder({
        status: 'ok',
        point: { lat: 48.6, lng: 7.75 },
        precision: 'street',
        source: 'ban',
        score: 0.8,
      }),
    });

    const [after] = await addresses.listByIds([row.id]);
    expect(after!.lat).not.toBeNull();

    const queue = await addresses.listMissingGeo({ limit: 200, maxAttempts: 3 });
    expect(queue.map((r) => r.id)).not.toContain(row.id);
  });

  it('eşiği DOLDURMUŞ satır kuyruktan düşer', async () => {
    const yorgun = await pendingAddress({ geoAttempts: 3 });

    const queue = await addresses.listMissingGeo({ limit: 200, maxAttempts: 3 });

    expect(queue.map((r) => r.id)).not.toContain(yorgun.id);
  });
});

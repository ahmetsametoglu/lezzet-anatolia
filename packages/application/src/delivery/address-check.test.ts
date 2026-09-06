import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { checkAddress } from './address-check';
import { fakeGeocoder } from './geocode.testkit';

/**
 * **"Bu kapı var mı" kapısı** (11.11) — servisin cevabının SATIRA dönüşü.
 *
 * Kararın kendisi saf ve ayrı testli (`domain-core/delivery/address-verdict.test.ts`, 14 test);
 * burada sınanan şey ARADAKİ HER ŞEY: ikinci sorgunun ne zaman atıldığı, satıra ne yazıldığı, ve
 * kapının hiçbir hâlde satışı durdurmadığı.
 *
 * Servis taklit ediliyor — testler AĞA ÇIKMAZ.
 */
const db = serviceDb();
const addresses = new AddressService(db);

const stamp = Date.now();
let customerId: string;
const createdProfiles: string[] = [];

/** Kullanıcının ölçtüğü gerçek cevap: kapı yalnız Lingolsheim'de, Strasbourg'da yalnız sokak var. */
const LINGOLSHEIM = {
  label: '192c Rue du Maréchal Foch 67380 Lingolsheim',
  postalCode: '67380',
  city: 'Lingolsheim',
  precision: 'housenumber' as const,
  score: 0.973,
};

const SOKAK = {
  status: 'ok' as const,
  point: { lat: 48.589231, lng: 7.749851 },
  precision: 'street' as const,
  source: 'ban' as const,
  score: 0.717,
};

const KAPI = {
  status: 'ok' as const,
  point: { lat: 48.551249, lng: 7.669976 },
  precision: 'housenumber' as const,
  source: 'ban' as const,
  score: 0.973,
};

beforeAll(async () => {
  const customer = await new UserProfileService(db).insert({
    name: 'Doğrulama Müşterisi',
    email: `dogrulama-${stamp}@example.test`,
  });
  customerId = customer.id;
  createdProfiles.push(customer.id);
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdProfiles });
});

let sayac = 0;
async function adres(over: { postalCode?: string } = {}) {
  sayac += 1;
  return addresses.insert({
    customerId,
    recipient: `Alıcı ${sayac}`,
    phone: '+33600000003',
    line1: '192c Rue du Maréchal Foch',
    postalCode: over.postalCode ?? '67000',
    city: 'Strasbourg',
  });
}

const oku = async (id: string) => (await addresses.listByIds([id]))[0]!;

describe('checkAddress · kullanıcının vakası', () => {
  it('kapı BAŞKA kodda bulundu → teklif döner VE satıra yazılır', async () => {
    /*
      Ölçülmüş hâl: `192c Rue du Maréchal Foch` 67000 Strasbourg ile kaydedilmiş; kapı orada YOK,
      67380 Lingolsheim'de var. Bugüne dek sistem bunu sessizce kabul ediyordu.
    */
    const row = await adres();
    const fake = fakeGeocoder(SOKAK, { status: 'ok', candidates: [LINGOLSHEIM] });

    const outcome = await checkAddress(db, { addressId: row.id, geocoder: fake });

    expect(outcome).toEqual({
      status: 'wrong_postal_code',
      label: LINGOLSHEIM.label,
      // Teklifi UYGULAMAK için yapılandırılmış alanlar: etiketi ayrıştırmak kırılgan olurdu.
      postalCode: '67380',
      city: 'Lingolsheim',
    });
    // **Ve kayıt kalıcı:** etiket satırda duruyor — ekran teklifi buradan çizecek ve müşteri
    // düzeltmezse "uyarıldı ama düzeltmedi" kaydı da bu satırın kendisi olacak.
    expect((await oku(row.id)).geoAltLabel).toBe(LINGOLSHEIM.label);
  });

  it('kaba nokta da TAZE yazılır — bayat koordinat taze kararın yanında durmaz', async () => {
    const row = await adres();
    await checkAddress(db, {
      addressId: row.id,
      geocoder: fakeGeocoder(SOKAK, { status: 'ok', candidates: [LINGOLSHEIM] }),
    });

    const after = await oku(row.id);
    expect(after.geoPrecision).toBe('street');
    expect(Number(after.lat)).toBeCloseTo(48.589231, 5);
  });
});

describe('checkAddress · doğrulanan kapı', () => {
  it('kapı istenen kodda bulunduysa İKİNCİ SORGU HİÇ ATILMAZ', async () => {
    /* Maliyet burada: her adres için iki tur atmak servise saygısızlık olurdu ve bunu hiçbir çıktı
       ele vermez — sonuç aynı görünür, yalnız çağrı sayısı iki katına çıkar. */
    const row = await adres();
    const fake = fakeGeocoder(KAPI);

    const outcome = await checkAddress(db, { addressId: row.id, geocoder: fake });

    expect(outcome).toEqual({ status: 'confirmed' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.elsewhereCalls).toHaveLength(0);
  });

  it('doğrulanmış kapıda ÖNERİ TEMİZLENİR — çelişkili satır doğmaz', async () => {
    // Veri kısıtı (`address_geo_alt`) böyle bir satırı zaten reddediyor; kapı da onu üretmemeli.
    const row = await adres();
    await addresses.update({
      id: row.id,
      lat: 48.589231,
      lng: 7.749851,
      geoPrecision: 'street',
      geoSource: 'ban',
      geoAt: new Date().toISOString(),
      geoAltLabel: 'eski öneri',
    });

    await checkAddress(db, { addressId: row.id, geocoder: fakeGeocoder(KAPI) });

    const after = await oku(row.id);
    expect(after.geoAltLabel).toBeNull();
    expect(after.geoPrecision).toBe('housenumber');
  });
});

describe('checkAddress · teklif YOK ama uyarı var', () => {
  it('kapı hiçbir yerde bulunamadıysa yumuşak hâl — yeni yapı olabilir', async () => {
    const row = await adres();

    const outcome = await checkAddress(db, {
      addressId: row.id,
      geocoder: fakeGeocoder(SOKAK, { status: 'ok', candidates: [] }),
    });

    expect(outcome).toEqual({ status: 'street_only' });
    expect((await oku(row.id)).geoAltLabel).toBeNull();
  });

  it('HİÇ eşleşme yoksa nokta da yazılmaz — künye birlikte boşalır', async () => {
    const row = await adres();

    const outcome = await checkAddress(db, {
      addressId: row.id,
      geocoder: fakeGeocoder({ status: 'no_match' }, { status: 'ok', candidates: [] }),
    });

    expect(outcome).toEqual({ status: 'not_found' });
    const after = await oku(row.id);
    expect(after.lat).toBeNull();
    expect(after.geoPrecision).toBeNull();
    // Denenmiş olduğu yine de yazılı: damga ilerler, sayaç bu kapının işi değil (o taramanın).
    expect(after.geoCheckedAt).not.toBeNull();
  });
});

describe('checkAddress · FAIL-OPEN — satışı durdurmaz', () => {
  it('servis DÜŞERSE susulur ve satıra dokunulmaz', async () => {
    /* Kullanıcı kararı (02.09): doğrulama sipariş anında koşuyor, yani servisin düştüğü an
       checkout DURMAMALI. "Doğrulayamadım" ile "adres yanlış" ayrı şeylerdir. */
    const row = await adres();
    const önce = await oku(row.id);

    const outcome = await checkAddress(db, { addressId: row.id, geocoder: fakeGeocoder({ status: 'unavailable' }) });

    expect(outcome).toEqual({ status: 'unknown' });
    expect((await oku(row.id)).geoCheckedAt).toEqual(önce.geoCheckedAt);
  });

  it('İKİNCİ sorgu düşerse de susulur — yarım bilgiyle karar verilmez', async () => {
    const row = await adres();

    const outcome = await checkAddress(db, {
      addressId: row.id,
      geocoder: fakeGeocoder(SOKAK, { status: 'unavailable' }),
    });

    expect(outcome).toEqual({ status: 'unknown' });
    expect((await oku(row.id)).geoAltLabel).toBeNull();
  });

  it('ülkenin sağlayıcısı yoksa SUSULUR — bugün Almanya bu hâlde', async () => {
    // Hakkında hiçbir şey bilmediğimiz bir adresi "yanlış" diye göstermek, müşteriyi suçlamak olurdu.
    const row = await adres();

    const outcome = await checkAddress(db, {
      addressId: row.id,
      geocoder: fakeGeocoder({ status: 'unsupported_country' }),
    });

    expect(outcome).toEqual({ status: 'unknown' });
  });

  it('OLMAYAN adres istisna değil, adlı bir yokluk', async () => {
    const outcome = await checkAddress(db, {
      addressId: '00000000-0000-4000-8000-0000000009ee',
      geocoder: fakeGeocoder(KAPI),
    });

    expect(outcome).toEqual({ status: 'unknown' });
  });
});

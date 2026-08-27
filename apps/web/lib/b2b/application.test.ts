import { afterAll, describe, expect, it } from 'vitest';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { B2bApplicationInput, B2bCompanyFacts } from '@lezzet/domain-core';
import { submitB2bApplication } from './application';

/**
 * B2B başvurusunun YAZILMASI (08.7) — kaydın gerçekten ne bıraktığı.
 *
 * Sınanan dört kural: **başvuru onay VERMEZ** (kuyruğa girer), **mevcut hesabın kendi künyesi
 * ezilmez**, **işletme adresi kaydedilir** (onay kartının rota sinyali ona bakıyor) ve **eksik
 * başvuru yazılmaz**.
 *
 * `siret` yolu seçildi çünkü DIŞ SERVİSE HİÇ ÇIKMIYOR — ve bu özellik 28.08'de bir kez kırılıp
 * geri alındı: SIRET yolu künyeyi sunucuda yeniden okumaya başlamıştı ve bu dosya 5,7 saniyeden
 * 16,9 saniyeye çıkarak haklı çıktı. Bugünkü hâl: numara resmî kayıttan `facts` üzerinden geliyor
 * (form onu zaten sormuştu), **doğrulama ise başvuruda değil ONAY KARTINDA** yapılıyor
 * (`refreshVatNumberCheck`, 09.11) — yani VIES çağrısı bu yolda hiç kurulmuyor. Ağa çıkan bir birim
 * testi, servis yavaşladığı gün "bizim kodumuz bozuldu" diye okunan bir düşüş üretir.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const addresses = new AddressService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];

const FACTS: B2bCompanyFacts = { activityCode: '56.10A', foundedYear: 2016, isActive: true, vatNumber: 'FR34387904527' };

/**
 * Damgayla ayrılmış satır — paylaşılan veritabanında başka bir ajanın verisiyle çakışmaz.
 *
 * **Telefon her başvuruda AYRI** ve bu bir test hilesi değil, kısıtın kendisi: `phone` kimlik
 * anahtarıdır ve tekildir. Sabit bir numara kullanan ilk sürüm üç testte birden kısıt ihlaliyle
 * düştü — ve o düşüş üründeki gerçek bir açığı gösterdi (aşağıdaki "başkasının numarası" hâli).
 */
let phoneSeq = 0;
function application(overrides: Partial<B2bApplicationInput> = {}): B2bApplicationInput {
  phoneSeq += 1;
  return {
    kind: 'siret',
    siret: '90749664000026',
    legalName: `Restaurant Anatolie ${stamp}`,
    vatNumber: '',
    contactName: 'Mehmet Demir',
    email: `pro-${stamp}@example.test`,
    phone: `+3369${String(stamp).slice(-6)}${String(phoneSeq).padStart(2, '0')}`,
    line1: '8 Rue du Fossé',
    postalCode: '67000',
    city: 'Strasbourg',
    ...overrides,
  };
}

/**
 * Benzersizlik sayacı `createdProfiles.length`ten AYRI — çünkü o yalnız insert BAŞARIRSA artıyor.
 * Şema ile veritabanı ayrıştığı bir turda ilk insert parse hatasıyla düştü, sayaç 0'da kaldı ve
 * sonraki üç test aynı e-postayı üretip "duplicate key" verdi: gerçek hata (tek satır) üç sahte
 * hatanın altında kayboldu. Sayaç girişimde artar, sonuçta değil.
 */
let profileSeq = 0;

async function newCustomer(fields: { name?: string; phone?: string | null } = {}): Promise<string> {
  profileSeq += 1;
  const profile = await profiles.insert({
    roles: ['customer'],
    name: fields.name ?? '',
    email: `pro-${stamp}-${profileSeq}@example.test`,
    phone: fields.phone ?? null,
  });
  createdProfiles.push(profile.id);
  return profile.id;
}

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdProfiles });
});

describe('başvurunun yazılması', () => {
  it('künye dolar ama onay VERİLMEZ — kayıt kuyruğa girer', async () => {
    const customerId = await newCustomer();
    const updated = await submitB2bApplication(customerId, application(), FACTS);

    expect(updated.companyInfo?.legalName).toBe(`Restaurant Anatolie ${stamp}`);
    expect(updated.companyInfo?.siret).toBe('90749664000026');
    expect(updated.companyInfo?.activityCode).toBe('56.10A');
    // `false` = bekliyor. `true` yazmak toptan fiyatı doğrulanmamış bir kayda açardı; `null`
    // yazmak kaydı operasyonun bekleyen kuyruğundan (kısmi indeks) düşürürdü.
    expect(updated.b2bApproved).toBe(false);
    /**
     * **Numara YAZILIR, doğrulama SONRAYA kalır** (28.08 · eskiden ikisi de `null`dı).
     *
     * Bu satır bir tur `vatNumber`ı da `null` bekliyordu ve iddia doğruydu — ama çivilediği şey bir
     * AÇIKTI: resmî kayıt numarayı `tva` alanında zaten veriyordu, biz taşımıyorduk. Sonucu şuydu:
     * gerçek bir Fransız başvurusunda `user_profiles.vat_number` boş kalıyor, onay kartının KDV
     * satırı daima "Numara yok" diyor ve 09.11'in tazeleme mekanizmasının tazeleyecek bir şeyi
     * olmuyordu. **Testin geçmesi, davranışın doğru olduğunu göstermez.**
     *
     * `vatNumberValid` hâlâ `null` ve bilerek: SIRET yolunda VIES çağrılmıyor (dosya künyesi),
     * numarayı onay kartı açılışta soruyor. `null` burada "sorulmadı" demek.
     */
    expect(updated.vatNumber).toBe('FR34387904527');
    expect(updated.vatNumberValid).toBeNull();
    expect(updated.vatNumberCheckedAt).toBeNull();
  });

  it('işletme adresi kaydedilir — onay kartının rota sinyali buna bakıyor', async () => {
    const customerId = await newCustomer();
    await submitB2bApplication(customerId, application(), FACTS);

    const rows = await addresses.listByCustomer(customerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.postalCode).toBe('67000');
    expect(rows[0]?.city).toBe('Strasbourg');
    // İlk adres varsayılan olur: müşterinin checkout'ta seçecek başka adresi yok.
    expect(rows[0]?.isDefault).toBe(true);
  });

  it('aynı başvuru iki kez gönderilse de adres İKİ KEZ yazılmaz', async () => {
    const customerId = await newCustomer();
    await submitB2bApplication(customerId, application(), FACTS);
    await submitB2bApplication(customerId, application({ legalName: `Düzeltilmiş ${stamp}` }), FACTS);

    expect(await addresses.listByCustomer(customerId)).toHaveLength(1);
    const profile = await profiles.getById(customerId);
    // Künye ise GÜNCELLENİR: aday bir alanını yanlış yazdıysa yeniden gönderebilmeli.
    expect(profile?.companyInfo?.legalName).toBe(`Düzeltilmiş ${stamp}`);
  });

  /**
   * Mevcut B2C hesabıyla başvuran müşterinin kendi adı, formdaki yetkili adıyla EZİLMEZ — o ad
   * geçmiş siparişlerinin de sahibi. Boş isimde ise yazılır: orada ezilecek bir şey yok.
   */
  it('dolu ad ve telefon korunur, boş olan doldurulur', async () => {
    const ownPhone = `+3360${String(stamp).slice(-7)}`;
    const named = await newCustomer({ name: 'Ayşe Yılmaz', phone: ownPhone });
    const namedAfter = await submitB2bApplication(named, application(), FACTS);
    expect(namedAfter.name).toBe('Ayşe Yılmaz');
    expect(namedAfter.phone).toBe(ownPhone);

    const blank = await newCustomer();
    const form = application();
    const blankAfter = await submitB2bApplication(blank, form, FACTS);
    expect(blankAfter.name).toBe('Mehmet Demir');
    expect(blankAfter.phone).toBe(form.phone);
  });

  /**
   * ── ATLAMA KURALI KALKTI (04.10) ────────────────────────────────────────────────────────────
   * Bu test bir tur şunu çiviliyordu: numarası başka bir kayıtta duran aday başvurabilsin, ama
   * numarası **sessizce atlansın**. Gerekçesi `user_profiles_phone_key` tekil indeksiydi — yazmayı
   * denemek kısıt ihlaliyle patlıyor, ekranda düzeltilemeyecek bir "beklenmeyen hata" çıkıyordu.
   *
   * O indeks kaldırıldı (kolon iletişim numarası oldu, kimlik anahtarı `customer_phone`a taşındı),
   * yani çakışma diye bir şey kalmadı — ve atlamanın bedeli görünür oldu: **aday numarasını
   * yazıyordu, biz düşürüyorduk** ve onay kartında iletişim numarası boş görünüyordu.
   */
  it('numarası başka bir kayıtta da duruyor olsa aday numarasını YAZDIRIR (04.10)', async () => {
    const form = application();
    await newCustomer({ phone: form.phone });

    const applicant = await newCustomer();
    const after = await submitB2bApplication(applicant, form, FACTS);

    expect(after.companyInfo?.siret).toBe('90749664000026');
    expect(after.phone).toBe(form.phone.replace(/\s/g, ''));
    // Adres satırında da duruyor: kurye kapıda arayacak birini bulur.
    expect((await addresses.listByCustomer(applicant))[0]?.phone).toBe(form.phone);
  });

  /** İstemci denetimi atlanabilir; kapı kendi denetimini yapmazsa eksik künye kayda girer. */
  it('eksik başvuru yazılmaz ve hiçbir iz bırakmaz', async () => {
    const customerId = await newCustomer();
    await expect(submitB2bApplication(customerId, application({ siret: '123' }), FACTS)).rejects.toThrow(
      'invalid_application',
    );

    const profile = await profiles.getById(customerId);
    expect(profile?.companyInfo).toBeNull();
    expect(profile?.b2bApproved).toBeNull();
    expect(await addresses.listByCustomer(customerId)).toHaveLength(0);
  });
});

'use server';

import { normalizeEmail } from '@lezzet/helper';
import type { B2bApplicationInput, B2bCompanyFacts } from '@lezzet/domain-core';
import { customerErrorKey, CustomerError, type CustomerResult } from '@/lib/customer-error';
import { currentCustomerId } from '@/lib/guard';
import { lookupCompanyBySiret, type CompanyRegistryRecord, type CompanyLookupFailure } from '@/lib/b2b/company-registry';
import { checkEuVatNumber } from '@/lib/b2b/vat-check';
import { submitB2bApplication } from '@/lib/b2b/application';
import { verifyEmailOtp } from '../login/actions';

/**
 * Professionnels — B2B self-servis kaydının yazma kapıları (08.7).
 *
 * ── AKIŞ İKİ BASAMAK, ÇÜNKÜ KİMLİK ARADA KURULUYOR ───────────────────────────
 * Tasarımın sözleşmesi: *"Gönder → e-postaya tek kullanımlık kod → hesap açılır/bağlanır →
 * başvuru alındı"*. Yani başvuru, gönderildiği anda henüz KİMSEYE ait değildir; sahibi kod
 * doğrulandığında belli olur.
 *
 * **Bu yüzden başvuru sunucuda BEKLETİLMİYOR.** Form verisi ikinci çağrıda tekrar geliyor ve
 * kimlik o an kurulan oturumdan alınıyor. Alternatif — veriyi bir taslak satırında ya da çerezde
 * tutmak — sahibi olmayan kayıtlar üretirdi: kodu hiç girmeyen her ziyaretçi arkasında yetim bir
 * başvuru bırakırdı. Verinin istemcide durmasının riski yok, çünkü zaten adayın kendi girdisi;
 * kötüye kullanılabilecek tek şey KİMLİK ve o istemciden hiç alınmıyor.
 *
 * **Zaten girişli müşteri kod adımını hiç görmez** (tasarım: "mevcut hesabıyla başvurur"):
 * `applyAsCustomerAction` doğrudan yazar. İki kapı da aynı yazma fonksiyonuna çıkıyor.
 */

/** Resmî kayıt okuması — ekranın "Getir" düğmesi. Bulunamama ile soramama AYRI dönüyor. */
export async function lookupSiretAction(siret: string): Promise<CustomerResult<CompanyRegistryRecord>> {
  try {
    const result = await lookupCompanyBySiret(siret);
    if (typeof result === 'string') {
      const key: Record<CompanyLookupFailure, string> = { not_found: 'siret_not_found', unavailable: 'registry_down' };
      return { data: null, errorKey: key[result] };
    }
    return { data: result, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * AB vergi numarası doğrulaması — ekranın canlı ✓/✗ işareti.
 *
 * `data` üç değerli: `true` geçerli · `false` geçersiz · `null` **sorulamadı**. Sonuncusu bir hata
 * DEĞİL (bu yüzden `errorKey` boş): ekran "doğrulanamadı" der ve başvuruyu engellemez — üye
 * ülkelerin sunucuları düzenli olarak cevap vermiyor ve meşru bir başvuruyu bunun için kesmek,
 * servisin arızasını müşterinin kusuru gibi göstermek olurdu.
 */
export async function checkVatAction(vatNumber: string): Promise<CustomerResult<{ valid: boolean | null }>> {
  try {
    return { data: { valid: await checkEuVatNumber(vatNumber) }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Girişli müşterinin başvurusu — kod adımı YOK.
 *
 * Kimlik oturumdan; form alanındaki e-posta bu yolda kimlik olarak KULLANILMAZ (kullanılsaydı
 * girişli bir müşteri, formu başkasının adresiyle doldurarak o hesaba künye yazdırabilirdi).
 */
export async function applyAsCustomerAction(
  input: B2bApplicationInput,
  facts: B2bCompanyFacts,
): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    await submitB2bApplication(customerId, input, facts);
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Girişsiz başvurunun İKİNCİ basamağı: kodu doğrula, oturumu aç, başvuruyu yaz.
 *
 * Kod gönderme adımı için ayrı bir kapı yazılmadı — `sendEmailOtp` zaten var ve ekran onu
 * doğrudan çağırıyor. İkinci bir "başvuru için kod gönder" kapısı, aynı hız sınırının ve aynı
 * mail şablonunun ikinci kopyası olurdu.
 *
 * Doğrulama başarısızsa başvuru YAZILMAZ ve `verifyEmailOtp`in anahtarı olduğu gibi geçirilir:
 * ekran o anahtarları zaten `authErrorMessage` ile çeviriyor (giriş sayfasıyla aynı sözlük).
 */
export async function verifyAndApplyAction(
  email: string,
  code: string,
  input: B2bApplicationInput,
  facts: B2bCompanyFacts,
): Promise<CustomerResult<true>> {
  try {
    // Kimliğin kurulacağı adres FORMUN adresidir; ekranın ayrı bir adres göndermesine izin
    // verilmiyor ki "koda giden adres" ile "hesabın adresi" ayrışamasın.
    const normalized = normalizeEmail(input.email);
    if (!normalized || normalized !== normalizeEmail(email)) throw new CustomerError('invalid_email');

    const verified = await verifyEmailOtp(normalized, code);
    if (verified.errorKey) return { data: null, errorKey: verified.errorKey };

    // Oturum artık açık: kimlik yine SUNUCUDAN okunuyor, `verifyEmailOtp`in döndürdüğünden değil.
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    await submitB2bApplication(customerId, input, facts);
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

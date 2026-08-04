import 'server-only';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { normalizePhone, normalizePostalCode } from '@lezzet/helper';
import {
  b2bApplicationIssues,
  b2bStatusOf,
  normalizeSiret,
  normalizeVatNumber,
  resolveUserText,
  type B2bApplicationInput,
  type B2bApplicationStatus,
  type B2bCompanyFacts,
} from '@lezzet/domain-core';
import type { CompanyInfo, PreferredLanguage, UserProfile } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError } from '@/lib/customer-error';
import { checkEuVatNumber } from './vat-check';

/**
 * B2B başvurusunun YAZILMASI (08.7 · DOMAIN §10) — profil künyesi + adres.
 *
 * ── AYRI BİR "BAŞVURU" VARLIĞI YOK ───────────────────────────────────────────
 * Başvuru bir tablo değil, müşteri kaydının bir HÂLİ: künye (`company_info`) dolar,
 * `b2b_approved` `false` olur ve kayıt onay kuyruğuna düşer (`user_profiles_b2b_pending_idx` tam
 * olarak bu kısmi indekstir). Operasyon tarafı da aynı kararı vermişti (09.11 → 09.9): "onay ayrı
 * bir varlık değil, profesyonel müşterinin bir hâlidir". İki yüzeyin aynı şeyi iki farklı biçimde
 * modellemesi, aynı müşteriyi iki kimlikle yaşatırdı.
 *
 * ── KİMLİK BURADA ÇÖZÜLMEZ, VERİLİR ──────────────────────────────────────────
 * `customerId` parametredir ve çağıran onu OTURUMDAN alır (`currentCustomerId`) — form
 * alanından değil. Aksi hâlde tarayıcı konsolundan başkasının hesabına şirket künyesi
 * yazılabilirdi; geri bildirim akışında öğrenilen dersin aynısı (08.7 · `resolveInvite`).
 *
 * ── SIRET'İ GİREN O ŞİRKET DEĞİLDİR ──────────────────────────────────────────
 * Ve bu bir açık değil, kurgunun kendisi (DOMAIN §10): SIRET herkese açık bir numara, girene
 * dair hiçbir şey kanıtlamaz. Bu yüzden yazma onay VERMEZ — yalnız kuyruğa koyar. Toptan fiyat
 * `b2bApproved === true` olana kadar hiçbir yerde görünmez.
 */

/**
 * Kaydın son hâlini döndürüyor ki çağıran (bugün entegrasyon testi, yarın bir onay ekranı) yazının
 * gerçekten ne bıraktığını görebilsin — "yazdım" demek, yazılanı göstermekten farklıdır.
 */
export async function submitB2bApplication(
  customerId: string,
  input: B2bApplicationInput,
  facts: B2bCompanyFacts,
): Promise<UserProfile> {
  // Denetim SUNUCUDA TEKRARLANIR. Ekran aynı motoru çağırıyor ama istemciden gelen hiçbir şeye
  // güvenilmez — form atlanarak da bu kapıya istek atılabilir.
  const issues = b2bApplicationIssues(input);
  // `CustomerError` ile fırlatılıyor çünkü müşteri yüzeyinin funnel'ı YALNIZ onu tanıyor
  // (`customerErrorKey`): başka bir hata sınıfı anahtarını kaybeder ve ekran "beklenmeyen hata"
  // gösterirdi — düzeltilebilir bir eksiği düzeltilemez bir arıza gibi anlatan bir cümle.
  if (issues.length > 0) throw new CustomerError('invalid_application');

  const db = serviceDb();
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) throw new CustomerError('unexpected');

  const isEuVat = input.kind === 'eu_vat';
  const vatNumber = isEuVat ? normalizeVatNumber(input.vatNumber) : null;
  // Doğrulama YAZMADAN ÖNCE: sonuç kaydın parçası. Sorulamadıysa `null` yazılır ve onay kartı
  // bunu "Sorulmadı" diye gösterir — sessizce "geçerli" varsaymak reverse charge'ı açardı.
  const vatNumberValid = vatNumber ? await checkEuVatNumber(vatNumber) : null;

  const companyInfo: CompanyInfo = {
    legalName: input.legalName.trim(),
    siret: input.kind === 'siret' ? normalizeSiret(input.siret) : null,
    activityCode: facts.activityCode,
    foundedYear: facts.foundedYear,
    isActive: facts.isActive,
  };

  const phone = normalizePhone(input.phone, isEuVat ? 'DE' : 'FR');
  /**
   * Telefon KİMLİK ANAHTARI ve tekil (`user_profiles_phone_key`) — yani başka bir kayıtta
   * duruyorsa buraya yazılamaz. Yazmayı denemek kısıt ihlaliyle patlar ve müşteri, düzeltemeyeceği
   * bir "beklenmeyen hata" görür; oysa numarasını doğru yazmıştır, yalnız WhatsApp'tan açılmış
   * eski bir taslağı vardır. Numara sessizce ATLANIR ve iki kaydın aynı kişi olabileceği zaten
   * onay kartının mükerrer sinyaline düşer (`b2b-check`) — kararı orada operatör verir.
   */
  const phoneTaken = phone ? Boolean(await profiles.findByPhone(phone)) : true;

  const updated = await profiles.update({
    id: profile.id,
    companyInfo,
    vatNumber,
    vatNumberValid,
    // Kuyruğa girer, onaylanmaz. `false` DOMAIN §10'un ve `user_profiles_b2b_pending_idx` kısmi
    // indeksinin sözleşmesi — `null` yazmak kaydı operasyonun bekleyen listesinden düşürürdü.
    b2bApproved: false,
    // Ad ve telefon YALNIZ BOŞSA yazılır: mevcut B2C hesabıyla başvuran müşterinin kendi adını
    // bir işletme yetkilisinin adıyla ezmek, geçmiş siparişlerinin sahibini değiştirmek olurdu.
    ...(profile.name.trim().length === 0 ? { name: input.contactName.trim() } : {}),
    ...(profile.phone || phoneTaken ? {} : { phone }),
    // Taslak (WhatsApp telefonuyla açılmış) kayıt, sahibi doğrulanmış bir başvuruyla kapanır.
    isDraft: false,
  });

  // Adres onay kartının ROTA sinyalini besliyor (`b2b-check`): adres yoksa sinyal "ölçülemedi"
  // kalır ve operatör bölge uyumunu göremez. İşletme adresi zaten başvurunun parçası.
  const addresses = new AddressService(db);
  const existing = await addresses.listByCustomer(customerId);
  const line1 = input.line1.trim();
  const postalCode = normalizePostalCode(input.postalCode);
  const alreadyThere = existing.some(
    (a) => a.line1.trim().toLowerCase() === line1.toLowerCase() && normalizePostalCode(a.postalCode) === postalCode,
  );
  if (!alreadyThere) {
    await addresses.addForCustomer({
      customerId,
      // Etiket işletmenin künye adı: müşterinin checkout'ta iki adres arasında ayırt edeceği şey
      // sokak adı değil, "burası iş yerim" bilgisidir.
      label: companyInfo.legalName,
      recipient: input.contactName.trim(),
      line1,
      postalCode,
      city: input.city.trim(),
      // Adresin telefonu tekil DEĞİL (kapıda aranacak numara adrese aittir) — profil kaydında
      // atlanmış olsa bile burada durur, kurye numarasız kalmaz.
      phone,
      country: isEuVat ? 'DE' : 'FR',
    });
  }

  return updated;
}

/** Başvuru ekranının SUNUCU tarafı okuması — durum + form ön dolgusu. */
interface B2bApplicantView {
  status: B2bApplicationStatus;
  contactName: string;
  email: string;
  phone: string;
  /**
   * Reddedilmişse GEREKÇE, başvuru sahibinin dilinde (20.2). Reddedilmemişse ya da operatör
   * gerekçe yazmamışsa `null`.
   *
   * Gerekçeyi göstermek bir nezaket değil, akışın kendisi: sebebini bilmeyen başvuru sahibi aynı
   * eksikle yeniden başvurur ve aynı kuyruğu ikinci kez meşgul eder.
   */
  rejectReason: string | null;
  /** Gerekçe makine çevirisi mi — ekran "otomatik çevrildi" der (öteki iki yüzeyle aynı rozet). */
  rejectReasonTranslated: boolean;
}

/**
 * Girişli ziyaretçinin başvuru bağlamı; oturum yoksa `null`.
 *
 * Ön dolgu ekranın kolaylığı değil, VERİNİN doğruluğu: girişli müşteri formu kendi adıyla değil
 * de boş doldurursa aynı hesapta iki ayrı iletişim kişisi yaşamaya başlar. Adres burada
 * OKUNMUYOR — başvuru işletme adresini soruyor, müşterinin teslimat adresini değil; ikisi aynı
 * olabilir ama aynı olduğunu varsaymak, ev adresini işletme künyesine yazmak demekti.
 *
 * **`viewLanguage` varsayılansız** (20.2): ret gerekçesini operatör Türkçe yazar, başvuru sahibi
 * kendi dilinde okur. Varsayılan koysaydık dilini vermeyi unutan bir ekran Fransız bir kasaba
 * Türkçe gerekçe gösterir ve bu hiçbir yerde hata vermezdi.
 */
export async function readB2bApplicant(viewLanguage: PreferredLanguage): Promise<B2bApplicantView | null> {
  const customerId = await currentCustomerId();
  if (!customerId) return null;
  const profile = await new UserProfileService(serviceDb()).getById(customerId);
  if (!profile) return null;

  // Kaynak dil SABİT `'tr'` ve bu şemanın kendi kararı: ret gerekçesinde kaynak-dil kolonu yok,
  // çünkü operasyon yüzeyi tek dillidir (`CLAUDE §2`). Operatör yanlışlıkla başka dilde yazsa bile
  // sonuç doğru kalır — o dilin çevirisi torbada bulunmaz ve okuma orijinale düşer.
  //
  // ORİJİNAL dışarı VERİLMİYOR — ötekilerin tersine ve bilerek. Ürün yorumunda "orijinali göster"
  // anlamlıdır (müşterinin kendi cümlesidir, okuyucu merak eder); ret gerekçesinin orijinali
  // Türkçedir ve Fransız bir başvuru sahibinin onunla yapabileceği bir şey yoktur.
  const gerekce = resolveUserText(
    { text: profile.b2bRejectReason, language: 'tr', translations: profile.b2bRejectReasonTranslations },
    viewLanguage,
  );

  return {
    status: b2bStatusOf(profile),
    contactName: profile.name ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    rejectReason: gerekce.text,
    rejectReasonTranslated: gerekce.isTranslated,
  };
}

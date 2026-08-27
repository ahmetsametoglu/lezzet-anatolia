import { AddressService, UserProfileService } from '@lezzet/database';
import { normalizePhone, normalizePostalCode } from '@lezzet/helper';
import {
  b2bApplicationIssues,
  b2bStatusOf,
  normalizeSiret,
  normalizeVatNumber,
  resolveUserText,
  type B2bApplicationField,
  type B2bApplicationInput,
  type B2bApplicationStatus,
  type B2bCompanyFacts,
} from '@lezzet/domain-core';
import type { CompanyInfo, PreferredLanguage, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyB2bApplicationReceived } from '../notification/staff-events';

import { checkEuVatNumber } from '../b2b/vat-check';

/*
  B2B BAŞVURU KAPISI — web `lib/b2b/application.ts` kurallarının paket hâli (21.31). Terfi ölçütü
  karşılandı: aynı kuralları İKİ yüzey istiyor (web Professionnels sayfası + mobil başvuru formu)
  ve `apps/mobile-api` web'in `lib`ini import edemez. Web dosyası KÖPRÜ; benimsemesi web şeridinin
  işi (katalog · adres · sipariş terfilerinin aynı deseni).

  Kurallar web'tekiyle BİREBİR — aşağıdaki dört künye oradan taşındı:

  · **AYRI BİR "BAŞVURU" VARLIĞI YOK.** Başvuru bir tablo değil, müşteri kaydının bir HÂLİ: künye
    (`company_info`) dolar, `b2b_approved` `false` olur ve kayıt onay kuyruğuna düşer
    (`user_profiles_b2b_pending_idx` tam olarak bu kısmi indekstir).
  · **KİMLİK BURADA ÇÖZÜLMEZ, VERİLİR.** `customerId` parametredir ve çağıran onu OTURUMDAN alır
    (web `currentCustomerId`, mobil uçta Bearer'dan çözülen profil) — form alanından değil. Aksi
    hâlde istemciden gönderilen bir kimlikle başkasının hesabına şirket künyesi yazılabilirdi.
  · **SIRET'İ GİREN O ŞİRKET DEĞİLDİR** ve bu bir açık değil, kurgunun kendisi (DOMAIN §10):
    SIRET herkese açık bir numaradır, girene dair hiçbir şey kanıtlamaz. Bu yüzden yazma onay
    VERMEZ — yalnız kuyruğa koyar. Toptan fiyat `b2bApproved === true` olana kadar görünmez.
  · **DENETİM SUNUCUDA TEKRARLANIR.** Ekran aynı motoru çağırıyor ama istemciden gelen hiçbir şeye
    güvenilmez — form atlanarak da bu kapıya istek atılabilir.

  ── DEĞİŞEN TEK ŞEY: RET GÖRÜNÜR OLDU ───────────────────────────────────────
  Web `CustomerError('invalid_application')` fırlatıyordu; paket ADLI SONUÇ döndürüyor ve eksik
  ALANLARIN listesini taşıyor (`checkout`/`addresses` kapılarının kuralı: "ret bir hata değil,
  cevaptır"). Kazanç ölçülebilir: mobil form aynı listeyi kendi motorundan da üretiyor, sunucunun
  reddettiği alanı işaretleyebilmesi için o listenin telden geçmesi gerekiyor — yoksa ekran
  "başvuru geçersiz" deyip hangi alanın eksik olduğunu söyleyemezdi. Web köprüsü sonucu eskisi
  gibi `CustomerError`a çeviriyor, yani o yüzeyin davranışı değişmedi.
*/

export type B2bApplicationOutcome =
  | { status: 'ok'; profile: UserProfile }
  /** Motorun işaret ettiği alanlar — cümleyi ekran kurar (anahtar listesi, metin değil). */
  | { status: 'invalid_application'; issues: B2bApplicationField[] }
  | { status: 'profile_not_found' };

/**
 * Kaydın son hâlini döndürüyor ki çağıran (entegrasyon testi, onay ekranı, mobil uç) yazının
 * gerçekten ne bıraktığını görebilsin — "yazdım" demek, yazılanı göstermekten farklıdır.
 */
export async function submitB2bApplication(
  db: SupabaseClient,
  customerId: string,
  input: B2bApplicationInput,
  facts: B2bCompanyFacts,
): Promise<B2bApplicationOutcome> {
  const issues = b2bApplicationIssues(input);
  if (issues.length > 0) return { status: 'invalid_application', issues };

  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return { status: 'profile_not_found' };

  const isEuVat = input.kind === 'eu_vat';
  const vatNumber = isEuVat ? normalizeVatNumber(input.vatNumber) : null;
  // Doğrulama YAZMADAN ÖNCE: sonuç kaydın parçası. Sorulamadıysa `null` yazılır ve onay kartı
  // bunu "Sorulmadı" diye gösterir — sessizce "geçerli" varsaymak reverse charge'ı açardı.
  const vatNumberValid = vatNumber ? await checkEuVatNumber(vatNumber) : null;
  // Damga YALNIZ kesin cevapta: "sorulamadı" bir cevap değil, cevabın yokluğudur — damgalanırsa
  // onay kartı hiç alınmamış bir doğrulamaya yaş atfeder (`b2b-approval` → `vatSignal`).
  const vatNumberCheckedAt = vatNumberValid === null ? null : new Date().toISOString();

  const companyInfo: CompanyInfo = {
    legalName: input.legalName.trim(),
    siret: input.kind === 'siret' ? normalizeSiret(input.siret) : null,
    activityCode: facts.activityCode,
    foundedYear: facts.foundedYear,
    isActive: facts.isActive,
  };

  /**
   * ── ATLAMA KURALI KALKTI (04.10) ─────────────────────────────────────────────────────────────
   * Bu satır bir tur şunu yapıyordu: numara başka bir kayıtta duruyorsa **sessizce atla**. Gerekçesi
   * `user_profiles_phone_key` tekil indeksiydi — yazmayı denemek kısıt ihlaliyle patlar, müşteri
   * düzeltemeyeceği bir "beklenmeyen hata" görürdü; oysa numarasını doğru yazmıştır, yalnız
   * WhatsApp'tan açılmış eski bir taslağı vardır.
   *
   * O indeks 04.10'da kalktı: kolon artık İLETİŞİM numarasıdır, kimlik anahtarı doğrulanmış numaranın
   * kendi kaydıdır (`customer_phone`). Yani çakışma diye bir şey kalmadı ve atlamanın bedeli görünür
   * oldu — **başvuran numarasını yazıyordu, biz sessizce düşürüyorduk** ve onay kartında iletişim
   * numarası boş görünüyordu. Numara artık yazılıyor; mükerrer kayıt şüphesi zaten onay kartının
   * kendi sinyalinde (`b2b-check`) ve kararı orada operatör veriyor.
   */
  const phone = normalizePhone(input.phone, isEuVat ? 'DE' : 'FR');

  const updated = await profiles.update({
    id: profile.id,
    /**
     * ── KAYIT ŞİRKET OLUR (kullanıcı bulgusu 20.08) ──────────────────────────────────────────
     * Bu alan bir tur HİÇ YAZILMIYORDU ve `type: 'company'` kodun hiçbir yerinde geçmiyordu —
     * yalnız `scripts/seed/people.ts`te. Sonucu şuydu: **formdan başvurup ONAYLANAN müşteri toptan
     * fiyatı hiçbir zaman görmüyordu.** Zincirin her halkası doğru çalışıyordu (künye yazılıyor,
     * kayıt onay kuyruğuna düşüyor, operatör onaylıyor, `b2bApproved` true oluyor) ve son adım
     * karşılıksız kalıyordu, çünkü `pricingViewerOf` kanalı `type === 'company'`ten türetiyor.
     *
     * ÖLÇÜLDÜ (20.08, 3001'e karşı, `acili-ezme` · b2c 10,47 € ↔ b2b 6,84 €): gerçek SIRET'le
     * başvuru yapıldı, künye yazıldı, onaylandı → **10,47 €**. Tek fark olarak `type` elle
     * `company` yapılınca → **6,84 €**. Seed'in B2B müşterileri çalışıyordu çünkü seed alanı elle
     * kuruyor; gerçek başvuru sahibi hiçbir zaman şirket olmuyordu.
     *
     * **Arıza HAZIR HESAPLA yapılan hiçbir testte görünmez** — ne webde ne mobilde. Kanıtı mobil
     * tarafın kendi testi: `apps/mobile-api/src/api/v1/catalog.test.ts` B2B görünümünü kurmak için
     * `type: 'company'`i ELLE yazıyor, yani akıştan geçmiyor. Ortaya çıkması için birinin gerçekten
     * başvurması gerekiyordu.
     *
     * ── NEDEN ONAYDA DEĞİL, BAŞVURUDA ────────────────────────────────────────────────────────
     * `type` HUKUKİ KİMLİKTİR, ticari güven değil — ayrımı `checkout-options.ts` künyesi koymuş:
     * *"`checkout-draft.ts` kanalı `type === 'company'` ile türetiyor ve orada doğru, çünkü o kanal
     * KDV'nin ve muhasebenin kanalı — şirket, başvurusu onaylanmasa da şirkettir."* Güven kararı
     * ayrı alanda (`b2bApproved`) ve üç tüketici de onu ayrıca soruyor: toptan fiyat (`pricingViewerOf`)
     * ve vadeli ödeme (`checkout-options`) onay ister, KDV kanalı istemez. Yani bu satır onaysız
     * başvurana toptan fiyat AÇMAZ — açan şey onay, ve o hâlâ operatörün kararı.
     *
     * Künye bu noktada zaten doğrulanmış: SIRET resmî kayıttan okundu ya da AB vergi numarası
     * soruldu (`vatNumberValid` üç değerli, uydurulmuyor).
     */
    type: 'company',
    companyInfo,
    vatNumber,
    vatNumberValid,
    vatNumberCheckedAt,
    // Kuyruğa girer, onaylanmaz. `false` DOMAIN §10'un ve `user_profiles_b2b_pending_idx` kısmi
    // indeksinin sözleşmesi — `null` yazmak kaydı operasyonun bekleyen listesinden düşürürdü.
    b2bApproved: false,
    // Ad ve telefon YALNIZ BOŞSA yazılır: mevcut B2C hesabıyla başvuran müşterinin kendi adını
    // bir işletme yetkilisinin adıyla ezmek, geçmiş siparişlerinin sahibini değiştirmek olurdu.
    ...(profile.name.trim().length === 0 ? { name: input.contactName.trim() } : {}),
    ...(profile.phone || !phone ? {} : { phone }),
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
      /* Adresin telefonu tekil DEĞİL (kapıda aranacak numara adrese aittir) — profil kaydında
         atlanmış olsa bile burada durur, kurye numarasız kalmaz.

         İNDİRGENEMEYEN NUMARA HAM HÂLİYLE YAZILIR (22.08, kolon `not null` olunca gerekti):
         `normalizePhone` tanıyamadığı bir yazımda `null` döner ve o hâlde başvuranın yazdığı metin
         olduğu gibi geçer. Uydurma DEĞİL — başvuranın beyanı; boş bırakmak ise artık mümkün değil
         ve olsaydı da kuryeyi kapıda numarasız bırakırdı. Aynı hüküm native adres formunda da var. */
      phone: phone ?? input.phone.trim(),
      country: isEuVat ? 'DE' : 'FR',
    });
  }

  // ONAY KUYRUĞUNUN KAPI ZİLİ (26.08): başvuru yazıldıktan sonra, sonucu değiştirmeden — yönetim
  // "yeni başvuru düştü"yü zilden okur (üretici kendi içinde sessiz; başvuru kaydı zilden önemli).
  await notifyB2bApplicationReceived(db, customerId);

  return { status: 'ok', profile: updated };
}

/** Başvuru ekranının SUNUCU tarafı okuması — durum + form ön dolgusu. */
export interface B2bApplicantView {
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
 * Müşterinin başvuru bağlamı; kaydı yoksa `null`.
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
export async function readB2bApplicant(
  db: SupabaseClient,
  customerId: string,
  viewLanguage: PreferredLanguage,
): Promise<B2bApplicantView | null> {
  const profile = await new UserProfileService(db).getById(customerId);
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

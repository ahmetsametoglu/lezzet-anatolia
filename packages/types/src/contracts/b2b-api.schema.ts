import { z } from 'zod';
import { UserProfileSchema } from '../entities/user-profile.schema';

/**
 * B2B BAŞVURUSU SÖZLEŞMESİ (08.7 · 21.31) — mobil `/api/v1/b2b/*` + `/api/v1/me/b2b` uçlarının ve
 * onları tüketen başvuru ekranının (v3 tasarım 18, vPro) ORTAK dili.
 *
 * Terfi gerekçesi `feedback-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak"): şema
 * uçta yaşarken istemci ya kendi tipini elle yazar (ikinci sözleşme) ya da hiç doğrulamaz.
 *
 * ── MOTORLA BAĞ DERLEME KİLİDİYLE KURULUR ───────────────────────────────────
 * Alan kümesi `@lezzet/domain-core.B2bApplicationInput`in AYNISI ama o paket buraya bağlanamaz
 * (`types-is-pure` sınırı). Bağ uçta kuruluyor: uç gövdeyi `B2bApplicationInput` olarak tipliyor
 * ve şema motordan saparsa **derlenmez** (`FeedbackOutcomeEnum` kilidinin aynı deseni).
 *
 * ── DENETİM ŞEMADA DEĞİL, MOTORDA ───────────────────────────────────────────
 * Alanların hepsi düz `string` ve bu bilinçli: SIRET'in Luhn'u, telefonun ülkeye göre normalize
 * edilebilirliği, adresin zorunluluğu `b2bApplicationIssues`in işi ve o kural TEK yerde durur.
 * Şemaya ikinci bir denetim yazsaydık, biri diğerinden sıkı olduğu gün müşteri "geçersiz" cevabını
 * hangi kuralın verdiğini bilemezdi — üstelik uç, eksik ALAN listesini geri döndürüyor (aşağıda),
 * yani reddin adresi de kural motorunun kendisi.
 */

/** Başvurunun iki yolu — motorun `B2bApplicationKind`iyle aynı adlar (ülke değil YÖNTEM). */
export const B2bApplicationKindEnum = z.enum(['siret', 'eu_vat']);

/**
 * `POST /api/v1/me/b2b/application` gövdesi.
 *
 * **KİMLİK GÖVDEDE YOK** ve olmamalı: başvuru Bearer'ın arkasında, müşteri jetondan çözülüyor
 * (kapının kendi hükmü — "kimlik burada çözülmez, verilir"). Gövdeden gelen bir kimlik, konsoldan
 * başkasının hesabına şirket künyesi yazdırırdı.
 *
 * `facts` RESMÎ KAYITTAN gelir ve müşteri onu YAZMAZ, taşır: ekran "Bul" ile okuduğu künyeyi
 * olduğu gibi geri gönderir (web'in server action'ı da aynısını yapıyor). İstemciye güvenmenin
 * sınırı burada bilinçli: bu üç alan operatörün onay kartındaki SİNYALLERİ besliyor, fiyat ya da
 * yetki değil — ve operatör kararı verirken kaydı kendi de görüyor. AB yolunda üçü de `null`
 * (o yolda resmî kayıt muadili açık bir kaynak yok).
 */
export const B2bApplicationBodySchema = z.object({
  kind: B2bApplicationKindEnum,
  /** `siret` yolunda zorunlu; AB yolunda boş dize gider (motorun kendi ayrımı). */
  siret: z.string(),
  legalName: z.string(),
  /** `eu_vat` yolunda zorunlu; `siret` yolunda hiç sorulmaz. */
  vatNumber: z.string(),
  contactName: z.string(),
  email: z.string(),
  phone: z.string(),
  line1: z.string(),
  postalCode: z.string(),
  city: z.string(),
  facts: z.object({
    activityCode: z.string().nullable(),
    foundedYear: z.number().int().nullable(),
    /** Resmî kayıt açık mı; `null` = sorulamadı ya da hiç sorulmadı — "kapalı" DEĞİL. */
    isActive: z.boolean().nullable(),
  }),
});

/**
 * Başvuru ekranının okuduğu durum — `GET /api/v1/me/b2b` cevabı ve yazımın başarı gövdesi.
 *
 * **Aynı şekil iki yerde** ve bu bir tekrar değil, bir söz: yazma da GÜNCEL DURUMU döndürüyor ki
 * ekran ikinci bir tura çıkmasın (adres kapısının "her cevap güncel liste" kuralının aynısı).
 */
export const B2bApplicantSchema = z.object({
  /** `none` · `pending` · `approved` · `rejected` — motorun `b2bStatusOf`u türetir, kolon değil. */
  status: z.enum(['none', 'pending', 'approved', 'rejected']),
  /** Form ön dolgusu: profildeki künye. Boş dize "girilmemiş" demektir. */
  contactName: z.string(),
  email: z.string(),
  phone: z.string(),
  /** Reddedilmişse gerekçe, BAŞVURANIN dilinde (20.2); yoksa `null`. */
  rejectReason: z.string().nullable(),
  /** Gerekçe makine çevirisi mi — ekran "otomatik çevrildi" rozetini ondan çizer. */
  rejectReasonTranslated: z.boolean(),
});
export type B2bApplicant = z.infer<typeof B2bApplicantSchema>;

/**
 * Yazımın cevabı — RET BİR HATA DEĞİL, CEVAPTIR (checkout kapısının kuralı).
 *
 * `invalid_application` eksik ALANLARIN adını taşıyor: ekran aynı listeyi kendi motorundan da
 * üretiyor, ama sunucunun reddettiği alanı işaretleyebilmesi için o listenin telden geçmesi
 * gerekir — yoksa "başvuru geçersiz" deyip nedenini söyleyemeyen bir ekran kalırdı.
 */
export const B2bApplicationResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), applicant: B2bApplicantSchema }),
  z.object({ status: z.literal('invalid_application'), issues: z.array(z.string()) }),
]);

/** Resmî kayıt künyesi — `GET /api/v1/b2b/company/:siret`in bulduğu satır. */
export const B2bCompanySchema = z.object({
  siret: z.string(),
  /** Okunur biçim (`907 496 640 00026`) — ekranda doğrulanacak olan bu. */
  siretDisplay: z.string(),
  legalName: z.string(),
  /** Faaliyet kodu (APE/NAF); okunur adı YOK ve uydurulmuyor (kapının künyesi). */
  activityCode: z.string().nullable(),
  foundedYear: z.number().int().nullable(),
  isActive: z.boolean().nullable(),
  /**
   * **KDV numarası — kayıttan gelir, hesaplanmaz** (28.08). Resmî kayıt `tva` alanında zaten
   * veriyor; taşınmadığı sürece Fransız başvurusunda `user_profiles.vat_number` boş kalıyordu ve
   * onay kartının KDV satırı daima "Numara yok" diyordu.
   *
   * Sözleşmeye eklenmesinin sebebi ikinci yüzey: mobil başvuru formu bu alanı okuyup başvurunun
   * `facts`ına koyarsa numara orada da yazılır. **Bugün okunmuyor ve bu bir arıza değil** —
   * `B2bCompanyFacts.vatNumber` isteğe bağlı, vermeyen yüzeyde davranış bugünküyle aynı kalıyor
   * (numara yazılmaz). Notu `docs/talep/`te; alan burada duruyor ki iş mekanik bir ekleme olsun.
   *
   * `null` = işletmenin KDV numarası YOK (eşik altı mikro işletme) ya da kayıt vermedi.
   */
  vatNumber: z.string().nullable(),
  line1: z.string(),
  postalCode: z.string(),
  city: z.string(),
});

/**
 * Kayıt okumasının ÜÇ sonucu — ikisi HTTP hatası değil, cevabın kendisi.
 *
 * `not_found` ("böyle bir kayıt yok") ile `unavailable` ("soramadık") ayrı tutulur ve bu ayrım
 * kapının en önemli kararı: birleştirseydik servis düştüğü gün her meşru başvuru "böyle bir şirket
 * yok" cevabı alır, aday kendi numarasını yanlış sanıp vazgeçerdi. Ekran ikisini ayrı cümleyle
 * karşılar — biri "numarayı kontrol edin", öteki "elle devam edin".
 */
export const B2bCompanyLookupSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('found'), company: B2bCompanySchema }),
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('unavailable') }),
]);

/**
 * AB vergi numarası doğrulaması — `GET /api/v1/b2b/vat/:number`.
 *
 * ÜÇ DEĞER, İKİ DEĞİL: `true` geçerli · `false` geçersiz · `null` **sorulamadı**. Üçüncüsü
 * `user_profiles.vat_number_valid` kolonunun kendi sözleşmesiyle aynı ve kaydın parçası olacak —
 * doğrulanamayan numarayı `false` saymak, sunucusu bakımda olan meşru bir şirketi reddetmek;
 * `true` saymak ise reverse charge'ı doğrulanmamış numaraya açmak olurdu (DOMAIN §5).
 */
export const B2bVatCheckSchema = z.object({
  valid: UserProfileSchema.shape.vatNumberValid,
});

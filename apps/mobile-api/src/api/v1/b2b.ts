import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import {
  checkEuVatNumber,
  lookupCompanyBySiret,
  readB2bApplicant,
  submitB2bApplication,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import type { B2bApplicationInput, B2bCompanyFacts } from '@lezzet/domain-core';
import {
  B2bApplicantSchema,
  B2bApplicationBodySchema,
  B2bApplicationResultSchema,
  B2bCompanyLookupSchema,
  B2bVatCheckSchema,
  PreferredLanguageEnum,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { AppEnv } from '../../context';
import type { V1Env } from './auth';

/*
  B2B BAŞVURU UÇLARI (08.7 · v3 tasarım 18, vPro) — Professionnels ekranının sunucu tarafı.

  ── KURAL BURADA DEĞİL ───────────────────────────────────────────────────────
  Alan denetimi `@lezzet/domain-core.b2bApplicationIssues`, yazma `@lezzet/application`ın başvuru
  kapısı, resmî kayıt ve vergi doğrulaması yine o paketin `b2b/` klasörü (21.31 terfisi — web
  köprü). Bu dosya taşıma katmanıdır: sorguyu çözer, kimliği jetondan alır, sonucu zarfa koyar.

  ── İKİ KÜME, İKİ AYRI DOSYA-İÇİ ROUTER ─────────────────────────────────────
  · OKUMALAR (`/b2b/company/:siret`, `/b2b/vat/:number`) AÇIK: form kimlik sorulmadan doldurulur —
    aday numarasını yazıp künyesini görmeden hesap açmaya ikna olmaz. Webde de öyle (server action
    ziyaretçiye açık). Bedeli kabul edilmiş bir maruziyet: iki uç da dış servise gidiyor, yani
    kötüye kullanım BİZİM IP'mizi yorar. Karşılığında elde edilen şey akışın kendisi; sınırlama
    gerekirse kapı bu iki satırdır.
  · YAZMA ve DURUM (`/me/b2b*`) Bearer'ın ARKASINDA: başvuru bir müşteri kaydının hâli, sahibi
    olmalı. Misafir ekranı formu doldurur, göndermeden önce kimlik adımından geçer (uygulamanın
    kurulu OTP akışı) — sunucu tarafında ikinci bir kapı açılmadı.

  ── MOTORLA BAĞ DERLEME KİLİDİYLE ────────────────────────────────────────────
  Gövde `B2bApplicationInput` olarak TİPLENİR: sözleşme motorun alan kümesinden saparsa burası
  DERLENMEZ (`types` paketi `domain-core`a bağlanamadığı için bağ ancak burada kurulabilir —
  katalogun `TextSegment`, geri bildirimin `FeedbackOutcome` kilitlerinin aynı deseni).
*/

/** Kimliksiz okumalar — `bearerAuth`tan ÖNCE mount edilir (router'daki sıra notu). */
export const b2bPublic = new Hono<AppEnv>();

/**
 * Resmî işletme kaydı — ekranın "Bul" düğmesi.
 *
 * ÜÇ SONUÇ DA `200`: `not_found` ve `unavailable` bizim arızamız değil, cevabın kendisi (sözleşme
 * künyesi). HTTP hatasına çevirseydik istemci ikisini de "bağlantı koptu" diye okur ve numarasını
 * yanlış yazan adaya "tekrar deneyin" derdi.
 */
b2bPublic.get('/b2b/company/:siret', async (c) => {
  const result = await lookupCompanyBySiret(c.req.param('siret'));
  const body = typeof result === 'string' ? { status: result } : { status: 'found' as const, company: result };
  return ok(c, B2bCompanyLookupSchema.parse(body));
});

/**
 * AB vergi numarası doğrulaması — ekranın canlı ✓ işareti.
 *
 * `valid: null` ("sorulamadı") bir hata DEĞİL ve başvuruyu ENGELLEMEZ: üye ülkelerin sunucuları
 * düzenli olarak cevap vermiyor ve meşru bir başvuruyu bunun için kesmek, servisin arızasını
 * müşterinin kusuru gibi göstermek olurdu (kapının kendi künyesi).
 */
b2bPublic.get('/b2b/vat/:number', async (c) => {
  const valid = await checkEuVatNumber(c.req.param('number'));
  return ok(c, B2bVatCheckSchema.parse({ valid }));
});

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/** Profil çözümü tek middleware'de — puan/adres uçlarının deseni; aynı `profile_not_found` emsali. */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

export const b2b = new Hono<CustomerEnv>();
b2b.use('*', resolveCustomer);

/**
 * Başvuru durumu + form ön dolgusu.
 *
 * `locale` ZORUNLU ve varsayılansız (20.2): ret gerekçesini operatör Türkçe yazar, başvuran kendi
 * dilinde okur. Varsayılan koysaydık dilini vermeyi unutan bir ekran Fransız bir kasaba Türkçe
 * gerekçe gösterir ve bu hiçbir yerde hata vermezdi.
 */
b2b.get('/', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const view = await readB2bApplicant(serviceDb(), c.get('customerId'), locale.data);
  if (!view) return fail(c, 'profile_not_found', 404);
  return ok(c, B2bApplicantSchema.parse(view));
});

/**
 * Başvurunun yazımı — kuyruğa koyar, ONAY VERMEZ (DOMAIN §10).
 *
 * Cevap `200` ve adlı: `invalid_application` eksik ALANLARI taşıyor, yani ekran hangi kutunun
 * reddedildiğini işaretleyebiliyor. Başarıda GÜNCEL DURUM döner (`pending`) — ekran ikinci bir
 * okuma turuna çıkmasın (adres uçlarının "cevap hep güncel görünüm" kararı).
 *
 * Yazımdan SONRA durum yeniden okunur, `submitB2bApplication`ın döndürdüğü profilden türetilmez:
 * hâl kararı motorun (`b2bStatusOf`) ve o kapı zaten okuma yolunda duruyor; ikinci bir türetme
 * yazsaydık aynı hâl iki yerde hesaplanırdı.
 */
b2b.post('/application', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const body = B2bApplicationBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  // ── DERLEME KİLİDİ (dosya künyesi) ─────────────────────────────────────────
  const { facts: rawFacts, ...rest } = body.data;
  const facts: B2bCompanyFacts = rawFacts;

  const db = serviceDb();
  const customerId = c.get('customerId');

  /* ── E-POSTA GÖVDEDEN DEĞİL OTURUMDAN (kullanıcı kararı 11.08 · MB-04) ──────
     Kullanıcının kurgusu: *"profesyonel bir kere oturum açsın, mailini girsin, OTP kodu gelsin ve
     onaylasın; bu bizim mail adresimiz olsun."* Yani başvurunun e-postası ARTIK BİR GİRDİ DEĞİL,
     kimliğin kendisidir.

     Neden gövdeye güvenilmiyor: gövdedeki adres DOĞRULANMAMIŞ bir metindi, hesabınki OTP'den
     geçmiş. İkisi ayrışabiliyordu ve ölçüldü (11.08) — misafir yolunda kimlik çekmecesi formdaki
     adresten beslenmiyor, kendi boş alanıyla açılıyor; müşteri X yazıp Y ile doğrulayabiliyor ve
     karar maili Y'ye gidiyordu. Motor alanı zorunlu tuttuğu için (`b2bApplicationIssues`) müşteri,
     hiçbir yere yazılmayan bir alanı doldurmak zorundaydı.

     Alan SÖZLEŞMEDEN kaldırılmadı, çünkü motor ve sözleşme web yüzeyiyle ORTAK — kaldırma kararı
     iki yüzeyin (koordinasyon defterinde soruldu). O güne dek burası tek doğruyu dayatıyor:
     gövde ne gönderirse göndersin, kayda giren adres oturumun sahibinin adresidir. Profil yoksa
     motorun kendi `profile_not_found` dalı zaten cevap veriyor; burada boş dize geçmek motorun
     `email` denetimini tetikler ve müşteri adlı bir ret görür — sessiz bir kabul olmaz. */
  const profile = await new UserProfileService(db).getById(customerId);
  const input: B2bApplicationInput = { ...rest, email: profile?.email ?? '' };

  const outcome = await submitB2bApplication(db, customerId, input, facts);
  if (outcome.status === 'profile_not_found') return fail(c, 'profile_not_found', 404);
  if (outcome.status === 'invalid_application') {
    return ok(c, B2bApplicationResultSchema.parse({ status: 'invalid_application', issues: outcome.issues }));
  }

  const view = await readB2bApplicant(db, customerId, locale.data);
  if (!view) return fail(c, 'profile_not_found', 404);
  return ok(c, B2bApplicationResultSchema.parse({ status: 'ok', applicant: view }));
});

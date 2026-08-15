import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  awardPoints,
  readCustomerPoints,
  readCustomerPointsHistory,
  readPointsRules,
  redeemCustomerPoints,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import {
  DEFAULT_PAGE_SIZE,
  MePointsHistoryPageSchema,
  MePointsRedeemResultSchema,
  MePointsViewSchema,
  PointsRulesSchema,
} from '@lezzet/types';
import { decodeCursor, encodeCursor } from '../../lib/request';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/** Geçmiş sorgusu — imleç opak, boy tavanlı (sipariş listesinin aynı sözleşmesi). */
const HISTORY_MAX_PAGE_SIZE = 50;
const HistoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/*
  `/me/points` (21.17) — hesap ekranının "Puanlarım" kartı ve puan → kupon çevirmesi. KURAL BURADA
  DEĞİL: kullanılabilirlik süzgeci, B2B kısa devresi, eşiğin ayardan okunması ve çevirmenin
  bölünemezliği `@lezzet/application`ın puan cüzdanı kapısında (`customer/points.ts` künyesi — web
  `lib/account/coupons.ts` + `lib/feedback/points.ts` kurallarının TERFİSİ). Bu dosya taşıma
  katmanıdır: kimliği çözer, sonucu zarfa koyar.

  Cevap İKİ uçta da AYNI ŞEKİL (`MePointsViewSchema`; çevirmede üstüne yalnız `redeemedCode`):
  çevirme bakiyeyi düşürür ve listeye kupon ekler, tek kaydı dönmek istemciyi ikinci okuma turuna
  mecbur bırakırdı — adres uçlarının "cevap hep güncel liste" kararıyla birebir aynı gerekçe.
*/

/**
 * **`GET /points/rules` — AÇIK UÇ, kimlik istemez** (kullanıcı kararı 12.08).
 *
 * Onboarding'in son adımı puan programını anlatıyor ve o ekranı gören kişi henüz misafirdir: hesabı
 * yok, `bearerAuth`ın arkasına hiç geçemez. Ama ekranın söylediği her sayı motorun uyguladığı sayı
 * olmak zorunda — alternatif, onboarding'e sabit sayı gömmek ve ayar değiştiği gün müşteriye
 * gerçekleşmeyecek bir vaat vermekti (29.07 denetiminin kapattığı arıza sınıfı).
 *
 * **Kişisel hiçbir şey taşımaz:** bakiye, davet kodu, kupon burada YOK — hepsi `/me/points`in işi.
 * Yani açık olması bir ödün değil, doğru sınır: bunlar zaten katalog fiyatı gibi herkese açık
 * program kuralları.
 */
export const pointsRules = new Hono<V1Env>();

pointsRules.get('/points/rules', async (c) => ok(c, PointsRulesSchema.parse(await readPointsRules(serviceDb()))));

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profil çözümü tek middleware'de — iki uç aynı satırları tekrar etmesin (adres uçlarının deseni).
 * Profili olmayan auth kullanıcısı `/me` ailesinin ortak cevabını alır (`profile_not_found`, 404):
 * trigger boşluğu ya da silinmiş kayıt; boş bir cüzdan uydurmak arızayı görünmez kılardı.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

export const points = new Hono<CustomerEnv>();
points.use('*', resolveCustomer);

/**
 * Puan kartı + kullanılabilir kuponlar. **B2B'de `points: null` döner, sıfır değil** — program
 * dışıdır ve ekran bölümü hiç çizmez; "0 puan" yazmak kazanılamayacak bir bakiyeyi boş bir hedef
 * gibi gösterirdi (CLAUDE §1: ölçülemeyen değer sıfır değildir).
 *
 * **Kart artık KAZANMA yollarını da taşıyor** (`earnWays` + `referralCode`): bakiyesi sıfır olan
 * müşteriye "puanın var/yok" demek yetmez, "nereden kazanırsın" demek gerekir ve o cevabın
 * sayıları ayardan gelir — ekran sayı UYDURMAZ. İkisi de kartın İÇİNDE, zarfın kökünde değil:
 * program dışı profilde ikisinin de anlamı yok ve tek koşulla düşerler (şemadaki künye).
 *
 * Bu GET'in bir yan etkisi var ve bilinçli: davet kodu yoksa uygulama katmanında ÜRETİLİR
 * (`ensureCustomerReferralCode` — web'in tembel üretiminin terfisi). Yazım burada değil kapıda;
 * bu dosya yine taşıma katmanıdır.
 */
points.get('/', async (c) => {
  const view = await readCustomerPoints(serviceDb(), c.get('customerId'));
  // `parse` süzgeçtir: pick dışı alan (kuponun `trigger`/`scope`ı, kotası) zarfa sızamaz.
  return ok(c, MePointsViewSchema.parse(view));
});

/**
 * **Günlük giriş puanı** (MB-50 · kullanıcı kararı 11.08) — günde bir kez, `points_visit` kadar.
 *
 * ── AÇIK NEYDİ ──────────────────────────────────────────────────────────────
 * Ödül yalnız WEB'de yazılıyordu (`apps/web/lib/feedback/visit-actions.ts`); native uygulamayı her
 * gün açan müşteri hiç kazanmıyordu. Ölçüldü 12.08: `awardPoints(reason:'visit')`ın tek çağrı yeri
 * web köprüsüydü. Onboarding artık bu ödülü müşteriye SÖYLEDİĞİ için açık kapanmak zorundaydı —
 * söylenip yazılmayan puan, ekranın motordan cömert olması demektir.
 *
 * ── NEDEN AYRI BİR UÇ, BAŞKA BİR ÇAĞRIYA İLİŞTİRME DEĞİL ────────────────────
 * Açılışta zaten atılan bir isteğe (vitrin okuması) iliştirmek daha ucuzdu ama o okuma misafirde de
 * çalışıyor, önbelleğe alınıyor ve bir gün başka bir sebeple değişebilir; defter yazımı o zaman
 * sessizce kaybolurdu. Yazımın kendi kapısı olsun ki tetikleyeni tek satırda görünür kalsın.
 *
 * **Tekillik veritabanında** (`points_entry_visit_day` — iş günü başına tek satır), burada değil:
 * uygulama gün içinde defalarca öne gelirse ikinci istek bir arıza değil normal davranıştır ve
 * motor onu zaten düşürür. **Cevap hep `true`** — ekranın söyleyeceği bir şey yok, ödül sessizdir
 * (karar seti 2h: *"uygulama açılınca — sessiz"*). Yazıldı mı yazılmadı mı bilgisini dönmek,
 * istemciyi "bugün kazandın mı" diye bir dal yazmaya davet ederdi.
 */
points.post('/visit', async (c) => {
  await awardPoints(serviceDb(), { customerId: c.get('customerId'), reason: 'visit' });
  return ok(c, true);
});

/**
 * **Puan geçmişi** — *"hangi puan nereden geldi"* (kullanıcı isteği 15.08).
 *
 * Keyset sayfalı, en yeni önce; imleç OPAK bir dize (sipariş listesinin aynı sözleşmesi) ve
 * bozuk gelirse listeyi baştan verir, 400 dönmez (`decodeCursor` künyesi).
 *
 * **Neden `/me/points` kartına eklenmedi:** kart tek turda okunan sabit bir küme (bakiye · eşik ·
 * kuponlar · kazanma yolları); geçmiş ise veriyle SINIRSIZ büyüyen bir defter. İkisini tek zarfa
 * koymak, hesap ekranını her açılışta ilk sayfa kadar satır okumaya mecbur ederdi — oysa geçmiş
 * ayrı bir ekranda ve müşteri oraya gitmeyebilir.
 *
 * **B2B 403 `not_eligible`** — çevirme kapısıyla aynı ret (`redeem`in künyesi): program dışı
 * profile boş liste dönmek *"hiç hareketiniz yok"* demek olurdu.
 */
points.get('/history', async (c) => {
  const parsed = HistoryQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);

  const outcome = await readCustomerPointsHistory(serviceDb(), {
    customerId: c.get('customerId'),
    cursor: decodeCursor(parsed.data.cursor),
    limit: parsed.data.limit,
  });
  if (outcome.status !== 'ok') return fail(c, outcome.status, 403);

  // Gövde `z.input<…>` ile TİPLENİR: kapının şekli sözleşmeden saparsa burası DERLENMEZ (sipariş
  // ucunun emsali). `parse` ayrıca süzgeçtir — `note`/`refId`/`createdBy` zarfa sızamaz.
  const body: z.input<typeof MePointsHistoryPageSchema> = {
    entries: outcome.entries.map((entry) => ({
      id: entry.id,
      points: entry.points,
      reason: entry.reason,
      at: entry.createdAt,
    })),
    nextCursor: outcome.nextCursor ? encodeCursor(outcome.nextCursor) : null,
  };
  return ok(c, MePointsHistoryPageSchema.parse(body));
});

/**
 * Puan → kupon çevirme.
 *
 * **GÖVDE ALMAZ ve bu bilinçli:** kaç puanın harcanacağını istemci söylemez, motor bakiyenin
 * tamamını çevirir. Bir sayı kabul etseydik ekranın gördüğü eşik ile motorun uyguladığı eşik
 * ayrışabilirdi (web action künyesindeki aynı karar) — ve o ayrışma hata vermez, yalnız müşteriyi
 * reddedilecek bir düğmeye bastırır.
 *
 * Adlı retler görünür döner: 409 `insufficient_balance` (bakiye çevirme anında yetmedi — yarış
 * hâli, isteğin kendisi geçerliydi) · 400 `below_minimum` · 403 `not_eligible` (B2B).
 */
points.post('/redeem', async (c) => {
  const outcome = await redeemCustomerPoints(serviceDb(), { customerId: c.get('customerId') });
  if (outcome.status !== 'ok') {
    const status = outcome.status === 'not_eligible' ? 403 : outcome.status === 'insufficient_balance' ? 409 : 400;
    return fail(c, outcome.status, status);
  }
  return ok(c, MePointsRedeemResultSchema.parse({ ...outcome.view, redeemedCode: outcome.code }));
});

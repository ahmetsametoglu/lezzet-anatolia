import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { z } from 'zod';
import { claimDiscoverSwipes, openDiscoverDeck, recordDiscoverSwipe } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import {
  DiscoverClaimBodySchema,
  DiscoverClaimResultSchema,
  DiscoverDeckSchema,
  DiscoverSwipeSchema,
  DiscoverVoteBodySchema,
  PreferredLanguageEnum,
} from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readJsonBody } from '../../lib/request';
import { optionalCustomerId, type V1Env } from './auth';

/**
 * Keşif turu uçları (21.19 · tasarım v3 `vKesif`) — aday ürün destesi + kaydırma yazımı, ve turu
 * hesaba bağlayan talep kapısı.
 *
 * ── İKİ HONO, İKİ KİMLİK REJİMİ ve bu bir GÜVENLİK KARARI ────────────────────
 * `discover` AÇIK kümededir (`router.ts`te `bearerAuth`tan ÖNCE bağlanır), `discoverClaim` kapının
 * ARKASINDA. Ayrımın sebebi kolaylık değil, akışın kendisi:
 *
 *   · **Deste ve oy ziyaretçiye açıktır** — web'de de öyle ve bu ölçülmüş bir karar, tahmin değil:
 *     `swipeAction` (`apps/web/app/(customer)/[locale]/discover/actions.ts`) kimliği sunucuda
 *     çözüyor ve `currentCustomerId` `null` dönünce kaydırmayı KİMLİKSİZ yazıyor. Gerekçesi
 *     ürünündür: keşif turu, hesabı olmayan ziyaretçiye "bak, senin fikrin bir şey değiştiriyor"
 *     demenin yoludur ve girişi turun ÖNÜNE koymak turu hiç başlatmamaktır (02-mimari §4:
 *     *"oturumsuz kullanım = müşteri gezinmesi; kapı ancak giriş gereken akışta çıkar"*).
 *     Bearer VARSA yalnız iki şey değişir: daha önce oylanan kartlar destede elenir ve oy sahibine
 *     yazılıp puan doğar. Erişim değişmez, 401 hiçbir hâlde dönmez.
 *   · **Talep kapısı kimliğin KENDİSİDİR** — "bu kaydırmaları BENİM hesabıma yaz" cümlesinin
 *     oturumsuz hâli yoktur. Bu yüzden `/me` altında yaşar (adres/puan/talep uçlarının emsali) ve
 *     kimliği bağlamdan alır, gövdeden ASLA.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Deste boyu, "aynı kartı iki kez sorma", adaylık doğrulaması, kısmi güncelleme, puanın sessiz
 * yazımı ve talebin üç kapısı `@lezzet/application`ın keşif kapısında (`feedback/discover.ts`) —
 * web keşif sayfasının okuduğu kuralların TAM AYNISI. Burada yalnız sorgu/gövde çözümü, kimlik
 * çözümü, sonucun sözleşme şekline indirgenmesi ve zarf var.
 */
export const discover = new Hono<AppEnv>();

/**
 * Turun destesi. `locale` ZORUNLU ve varsayılansız (katalog `LocaleSchema` künyesi): kart adları
 * sunucuda çözülür, sessizce Türkçeye düşmek gizli bir arızadır.
 *
 * **Boş deste 200'dür, 404 değil** (davet akışının tersi): aday ürün olmaması bir arıza değil —
 * operatör henüz aday açmamıştır ya da müşteri hepsini oylamıştır. Ekranın bunun için ayrı bir
 * hâli var; 404 dönmek onu hata ekranına düşürürdü.
 */
discover.get('/discover', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const customerId = await optionalCustomerId(db, c.req.header('authorization'));
  const cards = await openDiscoverDeck(db, locale.data, customerId);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü şekil sözleşmeye alan alan uymak zorunda ve
  // uymadığı gün burası DERLENMEZ. `parse` ayrıca SÜZGEÇTİR — fazla alan zarfa sızamaz.
  const body: z.input<typeof DiscoverDeckSchema> = { cards };
  return ok(c, DiscoverDeckSchema.parse(body));
});

/**
 * Bir kartın kaydırılması. Oy ANINDA yazılır: tur yarıda bırakılırsa verilen fikirler kaybolmaz
 * (web akışının aynı kararı).
 *
 * **Motorun iç retleri müşteriye ANLATILMAZ.** `not_candidate` sistemin iç yapısını söyler ve
 * müşterinin düzeltebileceği bir şey değil — kart listesi zaten sunucudan geldi; bu hâl ancak deste
 * çekildikten sonra ürünün durumu değiştiyse doğar. `not_found` ile birlikte tek anahtara iner:
 * `swipe_failed` (web `swipeAction`ın ölçülmüş kararı).
 */
discover.post('/discover/vote', async (c) => {
  const body = DiscoverVoteBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const customerId = await optionalCustomerId(db, c.req.header('authorization'));
  const outcome = await recordDiscoverSwipe(db, { customerId, ...body.data });
  if (outcome.status !== 'ok') return fail(c, 'swipe_failed', 400);

  const swipe: z.input<typeof DiscoverSwipeSchema> = outcome.swipe;
  return ok(c, DiscoverSwipeSchema.parse(swipe));
});

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapının istediği ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profil çözümü — `addresses.ts`teki desenin aynısı: profili olmayan auth kullanıcısı
 * `profile_not_found` (404) alır. Sessizce "0 bağlandı" dönmek, ziyaretçinin turunu kaybettiği bir
 * arızayı görünmez kılardı.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/**
 * Girişsizken yapılan turun HESABA BAĞLANMASI — `POST /me/discover/claim`.
 *
 * Kaydırma kimliklerini cihaz saklar (`/discover/vote` cevabının `id` alanı; yalnız girişsizde
 * dolar) ve giriş dönüşünde buraya getirir. Sahiplik iddiası doğrulanır: kapı yalnız KİMLİKSİZ,
 * `candidate` bağlamındaki ve oy taşıyan satırları kabul eder — başkasının kaydını devralmak yok,
 * ikinci kez ödenmek de yok (bir kez bağlanan satır artık kimliksiz değildir).
 *
 * Hiçbiri bağlanamasa bile cevap **200 + `{ linked: 0, points: 0 }`**: eskimiş ya da zaten
 * bağlanmış bir liste bir HATA değil, gecikmiş bir istektir — ekran o hâlde bildirimi hiç
 * göstermez. Hata dönmek, girişi başarılı olmuş müşteriye kırmızı bir ekran gösterirdi.
 */
export const discoverClaim = new Hono<CustomerEnv>();
discoverClaim.use('*', resolveCustomer);

discoverClaim.post('/claim', async (c) => {
  const body = DiscoverClaimBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const result = await claimDiscoverSwipes(serviceDb(), c.get('customerId'), body.data.swipeIds);
  const claim: z.input<typeof DiscoverClaimResultSchema> = result;
  return ok(c, DiscoverClaimResultSchema.parse(claim));
});

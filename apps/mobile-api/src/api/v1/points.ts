import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { readCustomerPoints, redeemCustomerPoints } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MePointsRedeemResultSchema, MePointsViewSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

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

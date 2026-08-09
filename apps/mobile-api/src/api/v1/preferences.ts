import { Hono } from 'hono';
import { updateCustomerPreferences } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MePreferencesSchema, MeSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/*
  `PATCH /me/preferences` (21.16) — hesap ekranının dil seçicisi ve kampanya anahtarları. KURAL
  BURADA DEĞİL: damga politikası ("yalnız değişen kanala damga"), öbür kanalın kaydının korunması
  ve dil değişiminin yazışma diline etkisi `@lezzet/application`ın tercih kapısında
  (`customer/preferences.ts` künyesi — web'in dil ve izin kurallarının TERFİSİ). Bu dosya taşıma
  katmanıdır: gövdeyi süzer, kimliği çözer, sonucu zarfa koyar.

  **Ayrı uç, `PATCH /me`ye eklenmiş alan DEĞİL** — gerekçe sözleşmede (`me-api.schema.ts`): ad ve
  telefon kimlik künyesidir, dil ve izin ise tercih; ikincisi GDPR kanıtı üretiyor ve reddi de
  doğrulaması da ayrı cinsten. Web'in aynı ayrımı üç ayrı kapıyla yaşıyor.

  Cevap GÜNCEL PROFİLDİR (`MeSchema` süzgeciyle — pick dışı alan zarfa sızamaz): istemci `publishMe`
  ile yayınlayacak, yani dönen gövde `GET /me` ile aynı şekilde olmak zorunda. Yazmayan bir çağrı
  (gelen değer kayıtlıyla aynı) da profili döner — eli boş dönmek istemciyi ikinci tura mecbur
  bırakırdı (adres uçlarının "cevap hep güncel liste" kararıyla aynı gerekçe).
*/

/**
 * İznin kaynak etiketi — kaydın `source` alanına yazılır ve operasyon müşteri kartında operatöre
 * ham hâliyle görünür ("· app-account"). Web hesap sayfası `account` yazıyor; NATIVE UYGULAMA
 * ayrı bir etiket kullanıyor çünkü kanıtın sorulduğu gün cevabın "hangi yüzeyden verildi"yi de
 * söylemesi gerekir — iki yüzey aynı etiketi paylaşsaydı kayıt bunu bir daha ayıramazdı.
 */
const CONSENT_SOURCE = 'app-account';

export const preferences = new Hono<V1Env>();

/**
 * Kimlik çözümü uç içinde (adreslerdeki gibi ayrı middleware'e alınmadı): burada TEK rota var,
 * beş rotanın paylaştığı bir kapı yok. Profili olmayan auth kullanıcısı `/me` ailesinin ortak
 * cevabını alır (`profile_not_found`, 404) — trigger boşluğu ya da silinmiş kayıt; boş bir profil
 * uydurmak arızayı görünmez kılardı.
 *
 * Adlı retler görünür döner: 400 (`no_changes` — hiçbir alan taşımayan gövde) · 404
 * (`profile_not_found`).
 */
preferences.patch('/', async (c) => {
  const body = MePreferencesSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  const outcome = await updateCustomerPreferences(db, { profileId: profile.id, source: CONSENT_SOURCE, ...body.data });
  if (outcome.status !== 'ok') return fail(c, outcome.status, outcome.status === 'profile_not_found' ? 404 : 400);
  return ok(c, MeSchema.parse(outcome.profile));
});

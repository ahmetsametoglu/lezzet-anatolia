import { Hono } from 'hono';
import { updateCustomerPreferences } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MePreferencesSchema, MeSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/*
  Hesap ekranının dil seçicisi ve kampanya anahtarları; kural uygulama katmanının tercih kapısındadır, bu dosya gövdeyi süzer ve
  kimliği çözer. Cevap güncel profildir, çünkü istemci onu `GET /me` ile aynı şekilde yayınlar.
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
 * Profili olmayan oturum `/me` ailesinin ortak cevabını alır (`profile_not_found`, 404), çünkü boş profil uydurmak arızayı görünmez
 * kılardı. Hiçbir alan taşımayan gövde 400 `no_changes` döner.
 */
preferences.patch('/', async (c) => {
  const body = MePreferencesSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  // Bilgi e-postası yanıtı bekletmez; süreç uzun ömürlü olduğu için iş yanıttan sonra da tamamlanır.
  const outcome = await updateCustomerPreferences(db, {
    profileId: profile.id,
    source: CONSENT_SOURCE,
    ...body.data,
    runLater: (task) => void task(),
  });
  if (outcome.status !== 'ok') return fail(c, outcome.status, outcome.status === 'profile_not_found' ? 404 : 400);
  return ok(c, MeSchema.parse(outcome.profile));
});

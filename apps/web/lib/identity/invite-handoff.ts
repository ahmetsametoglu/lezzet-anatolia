import 'server-only';
import { acceptNeighborInvite, tryAttachReferral } from '@lezzet/application';
// Alt yoldan (`settings-keys`/`bell-event` emsali): barrel o gün başka şeritlerin elindeydi (07.09).
import { claimCartLink } from '@lezzet/application/cart/link';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import { forgetCartLink, forgetInvite, forgetNeighborInvite, readCartLink, readInvite, readNeighborInvite } from './invite-cookie';

/**
 * **Çerezden KİŞİYE devir** — her giriş yolunun geçtiği tek nokta (17.11 · 12.08).
 *
 * İki davet de aynı yolculuğu yaşıyor: bağlantı kimliği olmayan bir ziyaretçide açılıyor, çerez
 * onu kimlik doğana kadar taşıyor, kimlik doğduğu an davet **kişiye** yazılıyor ve çerezin işi
 * bitiyor. Getiren daveti bunu ilk günden yapıyordu (`referred_by`); komşu daveti yapmıyordu ve
 * kullanıcının sorduğu yolculuk tam orada kırılıyordu — *"web'de hesap açsın, gezsin, sonra
 * uygulamayı yüklesin; sepete geldiğinde daveti görebilmeli."* Çerez bir cihazda kalır, kişi
 * kalmaz.
 *
 * **Neden tek dosya:** üç giriş yolu var (OTP action · Google callback · ileride WhatsApp) ve
 * üçünün de aynı iki adımı atması gerek. Ayrı ayrı yazılsalardı biri bir gün yalnız getireni
 * devreder, komşu davetini unuturdu — sessizce, çünkü devredilmeyen bir davet hata vermez.
 *
 * **Girişi ASLA düşürmez:** davet bir kolaylıktır, kimlik değil. Ama sessiz de değil — iz kalır.
 */
export async function handOffInvitesToCustomer(authUserId: string): Promise<void> {
  const [referralCode, neighborToken, cartToken] = await Promise.all([readInvite(), readNeighborInvite(), readCartLink()]);
  if (!referralCode && !neighborToken && !cartToken) return;

  // Getiren bağı: kendi kapısı zaten hatayı yutuyor ve gerekçesini log'a yazıyor.
  if (referralCode) {
    await tryAttachReferral(serviceDb(), authUserId, referralCode);
    await forgetInvite();
  }

  if (neighborToken) await handOffNeighbor(authUserId, neighborToken);
  if (cartToken) await handOffCartLink(authUserId, cartToken);
}

/**
 * **Sohbetten gelen sepeti kişiye yazar** (15.21) — üçüncü yolcu, aynı kapı.
 *
 * Profil yoksa çerez KORUNUR (komşu davetiyle aynı karar): `0002` tetikleyicisi henüz yazmamış
 * olabilir; bir sonraki istek aynı kapıdan geçer. Tüketildiyse SONUÇ ne olursa olsun çerez düşer —
 * jeton tek kullanımlıktır, tekrar denemenin bir hâli yok. Kimlik köprüsünün sonucu (birleşme,
 * devir, bağlanma) log'a KİMLİKLE düşer; içerik değil.
 */
export async function handOffCartLink(authUserId: string, token: string): Promise<void> {
  try {
    const profile = await new UserProfileService(serviceDb()).findByAuthUserId(authUserId);
    if (!profile) return;

    const outcome = await claimCartLink(serviceDb(), { token, customerId: profile.id });
    logger.info({ context: 'identity/invite-handoff', customerId: profile.id, outcome: outcome.status }, 'sepet bağlantısı tüketildi');
    await forgetCartLink();
  } catch (err) {
    logger.warn(
      { context: 'identity/invite-handoff', authUserId, err: err instanceof Error ? err.message : String(err) },
      'sepet bağlantısı kişiye yazılamadı — giriş etkilenmedi',
    );
  }
}

/**
 * Komşu davetini kişiye yazar.
 *
 * **Profil yoksa çerez KORUNUR** (getiren tarafının aynı kararı): trigger henüz yazmamış olabilir
 * ve daveti o yüzden kaybettirmek, kullanıcının şikâyet ettiği sessiz kaybın ta kendisi olurdu.
 * Bir sonraki istek aynı kapıdan geçer.
 *
 * Reddedilen kabul (sefer kapandı, kontenjan doldu, kendi daveti) çerezi DÜŞÜRÜR: o davetin
 * yeniden denenecek bir hâli yok ve tarayıcıda yedi gün daha durması yalnız gürültü olurdu.
 */
async function handOffNeighbor(authUserId: string, token: string): Promise<void> {
  try {
    const profile = await new UserProfileService(serviceDb()).findByAuthUserId(authUserId);
    if (!profile) return;

    const outcome = await acceptNeighborInvite(serviceDb(), { token, customerId: profile.id });
    if (outcome.status !== 'ok') {
      logger.info({ context: 'identity/invite-handoff', customerId: profile.id, reason: outcome.reason }, 'komşu daveti kabul edilmedi');
    }
    await forgetNeighborInvite();
  } catch (err) {
    logger.warn(
      { context: 'identity/invite-handoff', authUserId, err: err instanceof Error ? err.message : String(err) },
      'komşu daveti kişiye yazılamadı — giriş etkilenmedi',
    );
  }
}

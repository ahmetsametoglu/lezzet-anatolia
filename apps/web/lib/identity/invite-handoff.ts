import 'server-only';
import { acceptNeighborInvite, tryAttachReferral } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import { forgetInvite, forgetNeighborInvite, readInvite, readNeighborInvite } from './invite-cookie';

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
  const [referralCode, neighborToken] = await Promise.all([readInvite(), readNeighborInvite()]);
  if (!referralCode && !neighborToken) return;

  // Getiren bağı: kendi kapısı zaten hatayı yutuyor ve gerekçesini log'a yazıyor.
  if (referralCode) {
    await tryAttachReferral(serviceDb(), authUserId, referralCode);
    await forgetInvite();
  }

  if (neighborToken) await handOffNeighbor(authUserId, neighborToken);
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

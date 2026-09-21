import 'server-only';
import { acceptNeighborInvite, tryAttachReferral } from '@lezzet/application';
// Barrel'dan değil alt yoldan: `cart/link` barrel'a ihraç edilmiyor.
import { claimCartLink } from '@lezzet/application/cart/link';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import { forgetCartLink, forgetInvite, forgetNeighborInvite, readCartLink, readInvite, readNeighborInvite, rememberChatLinkNotice } from './invite-cookie';
import { chatLinkNoticeOf } from './cart-link-landing';

/**
 * Çerezdeki davetleri ve sohbet bağlantısını, kimlik doğduğu an kişiye yazar; her giriş yolu (e-posta kodu, Google dönüşü) bu
 * tek kapıdan geçer ki biri bir gün komşu davetini sessizce unutmasın. Girişi asla düşürmez: davet bir kolaylıktır, kimlik değil.
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
 * Profil yoksa çerez korunur: `0002` tetikleyicisi henüz yazmamış olabilir, sonraki istek aynı kapıdan geçer. Tüketilen jeton
 * sonuç ne olursa olsun düşer, çünkü tek kullanımlıktır.
 */
export async function handOffCartLink(authUserId: string, token: string): Promise<void> {
  try {
    const profile = await new UserProfileService(serviceDb()).findByAuthUserId(authUserId);
    if (!profile) return;

    const outcome = await claimCartLink(serviceDb(), { token, customerId: profile.id });
    logger.info({ context: 'identity/invite-handoff', customerId: profile.id, outcome: outcome.status }, 'sepet bağlantısı tüketildi');
    await forgetCartLink();
    // Sonuç müşteriye de söylenir: hesap sayfası girişten hemen sonra bağlanıp bağlanmadığını gösterir.
    await rememberChatLinkNotice(chatLinkNoticeOf(outcome.status));
  } catch (err) {
    logger.warn(
      { context: 'identity/invite-handoff', authUserId, err: err instanceof Error ? err.message : String(err) },
      'sepet bağlantısı kişiye yazılamadı — giriş etkilenmedi',
    );
  }
}

/**
 * Profil yoksa çerez korunur (tetikleyici henüz yazmamış olabilir); reddedilen kabul ise çerezi düşürür, çünkü o davetin
 * yeniden denenecek bir hâli yok.
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

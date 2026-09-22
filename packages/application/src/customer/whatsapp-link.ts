import { mergeCustomers } from './merge';
import { CustomerPhoneService, UserProfileService } from '@lezzet/database';
import { readableCode } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Gelen mesaj hattın kimde olduğunu kanıtlar ama hangi hesap olduğunu söylemez; jeton o boşluğu kapatır: giriş yapmış müşteriye
  üretilir, müşteri kendi sohbetinden gönderir. Sorgu jetondan kimliğe gittiği için güvenlik entropiden gelir (12 hane ≈ 60 bit,
  kısa ömür, tek kullanım); kısa bir kod hesap devralmaya açık olurdu.
*/

/** Mesajın içinde aranan kabuk; marka öneki sipariş referansıyla aynı aileden. */
const WA_LINK_MARK = 'LA-WA-';

/** Uzunluk müşteriyi yormaz, çünkü kodu yazmaz, hazır mesajla ya da kopyalayarak gönderir. */
const WA_LINK_TOKEN_LENGTH = 12;

/** Ömür yalnız ekrandan sohbete geçme süresi kadar; uzun ömrün faydası yok, sızan kodun açık kalma süresini uzatır. */
export const WA_LINK_TTL_MS = 15 * 60 * 1000;

/** Tekillik çakışmasında yeniden deneme sınırı; çakışma pratikte olmaz, sınır sonsuz döngüye karşı. */
const MAX_ATTEMPTS = 5;

/** Mesajın içindeki jeton — yoksa `null`. Büyük/küçük harfe duyarsız: müşterinin klavyesi düzeltebilir. */
export function waLinkTokenIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = new RegExp(`${WA_LINK_MARK}([A-Z0-9]{${WA_LINK_TOKEN_LENGTH}})`, 'i').exec(text);
  return match ? match[1]!.toUpperCase() : null;
}

export type StartWhatsappLinkOutcome =
  /** `code` mesaja kabuğuyla birlikte olduğu gibi konur. */
  | { status: 'ok'; code: string; expiresAt: string }
  | { status: 'profile_not_found' }
  /** Çakışma denemeleri tükendi; arızadır, sessiz geçmez. */
  | { status: 'unavailable' };

/**
 * Her basış yeni jeton üretir ve öncekini geçersizler; ekranda görünmeyen bir jeton açık kalmasın. Mesaj metni burada kurulmaz,
 * çünkü müşteriye görünen cümle sözlükte yaşar.
 */
export async function startWhatsappLink(db: SupabaseClient, customerId: string): Promise<StartWhatsappLinkOutcome> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return { status: 'profile_not_found' };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const token = readableCode(WA_LINK_TOKEN_LENGTH);
    const expiresAt = new Date(Date.now() + WA_LINK_TTL_MS).toISOString();
    try {
      await profiles.update({ id: customerId, waLinkToken: token, waLinkExpiresAt: expiresAt });
      return { status: 'ok', code: `${WA_LINK_MARK}${token}`, expiresAt };
    } catch (err) {
      // Yalnız tekillik çakışması yeniden denenir; başka hata gerçek arızadır.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('23505') && !message.includes('user_profiles_wa_link_token_key')) throw err;
    }
  }

  // Jeton sırdır, günlüğe yalnız kimlik yazılır.
  logger.warn({ context: 'customer/whatsapp-link', customerId }, 'bağlama jetonu üretilemedi (çakışma tekrarı tükendi)');
  return { status: 'unavailable' };
}

export type ConsumeWhatsappLinkOutcome =
  /** Mesajda jeton yok; gelen mesajların olağan hâli. */
  | { status: 'none' }
  /** Süresi dolmuş, kullanılmış ya da hiç olmamış jeton tek cevaba düşer; ayırmak jetonun varlığını dışarıya sızdırırdı. */
  | { status: 'invalid' }
  /** Bağ kuruldu (ya da zaten vardı, tazelendi). */
  | { status: 'linked'; customerId: string }
  /** Numara başka bir gerçek kayıttaydı ve buraya devredildi; taşınan yalnız kanaldır, eski kaydın geçmişi yerinde kalır. */
  | { status: 'transferred'; customerId: string; previousHolderId: string }
  /** Numara bir TASLAĞA bağlıydı; taslak hesaba birleştirildi ve bağ hesaba geçti. */
  | { status: 'merged'; customerId: string; mergedId: string };

/**
 * Webhook bunu kimlik çözümünden önce çağırır; sonra çağırsa tanınmayan numaraya taslak açılır ve bağlanacak hesap ortada kalırdı.
 * Numara çoğu zaman önce yazışmadan doğan bir taslağa bağlıdır, o yüzden taslak birleştirme olağan yoldur.
 */
export async function consumeWhatsappLink(db: SupabaseClient, phone: string, text: string | null): Promise<ConsumeWhatsappLinkOutcome> {
  const token = waLinkTokenIn(text);
  if (!token) return { status: 'none' };

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByWaLinkToken(token);
  if (!profile) return { status: 'invalid' };

  const suresiGecti = !profile.waLinkExpiresAt || new Date(profile.waLinkExpiresAt).getTime() < Date.now();
  if (suresiGecti) {
    await temizle(profiles, profile.id);
    return { status: 'invalid' };
  }

  // Jeton her hâlde düşer: tek kullanım başarısız denemede de geçerli bir güvenlik özelliğidir.
  await temizle(profiles, profile.id);
  return bindPhoneToAccount(db, { accountId: profile.id, phone, context: 'customer/whatsapp-link' });
}

export type BindPhoneOutcome = Exclude<ConsumeWhatsappLinkOutcome, { status: 'none' }>;

/**
 * Kanıtlanmış numarayı hesaba bağlayan ortak gövde: WhatsApp jetonu da sepet bağlantısı da buradan geçer ki taslak birleştirme ve
 * kanal devri iki kapıda farklı davranmasın. `context` günlükte hangi kapıdan gelindiğini gösterir.
 */
export async function bindPhoneToAccount(
  db: SupabaseClient,
  input: { accountId: string; phone: string; context: string },
): Promise<BindPhoneOutcome> {
  const profiles = new UserProfileService(db);
  const phones = new CustomerPhoneService(db);
  const kanit = await phones.recordProof(input.accountId, input.phone);

  if (kanit.status !== 'taken') return { status: 'linked', customerId: input.accountId };

  const holderId = kanit.row?.customerId ?? null;
  if (!holderId) return { status: 'invalid' }; // yarışta emekliye ayrılmış — müşteri tekrar dener

  const holder = await profiles.getById(holderId);
  const taslakMi = holder?.isDraft === true && holder.authUserId === null && holder.mergedIntoId === null;
  if (!holder || !taslakMi) {
    /* Hesabını ve hattı şu an kanıtlayan kişi, hattın geçmişteki sahibinden önce gelir; birleştirme geri alınamadığı için yalnız
       kanal devredilir ve emekli satır "numara kimdeydi" sorusu için kalır. */
    if (kanit.row) await phones.retire(kanit.row.id);
    const yeni = await phones.recordProof(input.accountId, input.phone);
    if (yeni.status === 'taken') {
      // Emeklilikle yeni yazım arasında başkası kaptı; tekrar ederse aynı numara iki kimliğe düşmüş demektir.
      logger.warn({ context: input.context, customerId: input.accountId, holderId }, 'bağlama: devir yarışta kaybedildi');
      return { status: 'invalid' };
    }
    logger.info({ context: input.context, customerId: input.accountId, previousHolderId: holderId }, 'bağlama: numara önceki kayıttan DEVRALINDI');
    return { status: 'transferred', customerId: input.accountId, previousHolderId: holderId };
  }

  // Kanıt satırı `merge_customers` içinde taşınır. Uygulama kapısı çağrılır, çünkü birleşmenin ödül sonucu SQL'de yapılamıyor.
  await mergeCustomers(db, { targetId: input.accountId, sourceId: holderId });
  logger.info({ context: input.context, customerId: input.accountId, mergedId: holderId }, 'bağlama: WhatsApp taslağı hesaba birleştirildi');
  return { status: 'merged', customerId: input.accountId, mergedId: holderId };
}

/** Jeton ve süresi birlikte düşer; DB kısıtı biri olmadan ötekine izin vermez. */
function temizle(profiles: UserProfileService, customerId: string): Promise<unknown> {
  return profiles.update({ id: customerId, waLinkToken: null, waLinkExpiresAt: null });
}

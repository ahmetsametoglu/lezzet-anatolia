import { PriceGroupService, UserProfileService } from '@lezzet/database';
import { deriveChannel } from '@lezzet/domain-core';
import type { Channel } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Vitrinin "kim soruyor" tarafı (DOMAIN §5, §10): hangi fiyatın okunacağı, yer çözümünden ayrı eksen. Web oturumdan,
 * mobil Bearer'dan çözdüğü müşteri kimliğini bu kapıya verir.
 */

export interface PricingViewer {
  /**
   * Fiyatın okunacağı kanal; onaysız şirket B2C'dir (DOMAIN §10). Daraltma burada, çünkü fiyat satırı bu kanaldan okunur;
   * motor da aynı daraltmayı yapar.
   */
  channel: Channel;
  /** Motora olduğu gibi geçer; `null` (hiç başvurmamış) onay DEĞİLDİR. */
  b2bApproved: boolean;
  /** Müşteriye özel fiyat satırlarının okunacağı kimlik; ziyaretçide `null`. */
  customerId: string | null;
  /**
   * Fiyat grubunun yüzdesi; ziyaretçide ve grupsuz müşteride `null`. Yüzde burada çözülür ki fiyat okuyan her yer grup tablosuna gitmesin.
   */
  groupPercentOff: number | null;
}

/** Ziyaretçi — kimliksiz, perakende. Bağlamı olmayan okumaların (boş bağlam) hâli. */
export const VISITOR: PricingViewer = { channel: 'b2c', b2bApproved: false, customerId: null, groupPercentOff: null };

/**
 * Müşterinin geçerli kanalı: şirket olmak yetmez, onay da gerekir. Sepet ucu profili zaten okuduğu için ayrı fonksiyondur.
 */
export function effectiveChannelOf(profile: { type: string | null; b2bApproved: boolean | null }): Channel {
  const channel = deriveChannel({ isCompany: profile.type === 'company' });
  return channel === 'b2b' && profile.b2bApproved === true ? 'b2b' : 'b2c';
}

/**
 * Müşteri kimliğinden görüntüleyen künyesi; kimliğin tek kaynağı oturum değildir (misafir OTP, mobil Bearer).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`)
 */
export async function pricingViewerOf(db: SupabaseClient, customerId: string | null): Promise<PricingViewer> {
  if (!customerId) return VISITOR;
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return VISITOR;

  const b2bApproved = profile.b2bApproved === true;
  const effective = effectiveChannelOf(profile);
  // Grup yüzdesi yalnız toptan kanalda okunur: onaysız şirket B2C'ye düşerken kademe de kapanır
  // (motor da aynı kuralı uygular — çift kat, `channel` daraltmasının aynı gerekçesi).
  const groupPercentOff =
    effective === 'b2b' && profile.priceGroupId
      ? ((await new PriceGroupService(db).getById(profile.priceGroupId))?.percentOff ?? null)
      : null;
  return {
    channel: effective,
    b2bApproved,
    customerId: profile.id,
    groupPercentOff,
  };
}

import { UserProfileService } from '@lezzet/database';
import { nextMarketingConsent, type MarketingConsentToggles } from '@lezzet/domain-core';
import type { MarketingChannel, MarketingConsent, PreferredLanguage, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Dil ve kampanya izinleri web hesap sayfası, native hesap ekranı ve WhatsApp sohbeti için bu kapıdan yazılır. Dil yazışmanın da
  dilidir: sonraki e-postalar yeni dile geçer, verilmiş siparişin e-postaları siparişin kendi dilinde kalır.
*/

export type UpdateCustomerPreferencesOutcome =
  | { status: 'ok'; profile: UserProfile }
  | { status: 'no_changes' | 'profile_not_found' };

export async function updateCustomerPreferences(
  db: SupabaseClient,
  input: {
    profileId: string;
    /**
     * Kaydın `source` alanı; operasyon müşteri kartında ham hâliyle görünür. Varsayılansız, çünkü kaynağı kendisi uyduran kapı
     * mobilden verilen izni web'inkinden ayırt edilemez kılardı.
     */
    source: string;
    preferredLanguage?: PreferredLanguage;
    marketingConsent?: MarketingConsentToggles;
  },
): Promise<UpdateCustomerPreferencesOutcome> {
  // Talimatsız gövde görünür retle döner: sessiz başarı, yanlış anahtarla istek kuran istemciyi "kaydediyorum" sanısında bırakırdı.
  const channels = Object.keys(input.marketingConsent ?? {}) as MarketingChannel[];
  if (input.preferredLanguage === undefined && channels.length === 0) return { status: 'no_changes' };

  const profiles = new UserProfileService(db);
  // `marketing_consent` tek jsonb kolonu: öbür kanalın kaydını korumak için mevcut nesne okunur.
  const profile = await profiles.getById(input.profileId);
  if (!profile) return { status: 'profile_not_found' };

  const patch: { id: string; preferredLanguage?: PreferredLanguage; marketingConsent?: MarketingConsent } = {
    id: input.profileId,
  };

  if (input.preferredLanguage !== undefined && input.preferredLanguage !== profile.preferredLanguage) {
    patch.preferredLanguage = input.preferredLanguage;
  }

  const consent = input.marketingConsent
    ? nextMarketingConsent(profile.marketingConsent, input.marketingConsent, input.source, new Date().toISOString())
    : null;
  if (consent) patch.marketingConsent = consent;

  // Değişen bir şey yoksa yazılmaz ama cevap yine güncel profildir, çünkü istemci onu yayınlıyor. Dil ve izin tek `update`te gider:
  // ikiye bölmek, biri düşerse yarım tercih bırakırdı.
  if (Object.keys(patch).length === 1) return { status: 'ok', profile };

  return { status: 'ok', profile: await profiles.update(patch) };
}

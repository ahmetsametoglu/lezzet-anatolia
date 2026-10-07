import { UserProfileService } from '@lezzet/database';
import type { MarketingChannel, MarketingConsent, PreferredLanguage, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Dil ve kampanya izinleri web hesap sayfası, native hesap ekranı ve WhatsApp sohbeti için bu kapıdan yazılır. Dil yazışmanın da
  dilidir: sonraki e-postalar yeni dile geçer, verilmiş siparişin e-postaları siparişin kendi dilinde kalır.
*/

/** Gövdeden gelen kanal başına "açık mı" bayrakları. Değer boolean, çünkü kanıtın zamanını ve kaynağını sunucu yazar. */
export type CustomerConsentToggles = Partial<Record<MarketingChannel, boolean>>;

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
    marketingConsent?: CustomerConsentToggles;
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

  const consent = changedConsent(profile.marketingConsent, input.marketingConsent, input.source);
  if (consent) patch.marketingConsent = consent;

  // Değişen bir şey yoksa yazılmaz ama cevap yine güncel profildir, çünkü istemci onu yayınlıyor. Dil ve izin tek `update`te gider:
  // ikiye bölmek, biri düşerse yarım tercih bırakırdı.
  if (Object.keys(patch).length === 1) return { status: 'ok', profile };

  return { status: 'ok', profile: await profiles.update(patch) };
}

/**
 * İzin nesnesinin yeni hâli; değişen kanal yoksa `null`. Yalnız değişen kanal tek bir `at` ile damgalanır, çünkü aynı değeri yeniden
 * damgalamak hiç yaşanmamış bir onay anı uydurur ve ilk kaynağı (`checkout`) ezerdi.
 */
function changedConsent(current: MarketingConsent, toggles: CustomerConsentToggles | undefined, source: string): MarketingConsent | null {
  if (!toggles) return null;

  const at = new Date().toISOString();
  const next: MarketingConsent = { ...current };
  let changed = false;

  for (const channel of Object.keys(toggles) as MarketingChannel[]) {
    const granted = toggles[channel];
    if (granted === undefined) continue;
    // Kayıtsız kanal `false` sayılır: "hiç sorulmadı" ret kaydına dönmesin, gerçek geri çekme yine damgalansın.
    if ((current[channel]?.granted ?? false) === granted) continue;
    next[channel] = { granted, at, source };
    changed = true;
  }

  return changed ? next : null;
}

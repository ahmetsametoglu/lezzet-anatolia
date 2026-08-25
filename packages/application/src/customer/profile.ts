import { UserProfileService } from '@lezzet/database';
import { normalizePhone } from '@lezzet/helper';
import type { UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  MÜŞTERİ PROFİL GÜNCELLEMESİ — web hesap sayfasının `updateProfileAction`ındaki kuralların
  paket hâli (21.14c): ölçüt karşılandı — aynı kuralları artık İKİ yüzey istiyor (web formu +
  mobil profil çekmecesi) ve kopyalamak yasak (CLAUDE §1). Web action'ı kendi yüzeyinde köprü
  olarak duruyor; benimsemesi web şeridinin işi (defter kaydı 08.08).

  Kurallar web'tekiyle BİREBİR:
  · Ad boş geçilemez — adsız bir kart, siparişin kime gittiğini söyleyemez.
  · Telefon E.164'e indirgenir (`normalizePhone`): "+33 6…" ile "0033 6…" aynı kişi için iki
    anahtar olmasın (bul-veya-oluştur ayrı kişi sayardı). Çözülemeyen numara SESSİZCE düşürülmez.
  · **`phone_taken` KALKTI (04.10).** Bu kural bir tur şöyleydi: `user_profiles_phone_key` ihlali
    görünür bir ret olarak okunurdu. İhlal artık doğamaz — indeks kaldırıldı, çünkü tekilliğin
    gerekçesi "bu kolon kimlik anahtarı"ydı ve o varsayım açığın kendisiydi (doğrulanmamış bir dize
    kimlik kuruyordu). Kolon bugün yalnız İLETİŞİM numarasıdır; kimlik anahtarı kanıtlanmış numaranın
    kendi kaydında (`customer_phone`, 0001). Aynı numarayı iki müşterinin taşıması artık meşru —
    aile telefonu, işyeri hattı.

  Sonuç GÖRÜNÜR RETLİ döner (kurye kapılarının emsali): olumsuz hâller istisna değil, adlı
  durumlardır — taşıma katmanı anahtarı zarfa koyar, cümleyi ekran kurar.
*/

export type UpdateCustomerProfileOutcome = { status: 'ok'; profile: UserProfile } | { status: 'name_required' | 'phone_invalid' };

export async function updateCustomerProfile(
  db: SupabaseClient,
  input: { profileId: string; name?: string; phone?: string | null },
): Promise<UpdateCustomerProfileOutcome> {
  const patch: { id: string; name?: string; phone?: string | null } = { id: input.profileId };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { status: 'name_required' };
    patch.name = name;
  }

  if (input.phone !== undefined) {
    const raw = input.phone?.trim() ?? '';
    if (!raw) {
      patch.phone = null;
    } else {
      const phone = normalizePhone(raw);
      if (!phone) return { status: 'phone_invalid' };
      patch.phone = phone;
    }
  }

  return { status: 'ok', profile: await new UserProfileService(db).update(patch) };
}

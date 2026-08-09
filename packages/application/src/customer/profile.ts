import { UserProfileService, constraintOf } from '@lezzet/database';
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
  · Numara çakışması GÖRÜNÜR reddir: `user_profiles_phone_key` kısıt ihlali `phone_taken` olarak
    okunur — kuralın tuttuğu yer veritabanı, ön sorgu yarışa açık olurdu.
  · BEKLEYEN(04.10) burada da geçerli: numara doğrulanmadan kimlik anahtarına yazılıyor; kapanışı
    numaraya kod akışı. O güne dek bu alan bir İLETİŞİM numarasıdır (web'in aynı işareti).

  Sonuç GÖRÜNÜR RETLİ döner (kurye kapılarının emsali): olumsuz hâller istisna değil, adlı
  durumlardır — taşıma katmanı anahtarı zarfa koyar, cümleyi ekran kurar.
*/

export type UpdateCustomerProfileOutcome =
  | { status: 'ok'; profile: UserProfile }
  | { status: 'name_required' | 'phone_invalid' | 'phone_taken' };

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

  try {
    const profile = await new UserProfileService(db).update(patch);
    return { status: 'ok', profile };
  } catch (err) {
    if (constraintOf(err) === 'user_profiles_phone_key') return { status: 'phone_taken' };
    throw err;
  }
}

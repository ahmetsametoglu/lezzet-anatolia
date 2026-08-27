import type { SupabaseClient } from '@supabase/supabase-js';
import { UserProfileService } from '@lezzet/database';

/**
 * **Hızlı giriş kapılarının ORTAK ön şartı: KURULMAMIŞ veritabanına hesap açılmaz** (mobil şeridin
 * saha bulgusu 26.08).
 *
 * ── ÖLÇÜLEN ARIZA ────────────────────────────────────────────────────────────
 * Cihaz turu sürerken `db:refresh` koştu. `auth.users` silindiği anda dev giriş düğmesi
 * `kurye@lezzetanatolia.fr` için `generateLink` çağırdı; o çağrı kayıtsız e-postada auth
 * kullanıcısını AÇAR, yani auth satırı **seed'den önce** doğdu. `0002` trigger'ı e-postayla profil
 * bulamayınca yeni profil açtı: **adsız, `roles = {admin}`, kapsamsız** (ölçüm 14:06:55). Ardından
 * `seedKisiler` o satırı "Marc Lemoine zaten var" diye benimsedi — kurye hiç doğmadı, ortada kurye
 * e-postalı bir "yönetici" kaldı ve hiçbir yerde hata yoktu.
 *
 * ── `{admin}` BİR VARSAYILAN DEĞİL ───────────────────────────────────────────
 * Trigger'ın rol varsayılanı `{customer}`. Admin yalnız AÇILIŞ KURALINDAN gelir: *"hiç admin yoksa
 * doğan ilk hesap admin olur"* (`0002` künyesi). Kural üretimde **gerekli ve doğru** — birinin ilk
 * yönetici olması lazım ve o an tabloda kimse yoktur. Yerelde ise `db:reset` aynı pencereyi tekrar
 * tekrar açıyor. Yani tuzağın kaynağı trigger değil, kapının **o pencerede yazabilmesi**.
 *
 * ── NEDEN "KAYITSIZ E-POSTAYI TÜMDEN REDDET" DEĞİL ───────────────────────────
 * Mobil kapının künyesi ve testi bir kararı çiviliyor: *"yerel geliştirmede uç, verilen HER
 * e-postaya oturum verir; e-posta süzgeci bilerek yok — test hesabı değiştikçe uca dokunmak
 * gerekmesin"* (`preferences.test.ts`, *"KAYITSIZ e-posta da kabul edilir — ve bu BİLİNÇLİ"*).
 * O karar hâlâ geçerli ve ölçüm onu yanlışlamıyor: zarar **yaratmaktan** değil, açılış kuralı
 * SİLAHLIYKEN yaratmaktan doğdu. Kapı bu yüzden yalnız o pencereyi kapatıyor — kurulu bir
 * veritabanında kayıtsız e-posta eskisi gibi `{customer}` doğurur ve kabul edilir.
 *
 * ── İKİNCİ HAT ───────────────────────────────────────────────────────────────
 * Bu kapı yalnız KENDİ yolunu kapatır; profil e-postadan açan başka yollar var (gerçek OTP akışı,
 * elle yazılan satır). O yüzden seed de artık benimsediği kimliği doğruluyor: tanımına uymayan
 * satırı sessizce kabul etmiyor, onarıp gürültü çıkarıyor (`scripts/seed/people.ts` → `onarSapan`).
 */
export type DevLoginRefusal = 'unseeded_database';

/**
 * Kapı yazmadan önce sorar: **bu istek yeni bir kimlik doğuracak mı, ve doğarsa yönetici mi olacak?**
 *
 * `null` = engel yok. Profili olan e-posta hiçbir hâlde engellenmez — orada `generateLink` yalnız
 * bağlar, rol değiştirmez (ölçüldü 11.08: bağlanan kurye `roles: ['courier']` kaldı).
 */
export async function devLoginRefusal(db: SupabaseClient, email: string): Promise<DevLoginRefusal | null> {
  const profiles = new UserProfileService(db);
  // İki OLGU okunur, kararı motor verir. İkincisi profil varken gereksiz ama kısa devre YAPILMIYOR:
  // "profil var, o hâlde yönetici de vardır" diye uydurulmuş bir olgu, motorun tablosunu yalanlar.
  const [profile, anyAdminExists] = await Promise.all([profiles.findByEmail(email), profiles.hasAdmin()]);
  return devLoginRefusalOf({ profileExists: profile !== null, anyAdminExists });
}

/**
 * Kararın KENDİSİ — DB'siz, çünkü ölçülemeyen hâli ("hiç yönetici yok") ancak burada sınanabilir:
 * kurulu bir veritabanında o hâli üretmek, tüm paketin okuduğu yönetici satırlarını silmek olurdu
 * (`CLAUDE §4b`: küresel tekil satır kirletilmez). Karar iki olguya bakıyor ve tablosu üç satır.
 */
export function devLoginRefusalOf(facts: { profileExists: boolean; anyAdminExists: boolean }): DevLoginRefusal | null {
  // Kimliği olan adres hiçbir hâlde engellenmez: orada çağrı YARATMIYOR, bağlıyor.
  if (facts.profileExists) return null;
  return facts.anyAdminExists ? null : 'unseeded_database';
}

/**
 * Ret metni de ORTAK: iki kapının aynı arızayı iki farklı cümleyle anlatması, aynı cümleyi arayan
 * kişinin yalnız birini bulması demektir. Metin çözümü de söylüyor — teşhis "kapı mı bozuk?" diye
 * başlamasın diye.
 */
export const DEV_LOGIN_UNSEEDED_DATABASE =
  'Veritabanı henüz kurulmamış (hiç yönetici yok). Şimdi açılacak hesap, `0002` açılış kuralı yüzünden YÖNETİCİ doğardı — seed bitsin (`pnpm db:seed`), sonra tekrar deneyin.';

import 'server-only';
import { UserProfileService, serviceDb } from '@lezzet/database';
import type { PreferredLanguage } from '@lezzet/types';

/**
 * Yeni açılan müşteri kartına DİLİ yazar (04.9).
 *
 * Sorun şuydu: `user_profiles.preferred_language` uygulamada hiç yazılmıyordu. Kolonun DB
 * varsayılanı `'fr'`; profilleri açan da bir trigger (0002). Sonuç: müşteri siteyi Türkçe gezip
 * Türkçe sipariş verse de kartı "fr" kalıyor, sipariş dışı bütün mailleri (talep yanıtı, geri
 * bildirim daveti) Fransızca gidiyordu. Şablonlar üç dilde hazırdı — eksik olan tek şey hangi dilin
 * seçileceğini söyleyen veriydi.
 *
 * **Yalnız İLK kez yazılır.** Sonraki girişlerde dokunulmaz: tercih müşterinindir, tarayıcısının o
 * günkü hâlinin değil. Fransızca bir bağlantıya tıklayıp giren Türk müşterinin kartı, o tek tıklama
 * yüzünden dil değiştirmemeli. Değiştirmek isteyen hesap ekranından değiştirir.
 *
 * Sipariş MAİLLERİ buraya bağlı değildir: onların dili siparişin kendi `locale`'inden gelir (0015) —
 * o siparişin verildiği andaki dil, sonradan oynamayan bir kayıt.
 */
export async function seedPreferredLanguage(authUserId: string, locale: PreferredLanguage): Promise<void> {
  const profiles = new UserProfileService(serviceDb());
  const profile = await profiles.findByAuthUserId(authUserId);
  // Profil yoksa trigger henüz yazmamıştır ya da yazamamıştır; dil yüzünden girişi bozmayız.
  if (!profile) return;
  await profiles.update({ id: profile.id, preferredLanguage: locale });
}

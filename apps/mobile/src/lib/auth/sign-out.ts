import { forgetAccountLocale } from '@/lib/i18n/app-locale';

import { releasePushRegistration } from '@/lib/push/register-device';
import { resetDeliveryAddress } from '@/screens/customer-kit/delivery-address-store';

import { getSupabase } from './supabase';
import { clearStoredSession } from './session-store';

/**
 * Çıkış — `scope: 'local'`: bu cihazın oturumu kapanır (refresh token'ın sunucuda küresel iptali
 * ayrı ürün kararı; "tüm cihazlardan çıkış" gelirse buradan tek satırla döner). Supabase temizliği
 * ağdan bağımsız denenir, depo HER durumda elle de boşaltılır — çıkış asla yarım kalmaz.
 *
 * KARTTAN YANSIYAN DİL DE ÇIKAR (16.08): oturum anahtarını silip dili bırakmak, bir sonraki YENİ
 * hesabı gidenin diliyle açıyordu — gerekçe ve ölçüm `lib/i18n/app-locale` künyesinde. Kullanıcının
 * kendi seçtiği dil düşmez; ayrımı o modül yapar, burada koşul yazılmaz (iki yerde iki ölçüt olurdu).
 *
 * SEÇİLİ TESLİMAT ADRESİ DE DÜŞER (27.08): kimliği bellekte tutan depo kendi künyesinde "müşteri
 * değişince seçim düşer" diyordu ama kapıyı çağıran yoktu (knip ölü ihraç olarak gösterdi). Kalan
 * kimlik yeni müşteride hiçbir şeye karşılık gelmez; sunucu varsayılana düşerek kendini koruyor
 * ama ekran o arada başkasının adresini seçili gösterirdi. Cihaz durumunu boşaltan TEK kapı burası.
 */
export async function signOut(): Promise<{ error: string | null }> {
  // Push jetonu OTURUM KAPANMADAN silinir (14.14): silme ucu yetki ister — sıra ters kurulsaydı
  // istek 401 alır ve cihaz önceki hesabın kulağı olarak kalırdı (sunucudaki devir son emniyet).
  await releasePushRegistration();
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  await clearStoredSession();
  await forgetAccountLocale();
  resetDeliveryAddress();
  return { error: error?.message ?? null };
}

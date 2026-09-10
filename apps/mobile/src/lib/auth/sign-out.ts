import { releasePushRegistration } from '@/lib/push/register-device';

import { endDeviceSession } from './session-end';

/**
 * Gönüllü çıkış — önce push kaydı bırakılır, sonra cihaz oturumu kapanır (`endDeviceSession`:
 * supabase'in yerel çıkışı, oturum deposu, karttan yansıyan dil, seçili teslimat adresi —
 * gerekçeleri orada). O yarı 21.304'te oraya taşındı: sunucunun reddettiği oturum da aynı cihaz
 * durumunu boşaltmalı ve iki ayrı temizlik bir gün birbirinden ayrışırdı (CLAUDE §1).
 *
 * Reddedilen oturum bu kapıdan GEÇMEZ (`endRejectedSession`): ilk adım yetki ister ve reddedilmiş
 * kimlikle atılan istek 401 alıp aynı kapanışı yeniden tetiklerdi.
 */
export async function signOut(): Promise<{ error: string | null }> {
  // Push jetonu OTURUM KAPANMADAN silinir (14.14): silme ucu yetki ister — sıra ters kurulsaydı
  // istek 401 alır ve cihaz önceki hesabın kulağı olarak kalırdı (sunucudaki devir son emniyet).
  await releasePushRegistration();
  return endDeviceSession();
}

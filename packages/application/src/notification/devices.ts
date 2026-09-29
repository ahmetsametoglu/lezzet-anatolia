import { PushDeviceService } from '@lezzet/database';
import type { PushApp, PushPlatform } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

// Profil kimliği her zaman guard'dan gelir. İstemciden gelen tek şey jetondur ve o bir yetki olduğu için hiçbir uçtan geri okutulmaz.

/**
 * Uygulama her açılışta izin durumunu da raporlar: izni kapalı cihazın jetonu canlı kalır ve Expo "gönderdim" der, bu yüzden o cihaz
 * gönderilebilir listesinden düşer.
 */
export async function registerPushDevice(
  db: SupabaseClient,
  input: { profileId: string; token: string; platform: PushPlatform; app: PushApp; enabled: boolean },
): Promise<void> {
  await new PushDeviceService(db).register(input);
}

/**
 * Çıkışın zorunlu adımı, yoksa önceki hesabın bildirimi sonraki oturum sahibine düşer. Cihaz bu arada devrolduysa silmez ve `false`
 * döner; çıkış idempotenttir.
 */
export function unregisterPushDevice(db: SupabaseClient, input: { profileId: string; token: string }): Promise<boolean> {
  return new PushDeviceService(db).removeOwned(input.token, input.profileId);
}

/** Uygulama zorunlu, çünkü aynı kişinin operasyon uygulamasındaki jetonu müşteri bildirimini almaz. */
export async function listSendablePushTokens(db: SupabaseClient, profileId: string, app: PushApp): Promise<string[]> {
  return (await new PushDeviceService(db).listSendable(profileId, app)).map((device) => device.token);
}

import { PushDeviceService } from '@lezzet/database';
import { choosePushTargets, type PushTargets } from '@lezzet/domain-core';
import type { PushApp, PushPlatform, WebPushSubscription } from '@lezzet/types';
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

/** Tarayıcı izni verilmeden abonelik oluşmaz; kapatılan izin aboneliği de düşürür ve silme gönderimdeki 404/410 cevabına kalır. */
export async function registerWebPushSubscription(
  db: SupabaseClient,
  input: { profileId: string; subscription: WebPushSubscription; app: PushApp },
): Promise<void> {
  await new PushDeviceService(db).register({
    profileId: input.profileId,
    token: input.subscription.endpoint,
    platform: 'web',
    app: input.app,
    enabled: true,
    keys: input.subscription.keys,
  });
}

/**
 * Çıkışın zorunlu adımı, yoksa önceki hesabın bildirimi sonraki oturum sahibine düşer. Cihaz bu arada devrolduysa silmez ve `false`
 * döner; çıkış idempotenttir.
 */
export function unregisterPushDevice(db: SupabaseClient, input: { profileId: string; token: string }): Promise<boolean> {
  return new PushDeviceService(db).removeOwned(input.token, input.profileId);
}

/** Uygulama zorunlu, çünkü aynı kişinin operasyon uygulamasındaki jetonu müşteri bildirimini almaz. */
export async function listSendablePushTargets(db: SupabaseClient, profileId: string, app: PushApp): Promise<PushTargets> {
  return choosePushTargets(await new PushDeviceService(db).listSendable(profileId, app), new Date());
}

/** Taşıyıcının "abonelik yok" dediği adresler silinir, yoksa her haberde yeniden denenir ve HABER boşa gider. */
export async function prunePushTargets(db: SupabaseClient, tokens: readonly string[]): Promise<void> {
  const devices = new PushDeviceService(db);
  for (const token of tokens) await devices.pruneByToken(token);
}

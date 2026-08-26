import { PushDeviceService } from '@lezzet/database';
import type { PushPlatform } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  ── CİHAZ JETONU KAPISI (14.14) — push'un kayıt yarısı ──────────────────────────────────────────
  Sürücü (14.16) ve izin/yönlendirme (mobil şerit, 21.13) burada DEĞİL; burada yalnız üç soru:
  kim kaydoluyor, kim çıkıyor, kime gönderilebilir.

  `profileId` HER ZAMAN guard'dan (okuma kapısının aynı ilkesi). İstemciden gelen tek şey jetonun
  kendisi — ve o bir YETKİ olduğu için hiçbir uçtan geri okutulmaz.
*/

/**
 * **Kaydol/tazele** — uygulama her açılışta çağırır ve İZİN DURUMUNU da raporlar.
 *
 * İzin raporu kurgu incelemesinin 10. bulgusunun cevabı: OS'ta bildirimi kapatan kullanıcının
 * jetonu CANLI kalır, Expo "gönderdim" der, kimse görmez — sessiz kara delik. `enabled: false`
 * raporlanan cihaz gönderilebilir listesinden düşer ve kanal sırası maile iner.
 *
 * Çakışmada SAHİP DEVRİ (RPC): aile telefonunda A çıkar B girer — cihaz artık B'nin kulağı.
 */
export async function registerPushDevice(
  db: SupabaseClient,
  input: { profileId: string; token: string; platform: PushPlatform; enabled: boolean },
): Promise<void> {
  await new PushDeviceService(db).register(input);
}

/**
 * **Çıkış** — logout ucunun ZORUNLU adımı (14.14): jeton silinmezse önceki hesabın bildirimi
 * sonraki oturum sahibinin ekranına düşer. Sahiplik süzgeçli: cihaz bu arada devrolduysa eski
 * sahibin gecikmiş isteği yeni sahbin kaydını sökemez — `false` döner, hata değil (çıkış
 * idempotenttir).
 */
export function unregisterPushDevice(db: SupabaseClient, input: { profileId: string; token: string }): Promise<boolean> {
  return new PushDeviceService(db).removeOwned(input.token, input.profileId);
}

/** Gönderilebilir jetonlar — 14.16 sürücüsünün tek okuması (izni kapalı cihaz DIŞARIDA). */
export async function listSendablePushTokens(db: SupabaseClient, profileId: string): Promise<string[]> {
  return (await new PushDeviceService(db).listSendable(profileId)).map((device) => device.token);
}

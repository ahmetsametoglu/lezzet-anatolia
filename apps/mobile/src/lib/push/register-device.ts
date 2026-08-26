import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { registerPushDevice, removePushDevice } from '@/lib/api/notifications';
import { deviceStore, DEVICE_STORE_KEYS } from '@/lib/storage/device-store';

/*
  CİHAZ KAYDI (14.14'ün cihaz yarısı — 21.13). Sunucu tarafı hazırdı (uç + sahip devri + izin
  karası); burası jetonu ALIP oraya taşıyan yarım: kanal → izin → jeton → kayıt.

  ── SIRA ANDROID 13'ÜN ŞARTI (v57 dokümanı) ─────────────────────────────────
  İzin istemi ancak EN AZ BİR bildirim kanalı yaratıldıktan sonra çıkar — kanal önce, izin sonra.

  ── HER AÇILIŞTA, İZİN DURUMUYLA BİRLİKTE ───────────────────────────────────
  Kayıt bir kere değil her oturum başında tazelenir ve `enabled`ı raporlar: OS'ta bildirimi
  kapatan kullanıcının jetonu CANLI kalır ve Expo "gönderdim" der — sunucu `enabled:false` görünce
  cihazı gönderilebilir listesinden düşürür, sıra maile iner (sunucu künyesi).

  ── SESSİZ, AMA KÜNYELİ ─────────────────────────────────────────────────────
  Push bir HIZLANDIRICIDIR, tek kapı değil (zemin brief kuralı): jeton alınamadı diye uygulama
  açılışı aksatılmaz. İki bilinen "alınamaz" hâli var ve ikisi de meşru: Expo Go'da Android uzak
  bildirimi desteklemiyor (SDK 53+, dev build gerekir) ve EAS `projectId`si henüz yapılandırılmadı
  — ikisinde de `getExpoPushTokenAsync` fırlatır, kayıt sessizce atlanır ve uygulama içi zil
  (aynı satırların öteki kanalı) çalışmaya devam eder.
*/

/** İzin isteme + jeton alma + sunucuya yazma. Oturum AÇIKKEN çağrılır (hook karar verir). */
export async function ensurePushRegistration(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let permission = await Notifications.getPermissionsAsync();
    if (permission.status === 'undetermined') {
      permission = await Notifications.requestPermissionsAsync();
    }
    const enabled = permission.granted;

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const result = await registerPushDevice({ token, platform: Platform.OS, enabled });
    if (result.error === null) {
      // Çıkışta silinebilsin diye saklanır — jeton kalırsa önceki hesabın bildirimi sonrakine düşer.
      await deviceStore.setItem(DEVICE_STORE_KEYS.pushToken, token);
    }
  } catch {
    // Bilinçli sessiz (künye yukarıda): Expo Go / projectId'siz ortamda jeton alınamaz ve bu bir
    // arıza değil, ortamın kendisidir. Uygulama içi zil aynı satırları zaten taşıyor.
  }
}

/**
 * Çıkışın push adımı — `signOut` supabase oturumunu KAPATMADAN ÖNCE çağırır: silme ucu yetki
 * ister ve oturum kapandıktan sonra istek atılamaz. Sunucudaki sahip devri son emniyettir; ilk
 * emniyet bu silmedir (14.14 kararı).
 */
export async function releasePushRegistration(): Promise<void> {
  try {
    const token = await deviceStore.getItem(DEVICE_STORE_KEYS.pushToken);
    if (token === null) return;
    await removePushDevice(token);
    await deviceStore.removeItem(DEVICE_STORE_KEYS.pushToken);
  } catch {
    // Çıkış asla yarım kalmaz (sign-out künyesi) — jeton silinemese de oturum kapanır; sunucu
    // tarafındaki devir, cihaz başka hesaba geçtiğinde yanlış alıcıyı zaten keser.
  }
}

import { Platform } from 'react-native';
import type { PushApp } from '@lezzet/types';

import { registerPushDevice, removePushDevice } from '../api/notifications';
import { deviceStore, DEVICE_STORE_KEYS } from '../storage/device-store';
import { pushNative } from './native-module';

/*
  Cihaz kaydı: kanal → izin → jeton → sunucu, her oturum başında ve izin durumuyla birlikte (kapalı izinli cihaz gönderilebilir
  sayılmaz). Kanal önce kurulur, çünkü Android 13 izin istemini ancak en az bir kanal varken gösterir.
*/

/*
  Jeton alınamazsa kayıt sessizce atlanır: Expo Go'da Android uzak bildirimi yok, proje kimliksiz ortamda `getExpoPushTokenAsync`
  fırlatır. İkisi de arıza değil ortamın kendisidir ve uygulama içi zil aynı satırları taşımaya devam eder.
*/

/** Oturum açıkken çağrılır; `app` jetonun geldiği native uygulamadır, sunucu müşteri gönderiminde yalnız `customer` jetonlarını okur. */
export async function ensurePushRegistration(app: PushApp): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  // Modül derlemede yoksa kayıt hiç denenmez; statik import bu dosyayı açılış zincirinde patlatıp uygulamayı açtırmıyordu.
  const Notifications = pushNative();
  if (!Notifications) return;

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
    const result = await registerPushDevice({ token, platform: Platform.OS, app, enabled });
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
 * Çıkışın push adımı: `signOut` oturumu kapatmadan önce çağırır, çünkü silme ucu yetki ister. Sunucudaki sahip devri son emniyettir,
 * ilk emniyet bu silmedir.
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

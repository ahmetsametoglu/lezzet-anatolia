import { DEVICE_STORE_KEYS, deviceStore } from '../storage/device-store';

/*
  Oturum deposu — access+refresh token cihazda YALNIZ SecureStore'da durur (iOS Keychain /
  Android Keystore; AsyncStorage düz metindir, oturum oraya yazılmaz — 02-mimari §4). Depoya
  erişim `lib/storage/device-store` üzerinden: anahtar ailesinin sahibi ve yeniden kurulum
  kapısı orada (silinen uygulamanın Keychain artığı yeni kuruluma sızmasın).

  Tokenlar TEK anahtar altında yaşar: supabase-js oturumu (access + refresh + süre alanları)
  tek JSON olarak bu anahtara yazar. İki ayrı anahtara bölmek aynı verinin ikinci bir kopyasını
  ve iki kaynağın ayrışma riskini doğururdu (CLAUDE §1 duplikasyon yasağı).

  Bilinen sınır: SecureStore, Android'de 2048 bayt üstü değerde UYARI verir (değer yine yazılır).
  Supabase oturum JSON'u `user` gövdesiyle bu sınırı aşabilir — bugün bilinçli kabul; sorun
  üretirse çare şifreli-anahtar + dosya deseni olur, kapı tek dosya olduğu için tek yerden değişir.
*/

/** SecureStore anahtarı — supabase-js `storageKey` olarak bunu kullanır. */
export const AUTH_STORAGE_KEY = DEVICE_STORE_KEYS.authSession;

/**
 * supabase-js'in beklediği storage sözleşmesi = `deviceStore`un şekli (getItem/setItem/removeItem).
 * Araya ikinci bir köprü konmadı: adı eşleyen bir sarmalayıcı, kopyanın ta kendisi olurdu.
 */
export const secureStoreAdapter = deviceStore;

/** Çıkışın deterministik temizliği — supabase temizliği başarısız olsa da depo kesin boşalır. */
export async function clearStoredSession(): Promise<void> {
  await deviceStore.removeItem(AUTH_STORAGE_KEY);
}

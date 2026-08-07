import * as SecureStore from 'expo-secure-store';

/*
  Oturum deposu — access+refresh token cihazda YALNIZ SecureStore'da durur (iOS Keychain /
  Android Keystore; AsyncStorage düz metindir, oturum oraya yazılmaz — 02-mimari §4).

  Tokenlar TEK anahtar altında yaşar: supabase-js oturumu (access + refresh + süre alanları)
  tek JSON olarak bu anahtara yazar. İki ayrı anahtara bölmek aynı verinin ikinci bir kopyasını
  ve iki kaynağın ayrışma riskini doğururdu (CLAUDE §1 duplikasyon yasağı).

  Bilinen sınır: SecureStore, Android'de 2048 bayt üstü değerde UYARI verir (değer yine yazılır).
  Supabase oturum JSON'u `user` gövdesiyle bu sınırı aşabilir — bugün bilinçli kabul; sorun
  üretirse çare şifreli-anahtar + dosya deseni olur, adapter tek dosya olduğu için tek yerden değişir.
*/

/** SecureStore anahtarı — supabase-js `storageKey` olarak bunu kullanır. */
export const AUTH_STORAGE_KEY = 'lezzet.auth.session';

/**
 * supabase-js'in beklediği storage sözleşmesi → SecureStore köprüsü.
 * İnce adaptör: anlam katmaz, yalnız API adlarını eşler (taşıma katmanı adaptörü — 02-mimari §3 istisnası).
 */
export const secureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key);
  },
};

/** Çıkışın deterministik temizliği — supabase temizliği başarısız olsa da depo kesin boşalır. */
export async function clearStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
}

import { UnistylesRuntime } from 'react-native-unistyles';
import { z } from 'zod';

import { mapTextStops } from '@/theme/parse';
import { lightTheme, operationsTheme } from '@/theme/unistyles';

import { DEVICE_STORE_KEYS, deviceStore } from '../storage/device-store';

/*
  YAZI BOYUTU AYARI (kullanıcı kararı 09.08) — müşteri yazıları büyütüp küçültebilsin: seçim
  onboarding'in yeni adımında yapılır, Hesabım'dan da değiştirilir; cihazda kalıcıdır.

  ÖLÇEK YALNIZ YAZI DURAKLARINA uygulanır: `theme.text` içinde adı `--` İÇERMEYEN anahtarlar
  boyut duraklarıdır (note, micro, body-sm…); `--` içerenler alt-özelliktir (font-weight,
  line-height, letter-spacing) ve ÇARPILMAZ — ağırlık da sayı tutulduğu için (parse künyesi)
  "tüm sayıları çarp" 700'ü 805 yapardı. Boşluk/ölçü katmanı (`space`, `size`) bilerek
  ölçeklenmez: ayar yazıyı büyütür, sayfanın iskeletini değil.

  UYGULAMA `UnistylesRuntime.updateTheme` ile ve HER ZAMAN BAZDAN çarparak yapılır (temanın
  içindeki güncel değerden değil) — art arda seçimlerde çarpan birikmez.
*/

/** Depo anahtarı — ham dizge burada YAZILMAZ, `lezzet.*` ailesinin sahibinden gelir. */
const STORE_KEY = DEVICE_STORE_KEYS.fontScale;

export const FONT_SCALES = ['small', 'normal', 'large'] as const;
const FontScaleSchema = z.enum(FONT_SCALES);
export type FontScale = z.infer<typeof FontScaleSchema>;

/** Çarpanlar parametrik ve tek yerde — %90 · %100 · %115 (büyük adım, gözle seçilir fark). */
const FACTOR: Record<FontScale, number> = { small: 0.9, normal: 1, large: 1.15 };

/** Seçimi iki temaya birden uygular — operasyon yüzeyi de aynı gözle okusun. */
export function applyFontScale(scale: FontScale): void {
  const factor = FACTOR[scale];
  /* "Hangi anahtar boyut durağıdır" kuralı `theme/parse`ta, TEK yerde (18.08): müşteri teması
     kuruluşta bir kademe eklerken de aynı kuralı kullanıyor. Burada ikinci bir kopya vardı;
     yeni bir alt-özellik soneki doğduğu gün ikisinden biri onu tanımayacaktı (CLAUDE §1). */
  // Güncelleyici parametresi BİLEREK kullanılmıyor: dönen nesne her seferinde BAZ temadan kurulur
  // (birikme yok) ve tip, birleşim yerine ilgili temanın kendisiyle birebir oturur.
  UnistylesRuntime.updateTheme('light', () => ({
    ...lightTheme,
    text: mapTextStops(lightTheme.text, (size) => size * factor),
  }));
  UnistylesRuntime.updateTheme('operations', () => ({
    ...operationsTheme,
    text: mapTextStops(operationsTheme.text, (size) => size * factor),
  }));
}

/** Kayıtlı seçim; bozuk/boş kayıt = 'normal' (ilk açılış hâli). */
export async function readFontScale(): Promise<FontScale> {
  try {
    const raw = await deviceStore.getItem(STORE_KEY);
    const parsed = FontScaleSchema.safeParse(raw);
    return parsed.success ? parsed.data : 'normal';
  } catch {
    return 'normal';
  }
}

/** Kaydet + anında uygula — çağıranın iki adımı ayrı ayrı bilmesi gerekmez. */
export async function saveFontScale(scale: FontScale): Promise<void> {
  applyFontScale(scale);
  try {
    await deviceStore.setItem(STORE_KEY, scale);
  } catch {
    // Kalıcılık düşerse seçim bu oturumda yine geçerli; sonraki açılış 'normal'e döner —
    // ayar kaybı okunur bir arıza, sessiz de olsa kırıcı değil (log altyapısı 01-teknoloji §9).
  }
}

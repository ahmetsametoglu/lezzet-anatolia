import {
  customerAppColors,
  customerAppGradient,
  customerAppRadius,
  customerAppShadow,
  customerAppText,
  customerColors,
  customerRadius,
  customerText,
} from '@lezzet/design-tokens';
import { StyleSheet } from 'react-native-unistyles';

import { parseLinearGradient } from './gradient';
import { appMetrics } from './metrics';
import { mapTokens } from './parse';

/*
  Unistyles teması — HER değer @lezzet/design-tokens'tan gelir; ham renk/ölçü buraya YAZILMAZ
  (envanter §0 kuralı mobilde de aynen geçerli, ölçü katmanının gerekçesi `metrics.ts`te).

  KOMPOZİSYON (02-mimari §3.6, kullanıcı kararı 07.08): tema "ortak taban + uygulama farkları"
  birleşimidir ve AYNI ADDAKİ ANAHTARDA UYGULAMA KAZANIR. Ayrım sonekle değil DOSYAYLA kurulu
  olduğu için burada tek bir yayma (spread) yeter; hangi değerin nereden geldiği paketin dosya
  sınırından okunur. Web'e sıfır etki: `customerApp*` ihraçlarını web hiç görmez.

  Müşteri vitrini TEK temalıdır (karanlık mod yalnız OPERASYON evreninde) — o yüzden yalnız
  `light` var. Operasyon teması, uygulamanın operasyon yüzeyi işiyle birlikte
  `operationsColors`/`operationsDarkColors`tan bağlanacak.
*/

/** 5 fark + 14 uygulamaya-yeni renk tabanın üstüne biner (`sand-300`, `star`, `error`, `scrim`…). */
const colors = { ...customerColors, ...customerAppColors } as const;

/** Uygulama kademeleri tabana eklenir; `eyebrow` üç alt-anahtarıyla birlikte uygulamadan gelir. */
const text = mapTokens({ ...customerText, ...customerAppText });

/** Resmî 4'lü set (rozet 12 · kontrol 16 · kart 20 · hap 22) tabanın `card`/`pill`ini ezer. */
const radius = mapTokens({ ...customerRadius, ...customerAppRadius });

/*
  GÖLGE — token dizgesi AYNEN tüketilir, ayrıştırılmaz. RN 0.76'dan beri `boxShadow` stil
  özelliği CSS söz dizimini iki platformda da (yeni mimari) aynı biçimde kabul ediyor; sert
  gölge (`3px 3px 0 ink`) böylece iOS'ta ve Android'de birebir aynı çiziliyor.

  `elevation` BİLEREK KULLANILMADI: Android'in elevation'ı gölgeyi BULANIKLAŞTIRIR, ofset ve
  renk almaz — v3'ün imzası olan kaydırılmış-keskin gölge onunla temsil edilemez (bulanık bir
  yaklaşıklık, tasarımın söylediği şey değildir). iOS'un `shadowOffset` + `shadowRadius:0`
  üçlüsü de tercih edilmedi: aynı görünümü ikinci bir dille ikinci kez tarif etmek olurdu ve
  Android tarafı yine açıkta kalırdı.
*/
const shadow = customerAppShadow;

/** CSS gradyan dizgesi → expo-linear-gradient prop'ları; çeviri `gradient.ts`te, tek yerde. */
const gradient = {
  photoTop: parseLinearGradient(customerAppGradient['photo-top']),
  photoBottom: parseLinearGradient(customerAppGradient['photo-bottom']),
} as const;

/*
  FONT AİLELERİ — token paketinin BİLİNÇLİ boşluğu: `customer.ts` "fontlar bilerek dışarıda…
  RN tarafı fontlarını kendi yükleyicisiyle kurar" diyor. Ad burada, TEK yerde durur ki
  yükleyici (expo-font + varlıklar; ayrı iş) geldiğinde tek dosya değişsin — 15 komponent değil.
  Yüklenene kadar RN sistem fontuna düşer.
*/
const font = {
  /** Başlık ailesi — Lora (tasarımda 88 kullanım; yalnız başlık ve ürün adı). */
  display: 'Lora',
  /** Metin ailesi — Karla (gövde, etiket, düğme, rozet). */
  body: 'Karla',
} as const;

/** Test tarafı bağlantı kanıtı için de ihraç edilir (`unistyles.test.ts`). */
export const lightTheme = {
  colors,
  text,
  radius,
  shadow,
  gradient,
  font,
  ...appMetrics,
} as const;

const appThemes = {
  light: lightTheme,
} as const;

type AppThemes = typeof appThemes;

declare module 'react-native-unistyles' {
  // Unistyles'ın tip sözleşmesi: tema haritası module augmentation ile bildirilir (unistyl.es/v3).
  // Gövdesiz interface bilinçli — üyeler AppThemes'ten gelir, elle tekrar yazılmaz (CLAUDE §1).
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({
  themes: appThemes,
  settings: {
    initialTheme: 'light',
  },
});

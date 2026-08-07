import { customerColors, customerRadius, customerText } from '@lezzet/design-tokens';
import { StyleSheet } from 'react-native-unistyles';

/*
  Unistyles teması — HER değer @lezzet/design-tokens'tan gelir, ham değer buraya YAZILMAZ
  (envanter §0 kuralı mobilde de aynen geçerli). Paket değerleri bilerek CSS dizgesidir
  ("18px", "1.15", "0.12em"); birim çevirisi tüketicinin işi — buradaki eşleme YORUM KATMAYAN
  mekanik çeviridir: px → sayı (dp), birimsiz sayı dizgesi → sayı, gerisi olduğu gibi kalır.

  Müşteri vitrini TEK temalıdır (envanter kuralı: karanlık mod yalnız OPERASYON evreninde) —
  o yüzden yalnız `light` var ve adaptiveThemes kapalı. Operasyon teması, uygulamanın operasyon
  yüzeyi işiyle birlikte `operationsColors`/`operationsDarkColors`tan bağlanacak.
*/

/** "52px" → 52 · "1.15" → 1.15 · "600" → 600 · "0.12em" → olduğu gibi (em çevirisi yazı boyu bağlamı ister). */
const parseToken = (value: string): number | string => {
  if (value.endsWith('px')) return Number(value.slice(0, -2));
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? value : asNumber;
};

const mapTokens = <T extends Record<string, string>>(tokens: T): { readonly [K in keyof T]: number | string } =>
  Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, parseToken(value)])) as {
    readonly [K in keyof T]: number | string;
  };

/** Test tarafı bağlantı kanıtı için de ihraç edilir (`unistyles.test.ts`). */
export const lightTheme = {
  colors: customerColors, // hex dizgeleri RN'de olduğu gibi geçerlidir, çeviri gerekmez
  text: mapTokens(customerText),
  radius: mapTokens(customerRadius),
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

import { StyleSheet } from 'react-native-unistyles';

// BEKLEYEN(21.3): gerçek token seti design-tokens paketinden gelecek — ham değer buraya YAZILMAZ.
// İskelet yalnız kayıt/tip köprüsünü kurar; 21.3 tema gövdesini design-tokens'tan doldurur.
const baseTheme = {} as const;

const appThemes = {
  light: baseTheme,
  dark: baseTheme,
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
    // Cihaz temasını izle — app.json `userInterfaceStyle: automatic` ile aynı karar.
    adaptiveThemes: true,
  },
});

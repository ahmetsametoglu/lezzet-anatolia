import type { CarrierTone } from '@lezzet/helper';
import { StyleSheet } from 'react-native-unistyles';

/** Taşıyıcı renginin zemini: token adları web'le ortak (`CARRIER_TONES`), renk temadan; kart, harita ve lejant buradan okur. */
export const carrierToneStyles = StyleSheet.create((theme) => ({
  'brand-google': { backgroundColor: theme.colors['brand-google'] },
  terracotta: { backgroundColor: theme.colors.terracotta },
  star: { backgroundColor: theme.colors.star },
  'olive-light': { backgroundColor: theme.colors['olive-light'] },
})) satisfies Record<CarrierTone, unknown>;

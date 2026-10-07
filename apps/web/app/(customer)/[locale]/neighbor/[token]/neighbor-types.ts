import type { NeighborWelcome } from '@lezzet/application';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type neighborCopy from '@lezzet/i18n/customer/neighbor';
import type messages from './messages.json';

/** Ekranın native'le ortak metni. */
export type NeighborCopy = LocalizedCopy<typeof neighborCopy>;
/** Yalnız web'in metni: sayfa künyesi ve masaüstünün iki çağrısı. */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Daveti kabul eden ziyaretçinin gideceği yer: serbest bir yol değil, sabit seçenekler, çünkü hedef sunucu eylemine istemciden
 * geliyor ve açık uçlu olsaydı sayfa bir açık yönlendirme kapısı olurdu. Masaüstü sepete ya da kataloğa, telefon native gibi
 * kataloğa ya da girişe gönderir.
 */
export type NeighborTarget = 'catalog' | 'cart' | 'login';

export interface NeighborViewProps {
  locale: Locale;
  token: string;
  welcome: NeighborWelcome;
  copy: NeighborCopy;
  /** Masaüstünün iki çağrısı. */
  desktop: Messages['desktop'];
}

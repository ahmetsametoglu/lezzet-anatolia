import type { Locale } from '@lezzet/i18n';
import type { Country, DeliveryAreaList } from '@lezzet/types';

/** İki görünümün ortak sözleşmesi: liste sunucuda okunur, kod kartı istemcide canlı sorar. */
export interface DeliveryZonesViewProps {
  locale: Locale;
  areas: DeliveryAreaList['areas'];
  /** Kargonun gittiği ülkeler; boşsa kapanış cümlesi ülkesiz kurulur. */
  shippingCountries: Country[];
}

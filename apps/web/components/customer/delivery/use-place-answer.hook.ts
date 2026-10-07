'use client';

import { useState } from 'react';
import { CountryEnum, type Address, type Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { useToast } from '@/components/customer/ui/toast';
import { useDeliveryPlace } from './place-context';
import { lookupMessage, usePlaceLookup } from './place-lookup';
import { useMyAddresses } from './use-my-addresses.hook';
import messages from './place-messages.json';

/*
  Masaüstü yer panelinin iki cevabı: "Göster" de adres kartına dokunmak da soruyu kapatır ve bildirim çıkarır, cevap yer hapında okunur.
  Telefon çekmecesi native'in akışını izlediği için ayrı kancadadır (`usePostalCodeDraft`).
*/

/** Ziyaretçinin cevabı: önce ülke, sonra posta kodu; panel öneri listesi çekmez. */
export function usePlaceCodeEntry(locale: Locale) {
  const t = messages[locale];
  const { place, setPanelOpen } = useDeliveryPlace();
  const notify = useToast();
  const [country, setCountry] = useState<Country>(place?.country ?? 'FR');
  const state = usePlaceLookup(locale, {
    country,
    suggest: false,
    onResolved: (resolved) => {
      setPanelOpen(false);
      notify(t.toastPlace.replace('{channel}', resolved.inRoute ? t.channelDoor : t.channelShip));
    },
  });
  return {
    country,
    setCountry,
    /** Seçim kutusunun seçenekleri — hizmet ülkeleri (FR · DE), şemanın kendi listesi. */
    countries: CountryEnum.options.map((code) => ({ value: code, label: code === 'DE' ? t.countryDE : t.countryFR })),
    state,
    /** Tek satırlık sorun — biçim, arıza ya da çözülemeyen hâl; yoksa `null`. */
    problem: lookupMessage(state, t),
  };
}

/** Girişli müşterinin cevabı: kayıtlı adreslerinden biri. Seçmek = teslimat adresi yapmak. */
export function useAddressPick(locale: Locale) {
  const t = messages[locale];
  const { setPanelOpen } = useDeliveryPlace();
  const notify = useToast();
  const { addresses, failed, busy, current, choose } = useMyAddresses();
  const [pickFailed, setPickFailed] = useState(false);

  const pick = async (row: Address) => {
    if (!(await choose(row.id))) return setPickFailed(true);
    setPanelOpen(false);
    notify(t.toastAddress.replace('{name}', row.label || row.city));
  };

  return {
    addresses,
    failed: failed || pickFailed,
    busy,
    current,
    pick,
  };
}

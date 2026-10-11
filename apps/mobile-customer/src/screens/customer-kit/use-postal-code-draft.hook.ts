import { useEffect, useState } from 'react';
import { maskPostalCode, POSTAL_CODE_LENGTH } from '@lezzet/address';
import type { Country } from '@lezzet/types';

import { usePlaceLookup } from '@/lib/places/use-place-resolution.hook';
import { usePostalSuggest } from './use-postal-suggest.hook';

/** Aynı kod iki ülkede geçerli olabildiği için öneri satırının kimliği ikilidir. */
const suggestionKey = (country: string, postalCode: string) => `${country}:${postalCode}`;

/**
 * Posta kodu taslağı: kod ve ülke yazılırken yer canlı çözülür, kayıt çağıranın işidir. Öneri yalnız eksik kodda açılır, çünkü beş
 * haneden sonra soruyu yer çözümü cevaplar; `active` her doğru oluşunda taslak saklı değere döner ki yarım düzenleme taşınmasın.
 */
export function usePostalCodeDraft(code: string | null, country: Country | null, active: boolean) {
  const [draft, setDraft] = useState(code ?? '');
  const [selectedCountry, setSelectedCountry] = useState<Country>(country ?? 'FR');
  const [suggestOpen, setSuggestOpen] = useState(false);
  useEffect(() => {
    if (active) {
      setDraft(code ?? '');
      setSelectedCountry(country ?? 'FR');
      setSuggestOpen(false);
    }
  }, [code, country, active]);
  const options = usePostalSuggest(draft, { enabled: active && suggestOpen });

  const type = (value: string) => {
    const masked = maskPostalCode(value);
    setDraft(masked);
    setSuggestOpen(masked.length < POSTAL_CODE_LENGTH);
  };

  // Seçim kodu ülkesiyle birlikte doldurur, çünkü aynı kod iki ülkede de bulunabilir.
  const pick = (id: string) => {
    const picked = options.find((option) => suggestionKey(option.country, option.postalCode) === id);
    if (picked === undefined) return;
    setSuggestOpen(false);
    setDraft(picked.postalCode);
    setSelectedCountry(picked.country);
  };

  /* Bekleyiş bayrağı kancadan gelir, türetilmez: `place === null` düşen isteği de kapsar ve türetilmiş bayrak orada sönmezdi. */
  const { place, pending } = usePlaceLookup(draft, selectedCountry);

  return {
    draft,
    type,
    country: selectedCountry,
    setCountry: setSelectedCountry,
    suggestOpen,
    suggestions: options.map((option) => ({
      id: suggestionKey(option.country, option.postalCode),
      title: `${option.postalCode} · ${option.country}`,
      // Ad yoksa alt satır çizilmez; uydurulacak ad yok.
      subtitle: option.places.length === 0 ? undefined : option.places.join(', '),
    })),
    pick,
    place,
    pending,
  };
}

export type PostalCodeDraft = ReturnType<typeof usePostalCodeDraft>;

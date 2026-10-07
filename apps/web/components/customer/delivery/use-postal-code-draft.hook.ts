'use client';

import { useEffect, useState } from 'react';
import { maskPostalCode, POSTAL_CODE_LENGTH } from '@lezzet/address';
import type { Country } from '@lezzet/types';
import { usePostalSuggest } from '@/lib/address/use-postal-suggest.hook';
import { resolvePlaceAction } from '@/lib/delivery/actions';
import type { PlaceLookup } from '@/lib/delivery/place-types';
import { useDeliveryPlace } from './place-context';

/** Aynı kod iki ülkede geçerli olabildiği için öneri satırının kimliği ikilidir. */
const suggestionId = (country: Country, postalCode: string) => `${country}:${postalCode}`;

/**
 * Telefonun posta kodu çekmecesi native'in akışını izler: kod ve ülke yazılırken yer canlı çözülür ama sitenin yeri yalnız Kaydet'le
 * değişir. Öneri yalnız eksik kodda açılır, çünkü beş haneden sonra soruyu yer çözümü cevaplar.
 */
export function usePostalCodeDraft() {
  const { place, setPostalCode } = useDeliveryPlace();
  const [code, setCode] = useState(place?.postalCode ?? '');
  const [country, setCountry] = useState<Country>(place?.country ?? 'FR');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [answer, setAnswer] = useState<PlaceLookup | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const options = usePostalSuggest(code, { enabled: suggestOpen });

  useEffect(() => {
    setAnswer(null);
    if (code.length < POSTAL_CODE_LENGTH) {
      setPending(false);
      return;
    }
    let current = true;
    setPending(true);
    resolvePlaceAction(code, country)
      .then(({ data }) => {
        if (current) setAnswer(data);
      })
      // Düşen istek cevap yazmaz ve hâl "bilinmiyor" kalır: soru zorunlu değil, Kaydet yeri yeniden sorar.
      .catch(() => undefined)
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
    };
  }, [code, country]);

  const type = (value: string) => {
    const masked = maskPostalCode(value);
    setCode(masked);
    setSuggestOpen(masked.length < POSTAL_CODE_LENGTH);
  };

  const pick = (id: string) => {
    const picked = options.find((option) => suggestionId(option.country, option.postalCode) === id);
    if (!picked) return;
    setSuggestOpen(false);
    setCode(picked.postalCode);
    setCountry(picked.country);
  };

  /** `null` istek düştüğünde döner; çözülmeyen kodda yer korunur ve çekmece açık kalır, çünkü not nedenini zaten söylüyor. */
  const save = async (): Promise<PlaceLookup | null> => {
    setSaving(true);
    try {
      return await setPostalCode(code, country);
    } catch {
      // Arıza cümlesini çağıran gösterir; düğme kilitli kalmasın diye bekleyiş `finally`de söner.
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    code,
    type,
    country,
    setCountry,
    suggestOpen,
    suggestions: options.map((option) => ({
      id: suggestionId(option.country, option.postalCode),
      title: `${option.postalCode} · ${option.country}`,
      // Ad yoksa alt satır çizilmez; uydurulacak ad yok.
      subtitle: option.places.length === 0 ? undefined : option.places.join(', '),
    })),
    pick,
    answer,
    pending,
    saving,
    save,
  };
}

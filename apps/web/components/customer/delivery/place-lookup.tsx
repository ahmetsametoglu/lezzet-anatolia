'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { usePostalSuggest } from '@/lib/address/use-postal-suggest.hook';
import { isValidPostalCode, type DeliveryPlace, type PlaceLookup } from '@/lib/delivery/place-types';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

type Copy = (typeof messages)['tr'];

/*
  Yer sorusunun mantığı tek yerde, kabuklar (masaüstü panel, mobil web çekmece) yalnız çizer. Müşteri öneriden seçerek onaylar,
  çünkü elle yazılan kodda yanlış hane fark edilmez; ülke her satırda yazılıdır, çünkü aynı kod iki ülkede geçerli olabilir.
*/

interface PlaceLookupOptions {
  /** Verilirse kod bu ülkeye bağlanır. */
  country?: Country;
  /** Masaüstü paneli yalnız kod alır, öneri çekmez. */
  suggest?: boolean;
  /** Panel burada kapanır ve bildirim çıkarır. */
  onResolved?: (place: DeliveryPlace) => void;
}

export function usePlaceLookup(locale: Locale, { country: chosen, suggest = true, onResolved }: PlaceLookupOptions = {}) {
  const t = messages[locale];
  const { place, setPostalCode, clear } = useDeliveryPlace();
  const [value, setValue] = useState(place?.postalCode ?? '');
  /** Ekranın kuracağı cümlenin kaynağı; çözülünce `null`. */
  const [lookup, setLookup] = useState<PlaceLookup | null>(null);
  /** Biçim hatası, sunucuya gitmeden. */
  const [invalid, setInvalid] = useState(false);
  /** Gerçek arıza (ağ ya da veritabanı), hâllerden biri değil. */
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Son sorulan kod; öneri listesi cevaplanmış kodu tekrar önermesin. */
  const asked = useRef<string | null>(place?.postalCode ?? null);
  /** Cevap döndüğünde hâlâ son soru muyuz; kod ya da ülke değişince ilerler ve kilit hemen açılır. */
  const generation = useRef(0);

  // Ülke değişti: süren soru geçersiz, kilit ve cümle düşer.
  useEffect(() => {
    generation.current += 1;
    setBusy(false);
    setLookup(null);
    setInvalid(false);
    setFailed(false);
  }, [chosen]);

  // Cevaplanmış kod yeniden önerilmez.
  const suggestions = usePostalSuggest(value, { enabled: suggest && value !== asked.current });

  const submit = async (code: string, country: Country | undefined = chosen) => {
    if (!isValidPostalCode(code)) {
      setInvalid(true);
      return;
    }
    const mine = ++generation.current;
    setInvalid(false);
    setFailed(false);
    setBusy(true);
    let result: PlaceLookup | null;
    try {
      result = await setPostalCode(code, country);
    } catch {
      // İstek düştü: aşağıda genel arıza cümlesi çıkar ve kilit açılır, yoksa düğme bir daha basılamazdı.
      result = null;
    }
    // Bu arada kod ya da ülke değiştiyse cevap eski sorunundur, ekrana yazılmaz.
    if (mine !== generation.current) return;
    setBusy(false);
    asked.current = code;
    if (result === null) {
      setFailed(true);
      setLookup(null);
      return;
    }
    if (result.kind === 'resolved') {
      setLookup(null);
      onResolved?.(result.place);
      return;
    }
    setLookup(result);
  };

  const pick = (code: string, country: Country) => {
    setValue(code);
    void submit(code, country);
  };

  const reset = () => {
    generation.current += 1;
    setBusy(false);
    clear();
    setValue('');
    setLookup(null);
    asked.current = null;
  };

  const inputProps = {
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      // Kod değişti: süren soru geçersiz ve düğme hemen açılır.
      generation.current += 1;
      setBusy(false);
      setValue(e.target.value);
      setInvalid(false);
      setFailed(false);
      setLookup(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') void submit(value);
    },
    // Alan yer adı da kabul eder; tavan yapıştırılan metin alanı taşırmasın diye.
    maxLength: 40,
    placeholder: t.placeholder,
    // Liste açılır kutu değil akışta duran bir blok; `combobox` rolünün vaat ettiği klavye sözleşmesi burada yok.
    autoComplete: 'off',
  };

  return { place, value, submit, pick, reset, lookup, invalid, failed, busy, suggest, suggestions, inputProps };
}

type PlaceLookupState = ReturnType<typeof usePlaceLookup>;

/**
 * Harf yazan müşteriye "5 hane olmalı" denmez, listeden seçmesi söylenir; öneri listesi olmayan kabukta biçim cümlesi kalır. Arıza
 * "bulunamadı" değildir: biri bizim ulaşamadığımız, öteki kodun cevabı.
 */
export function lookupMessage(state: PlaceLookupState, t: Copy): string | null {
  if (state.invalid) return state.suggest && /\p{L}/u.test(state.value) ? t.pickFromList : t.invalid;
  if (state.failed) return t.failed;
  if (state.lookup?.kind === 'unknown') return t.unknownTitle;
  if (state.lookup?.kind === 'unresolved') return state.lookup.reason === 'no_shipping_warehouse' ? t.unresolvedShipTitle : t.unresolvedZoneTitle;
  if (state.lookup?.kind === 'ambiguous') return t.ambiguousTitle;
  return null;
}

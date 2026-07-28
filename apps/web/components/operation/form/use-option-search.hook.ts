'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * SEÇİCİLERİN ARAMA DAVRANIŞI — tekil (`Combobox`) ve çoklu (`MultiSelect`) seçici ortak kullanır.
 *
 * İki kip, tek sözleşme:
 * - **Senkron (yerel):** seçenekler elde; süzme burada, `match` ile yapılır.
 * - **Asenkron (uzak):** `onSearch` verilir; kaynak sunucudadır (katalog, müşteri listesi — veriyle
 *   büyüyen kümeler). Terim GECİKMELİ gider, sonuçları çağıran `options`'a koyar.
 *
 * Gecikme (debounce) burada yaşar. İki seçicide ayrı ayrı yazılsaydı biri 300 ms, öteki 500 ms olur
 * ve aynı ekranda iki farklı "yazma hissi" doğardı; üçüncü bir seçici geldiğinde de kimse hangisini
 * kopyalayacağını bilemezdi.
 *
 * Uzak kipte YEREL SÜZME YAPILMAZ: sunucu eşleşmeyi zaten buldu ve ölçütü daha geniş olabilir
 * (telefonla bulunan müşteri, etiketinde o rakamlar geçmez) — burada bir daha süzmek, sunucunun
 * bulduğunu gizlerdi.
 */

/** Uzak aramada tuş başına istek gitmesin. */
const SEARCH_DEBOUNCE_MS = 300;

interface OptionSearchParams<T> {
  options: T[];
  /** Verilirse UZAK kip. */
  onSearch?: (term: string) => void;
  /** Yerel kipte eşleşme ölçütü. */
  match: (option: T, query: string) => boolean;
}

interface OptionSearch<T> {
  query: string;
  onQuery: (next: string) => void;
  /** Menü açılırken çağrılır: terim sıfırlanır, uzak kipte boş arama tetiklenir. */
  reset: () => void;
  visible: T[];
  remote: boolean;
}

export function useOptionSearch<T>({ options, onSearch, match }: OptionSearchParams<T>): OptionSearch<T> {
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remote = typeof onSearch === 'function';

  // Bileşen kapanırken bekleyen istek iptal: kapanmış bir seçicinin sonucu kimseye lazım değil.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const onQuery = (next: string) => {
    setQuery(next);
    if (!remote) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(next), SEARCH_DEBOUNCE_MS);
  };

  const reset = () => {
    setQuery('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (remote) onSearch('');
  };

  const q = query.trim().toLowerCase();
  const visible = remote || !q ? options : options.filter((o) => match(o, q));

  return { query, onQuery, reset, visible, remote };
}

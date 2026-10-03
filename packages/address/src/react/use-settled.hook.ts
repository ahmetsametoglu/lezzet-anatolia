import { useEffect, useState } from 'react';

/** Kelimeler arası duraklamanın üstünde, bekleyişin sezilmeyeceği sınırın altında. */
const SETTLE_MS = 1500;

/**
 * Değer `ms` boyunca değişmeden kaldıysa `true`, değiştiği an `false`. Arama boş dönse de müşteri hâlâ yazıyorsa yarım adrese
 * "bulunamadı" denmesin diye.
 */
export function useSettled(value: string, ms: number = SETTLE_MS): boolean {
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled === value;
}
